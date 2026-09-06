import exifr from 'exifr'
import { rgbaToThumbHash } from 'thumbhash'
import {
  cleanCanvasWebp,
  exifSchema,
  MAX_SOURCE_BYTES,
  variantSizes,
  variants,
  type Analysis,
  type UploadMeta,
} from '@fanphoto/shared'
export interface ImageOptions {
  albumIds: string[]
  tags: string[]
  published: boolean
  eraseLocation: boolean
  watermark: string
}
export const acceptedImages = '.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.tif,.tiff'
export function analyzePixels(pixels: Uint8ClampedArray): Analysis {
  const bins = Array(64).fill(0) as number[],
    colors = new Map<number, { n: number; r: number; g: number; b: number }>()
  let sum = 0,
    squared = 0,
    count = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2],
      y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    bins[Math.min(63, Math.floor(y / 4))]++
    sum += y
    squared += y * y
    count++
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5),
      entry = colors.get(key) || { n: 0, r: 0, g: 0, b: 0 }
    entry.n++
    entry.r += r
    entry.g += g
    entry.b += b
    colors.set(key, entry)
  }
  count = Math.max(1, count)
  const brightness = (sum / count / 255) * 100,
    contrast = Math.min(
      100,
      (Math.sqrt(Math.max(0, squared / count - (sum / count) ** 2)) / 127.5) * 100,
    )
  const palette = [...colors.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map(
      (v) =>
        '#' +
        [v.r, v.g, v.b]
          .map((c) =>
            Math.round(c / v.n)
              .toString(16)
              .padStart(2, '0'),
          )
          .join(''),
    )
  return {
    colors: palette.length ? palette : ['#eceeea'],
    histogram: bins.map((n) => n / count),
    brightness,
    contrast,
    tone:
      brightness < 30
        ? 'low-key'
        : brightness > 75
          ? 'high-key'
          : contrast > 60
            ? 'high-contrast'
            : 'balanced',
  }
}
const canvas = (width: number, height: number) => {
  const node = document.createElement('canvas')
  node.width = width
  node.height = height
  node.getContext('2d', { colorSpace: 'srgb' })
  return node
}
const blob = (node: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    node.toBlob(
      (value) =>
        value && value.type === 'image/webp'
          ? resolve(value)
          : reject(new Error('浏览器不支持 WebP 编码')),
      'image/webp',
      quality,
    ),
  )
