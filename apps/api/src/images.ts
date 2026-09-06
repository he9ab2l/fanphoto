import { ApiError } from './errors'
export function webpSize(bytes: ArrayBuffer): { width: number; height: number } {
  const data = new Uint8Array(bytes)
  const view = new DataView(bytes)
  const str = (at: number, size: number) => String.fromCharCode(...data.slice(at, at + size))
  const bad = () => {
    throw new ApiError(415, 'INVALID_IMAGE', '请上传重新编码后的有效 WebP 图片')
  }
  if (
    data.length < 20 ||
    str(0, 4) !== 'RIFF' ||
    str(8, 4) !== 'WEBP' ||
    view.getUint32(4, true) + 8 !== data.length
  )
    return bad()
  let result: { width: number; height: number } | null = null
  let images = 0
  for (let at = 12; at < data.length;) {
    if (at + 8 > data.length) return bad()
    const kind = str(at, 4),
      length = view.getUint32(at + 4, true),
      start = at + 8
    if (start + length > data.length || !['VP8 ', 'VP8L', 'VP8X', 'ALPH'].includes(kind))
      return bad()
    if (kind === 'VP8X' && (length !== 10 || data[start] & 0x2e)) return bad()
    if (kind === 'VP8 ') {
      if (length < 10 || str(start + 3, 3) !== '\x9d\x01\x2a') return bad()
      result = {
        width: view.getUint16(start + 6, true) & 0x3fff,
        height: view.getUint16(start + 8, true) & 0x3fff,
      }
      images++
    }
    if (kind === 'VP8L') {
      if (length < 5 || data[start] !== 0x2f) return bad()
      const bits = view.getUint32(start + 1, true)
      result = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      images++
    }
    at = start + length + (length % 2)
    if (at > data.length) return bad()
  }
  if (!result || images !== 1 || !result.width || !result.height) return bad()
  return result
}
export function videoMime(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes)
  const text = new TextDecoder('ascii').decode(data.slice(4, 12))
  if (data.length < 24 || !text.startsWith('ftyp'))
    throw new ApiError(415, 'INVALID_VIDEO', '仅支持配对的 MOV / MP4 实况片段')
  return text.slice(4).startsWith('qt') ? 'video/quicktime' : 'video/mp4'
}
// Preserve atom lengths and media offsets, but remove user/location metadata.
export function sanitizeVideo(input: ArrayBuffer): ArrayBuffer {
  videoMime(input)
  const bytes = new Uint8Array(input.slice(0)),
    view = new DataView(bytes.buffer)
  const containers = new Set([
    'moov',
    'trak',
    'mdia',
    'minf',
    'stbl',
    'edts',
    'dinf',
    'mvex',
    'moof',
    'traf',
  ])
  const visit = (start: number, end: number, depth = 0) => {
    if (depth > 12) throw new ApiError(415, 'INVALID_VIDEO', '视频容器嵌套过深')
    for (let at = start; at < end;) {
      if (at + 8 > end) throw new ApiError(415, 'INVALID_VIDEO', '视频容器不完整')
      let size = view.getUint32(at),
        header = 8
      if (size === 1) {
        if (at + 16 > end) throw new ApiError(415, 'INVALID_VIDEO', '视频容器不完整')
        const extended = view.getBigUint64(at + 8)
        if (extended > BigInt(end - at)) throw new ApiError(415, 'INVALID_VIDEO', '视频长度无效')
        size = Number(extended)
        header = 16
      }
      if (size === 0) size = end - at
      if (size < header || at + size > end) throw new ApiError(415, 'INVALID_VIDEO', '视频长度无效')
      const type = String.fromCharCode(...bytes.slice(at + 4, at + 8))
      if (['udta', 'meta', 'uuid', 'loci', '\u00a9xyz'].includes(type)) {
        bytes.set([102, 114, 101, 101], at + 4)
        bytes.fill(0, at + header, at + size)
      } else if (containers.has(type)) visit(at + header, at + size, depth + 1)
      at += size
    }
  }
  visit(0, bytes.byteLength)
  return bytes.buffer
}
