import { createHash } from 'node:crypto'
import { rgbaToThumbHash } from 'thumbhash'
import {
  MAX_IMAGE_PIXELS,
  MAX_SOURCE_BYTES,
  variants,
  variantSizes,
  type Analysis,
} from '@fanphoto/contracts'
import { ApiError } from '../../core/errors'
import { extractMetadata } from './metadata'

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export const arrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

function sourceType(bytes: Uint8Array): { mime: string; extension: string } {
  const start = Buffer.from(bytes.subarray(0, 32))
  if (start[0] === 0xff && start[1] === 0xd8) return { mime: 'image/jpeg', extension: 'jpg' }
  if (start.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mime: 'image/png', extension: 'png' }
  if (start.toString('ascii', 0, 4) === 'RIFF' && start.toString('ascii', 8, 12) === 'WEBP')
    return { mime: 'image/webp', extension: 'webp' }
  if (
    ['49492a00', '4d4d002a', '49492b00', '4d4d002b'].includes(start.subarray(0, 4).toString('hex'))
  )
    return { mime: 'image/tiff', extension: 'tiff' }
  if (start.toString('ascii', 4, 8) === 'ftyp') {
    const brands = start.toString('ascii', 8)
    if (/avif|avis/.test(brands)) return { mime: 'image/avif', extension: 'avif' }
    if (/heic|heix|hevc|hevx|mif1/.test(brands)) return { mime: 'image/heic', extension: 'heic' }
  }
  throw new ApiError(415, 'UNSUPPORTED_IMAGE', '支持 JPEG、PNG、WebP、AVIF、TIFF、HEIC 原图')
}

function analyze(pixels: Uint8Array): Analysis {
  const bins = Array<number>(64).fill(0)
  const colors = new Map<string, number>()
  let sum = 0,
    squareSum = 0,
    count = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2]
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    bins[Math.min(63, Math.floor(luminance / 4))]++
    sum += luminance
    squareSum += luminance ** 2
    count++
    const key =
      '#' +
      [r, g, b]
        .map((v) =>
          Math.min(255, Math.round(v / 24) * 24)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    colors.set(key, (colors.get(key) || 0) + 1)
  }
  const mean = count ? sum / count : 0
  const brightness = (mean / 255) * 100
  const contrast = Math.min(
    100,
    (Math.sqrt(Math.max(0, squareSum / Math.max(1, count) - mean ** 2)) / 127.5) * 100,
  )
  const maximum = Math.max(1, ...bins)
  return {
    histogram: bins.map((v) => v / maximum),
    colors: colors.size
      ? [...colors]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([color]) => color)
      : ['#000000'],
    brightness,
    contrast,
    tone:
      contrast > 52
        ? 'high-contrast'
        : brightness < 32
          ? 'low-key'
          : brightness > 72
            ? 'high-key'
            : 'balanced',
  }
}

export async function processSource(input: Uint8Array) {
  if (!input.length || input.byteLength > MAX_SOURCE_BYTES)
    throw new ApiError(413, 'SOURCE_TOO_LARGE', '原文件不能超过 50 MB')
  const source = sourceType(input)
  const { default: sharp } = await import('sharp')
  sharp.cache({ memory: 32, files: 0, items: 32 })
  sharp.concurrency(1)
  let decoded = Buffer.from(input)
  const options = {
    limitInputPixels: MAX_IMAGE_PIXELS,
    failOn: 'error' as const,
    sequentialRead: true,
  }
  let metadata
  try {
    metadata = await sharp(decoded, options).metadata()
    if (source.mime === 'image/heic') {
      // Native distributions may only include AV1; libheif provides a real HEVC
      // decoder instead of requiring client-prepared thumbnails.
      try {
        await sharp(decoded, options).resize(1, 1).raw().toBuffer()
      } catch {
        const { default: convert } = await import('heic-convert')
        decoded = Buffer.from(await convert({ buffer: decoded, format: 'JPEG', quality: 1 }))
        metadata = await sharp(decoded, options).metadata()
      }
    }
  } catch (error) {
    if (String(error).includes('pixel limit'))
      throw new ApiError(413, 'PIXEL_LIMIT', '图片像素总量不能超过 8000 万')
    throw new ApiError(415, 'INVALID_IMAGE', '原图无法解码，请检查文件是否完整')
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS)
    throw new ApiError(413, 'PIXEL_LIMIT', '图片尺寸无效或超过 8000 万像素')
  if ((metadata.pages || 1) > 1 && source.mime !== 'image/heic')
    throw new ApiError(415, 'ANIMATED_IMAGE', '请将动画或多页图片导出为单张照片')
  const extracted = await extractMetadata(input)
  const rotated = (metadata.orientation || 1) >= 5
  const width = rotated ? metadata.height : metadata.width
  const height = rotated ? metadata.width : metadata.height
  const assets = []
  try {
    for (const variant of variants) {
      const cap = variant === 'original' ? 16380 : variantSizes[variant]
      const output = await sharp(decoded, options)
        .rotate()
        .resize(cap, cap, { fit: 'inside', withoutEnlargement: true })
        .toColourspace('srgb')
        .webp({ quality: variant === 'original' ? 94 : 84, effort: 4 })
        .timeout({ seconds: 40 })
        .toBuffer({ resolveWithObject: true })
      assets.push({
        variant,
        data: output.data,
        width: output.info.width,
        height: output.info.height,
        mime: 'image/webp',
        checksum: sha256(output.data),
      })
    }
  } catch {
    throw new ApiError(415, 'PROCESSING_FAILED', '图片处理失败，请尝试重新导出这张照片')
  }
  const sample = await sharp(assets[0].data)
    .resize(64, 64, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    source: { ...source, width, height, bytes: input.byteLength, hash: sha256(input) },
    ...extracted,
    assets,
    width: assets[0].width,
    height: assets[0].height,
    hasAlpha: !!metadata.hasAlpha,
    colorSpace: metadata.space || 'unknown',
    thumbHash: Buffer.from(
      rgbaToThumbHash(sample.info.width, sample.info.height, sample.data),
    ).toString('base64'),
    analysis: analyze(sample.data),
  }
}