async function decode(file: Blob) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file),
      image = new Image()
    try {
      image.src = url
      await image.decode()
      return image
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}
export async function prepareImage(
  file: File,
  clientId: string,
  options: ImageOptions,
  signal: AbortSignal,
  progress: (value: number) => void,
): Promise<FormData> {
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error('每张照片最大 50 MB')
  if (!/\.(jpe?g|png|webp|avif|heic|heif|tiff?)$/i.test(file.name))
    throw new Error('暂不支持这个图片格式')
  signal.throwIfAborted()
  progress(5)
  const raw =
    (await exifr.parse(file, { gps: true, tiff: true, exif: true }).catch(() => null)) || {}
  const numeric = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
  const text = (value: unknown, max = 120) =>
    typeof value === 'string' ? value.slice(0, max) : undefined
  const exif = exifSchema.parse({
    make: text(raw.Make),
    model: text(raw.Model),
    lens: text(raw.LensModel, 180),
    iso: numeric(raw.ISO),
    aperture: numeric(raw.FNumber),
    exposureTime: numeric(raw.ExposureTime),
    focalLength: numeric(raw.FocalLength),
    focalLength35: numeric(raw.FocalLengthIn35mmFormat),
    artist: text(raw.Artist),
    copyright: text(raw.Copyright, 240),
    software: text(raw.Software),
  })
  let source: CanvasImageSource,
    width: number,
    height: number,
    converted: Blob = file
  if (/\.(heic|heif)$/i.test(file.name)) {
    const { default: heic2any } = await import('heic2any')
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
    converted = Array.isArray(result) ? result[0] : result
  }
  signal.throwIfAborted()
  progress(25)
  if (/\.tiff?$/i.test(file.name)) {
    const { default: UTIF } = await import('utif'),
      buffer = await file.arrayBuffer(),
      pages = UTIF.decode(buffer),
      page = pages[0]
    if (!page || Number(page.t256?.[0]) * Number(page.t257?.[0]) > 50_000_000)
      throw new Error('TIFF 无法解码或超过 5000 万像素')
    UTIF.decodeImage(buffer, page)
    width = page.width
    height = page.height
    const node = canvas(width, height)
    node
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(page)), width, height), 0, 0)
    source = node
  } else {
    const image = await decode(converted)
    source = image
    width = image instanceof HTMLImageElement ? image.naturalWidth : image.width
    height = image instanceof HTMLImageElement ? image.naturalHeight : image.height
  }
  if (!width || !height || width * height > 50_000_000) {
    if ('close' in source) (source as ImageBitmap).close()
    throw new Error('图片超过 5000 万像素，请先缩小')
  }
  const factor = Math.min(1, 2048 / Math.max(width, height)),
    outputWidth = Math.round(width * factor),
    outputHeight = Math.round(height * factor),
    master = canvas(outputWidth, outputHeight),
    ctx = master.getContext('2d')!
  try {
    ctx.drawImage(source, 0, 0, outputWidth, outputHeight)
    if (options.watermark.trim()) {
      const size = Math.max(14, Math.round(outputWidth / 50))
      ctx.font = `500 ${size}px sans-serif`
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,.8)'
      ctx.shadowColor = 'rgba(0,0,0,.55)'
      ctx.shadowBlur = 4
      ctx.fillText(options.watermark.slice(0, 60), outputWidth - size, outputHeight - size)
    }
    const analysisCanvas = canvas(
      Math.max(1, Math.round(outputWidth * Math.min(1, 256 / Math.max(outputWidth, outputHeight)))),
      Math.max(
        1,
        Math.round(outputHeight * Math.min(1, 256 / Math.max(outputWidth, outputHeight))),
      ),
    )
    analysisCanvas
      .getContext('2d')!
      .drawImage(master, 0, 0, analysisCanvas.width, analysisCanvas.height)
    const analysis = analyzePixels(
      analysisCanvas
        .getContext('2d')!
        .getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data,
    )
    const ratio = Math.min(1, 100 / Math.max(outputWidth, outputHeight)),
      hashCanvas = canvas(
        Math.max(1, Math.round(outputWidth * ratio)),
        Math.max(1, Math.round(outputHeight * ratio)),
      )
    hashCanvas.getContext('2d')!.drawImage(master, 0, 0, hashCanvas.width, hashCanvas.height)
    const thumbHash = btoa(
      String.fromCharCode(
        ...rgbaToThumbHash(
          hashCanvas.width,
          hashCanvas.height,
          hashCanvas.getContext('2d')!.getImageData(0, 0, hashCanvas.width, hashCanvas.height).data,
        ),
      ),
    )
    const latitude =
        typeof raw.latitude === 'number' &&
        Number.isFinite(raw.latitude) &&
        Math.abs(raw.latitude) <= 90
          ? raw.latitude
          : null,
      longitude =
        typeof raw.longitude === 'number' &&
        Number.isFinite(raw.longitude) &&
        Math.abs(raw.longitude) <= 180
          ? raw.longitude
          : null
    const taken =
      raw.DateTimeOriginal instanceof Date && Number.isFinite(raw.DateTimeOriginal.getTime())
        ? raw.DateTimeOriginal.toISOString()
        : null
    const meta: UploadMeta = {
      clientId,
      title: (
        text(raw.Title, 160) || file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ')
      ).slice(0, 160),
      description: '',
      width: outputWidth,
      height: outputHeight,
      takenAt: taken,
      latitude: latitude !== null && longitude !== null ? latitude : null,
      longitude: latitude !== null && longitude !== null ? longitude : null,
      location: '',
      exif,
      tags: options.tags,
      albumIds: options.albumIds,
      featured: false,
      published: options.published,
      eraseLocation: options.eraseLocation,
      thumbHash,
      analysis,
      sourceName: file.name.slice(0, 240),
    }
    const form = new FormData()
    form.set('meta', JSON.stringify(meta))
    for (const [index, variant] of variants.entries()) {
      signal.throwIfAborted()
      const scale = Math.min(1, variantSizes[variant] / Math.max(outputWidth, outputHeight)),
        node = canvas(
          Math.max(1, Math.round(outputWidth * scale)),
          Math.max(1, Math.round(outputHeight * scale)),
        )
      node.getContext('2d')!.drawImage(master, 0, 0, node.width, node.height)
      const encoded = await blob(node, variant === 'original' ? 0.9 : 0.83)
      const bytes = new Blob([cleanCanvasWebp(await encoded.arrayBuffer())], { type: 'image/webp' })
      form.set(variant, new File([bytes], `${variant}.webp`, { type: 'image/webp' }))
      node.width = node.height = 0
      progress(40 + (index + 1) * 15)
    }
    analysisCanvas.width = hashCanvas.width = 0
    return form
  } finally {
    master.width = master.height = 0
    if ('close' in source) (source as ImageBitmap).close()
    if (source instanceof HTMLCanvasElement) source.width = source.height = 0
  }
}
