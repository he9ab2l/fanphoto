/** Canvas output is explicitly sRGB. Strip auxiliary chunks without re-encoding pixels. */
export function cleanCanvasWebp(input: ArrayBuffer): ArrayBuffer {
  const source = new Uint8Array(input), view = new DataView(input)
  const typeAt = (offset: number) => String.fromCharCode(...source.slice(offset, offset + 4))
  if (source.length < 20 || typeAt(0) !== 'RIFF' || typeAt(8) !== 'WEBP' || view.getUint32(4, true) + 8 !== source.length) throw new Error('图片编码无效')
  const chunks: Uint8Array[] = []
  for (let offset = 12; offset < source.length;) {
    if (offset + 8 > source.length) throw new Error('图片编码不完整')
    const type = typeAt(offset), size = view.getUint32(offset + 4, true), end = offset + 8 + size + size % 2
    if (end > source.length) throw new Error('图片编码不完整')
    if (!['ICCP', 'EXIF', 'XMP '].includes(type)) {
      if (!['VP8 ', 'VP8L', 'VP8X', 'ALPH'].includes(type)) throw new Error('图片包含不支持的数据块')
      const chunk = source.slice(offset, end)
      if (type === 'VP8X') { if (size !== 10) throw new Error('图片尺寸信息无效'); chunk[8] &= ~0x2c }
      chunks.push(chunk)
    }
    offset = end
  }
  const output = new Uint8Array(12 + chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  output.set(source.slice(0, 12)); new DataView(output.buffer).setUint32(4, output.length - 8, true)
  let offset = 12
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
  return output.buffer
}
