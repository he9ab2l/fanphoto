/** Neutral-center RG lens field, following the local Liquid Glass patterns.
 * Rasterizing this small map once avoids nested SVG-image/filter decoding. */
export function glassDisplacementPixels(width: number, height: number, radius: number) {
  const w = Math.max(1, Math.min(640, Math.round(width)))
  const h = Math.max(1, Math.min(160, Math.round(height)))
  const r = Math.max(1, Math.min(radius, w / 2, h / 2))
  const band = Math.max(3, Math.min(12, h * 0.18))
  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2,
        dy = y + 0.5 - h / 2
      const qx = Math.abs(dx) - (w / 2 - r),
        qy = Math.abs(dy) - (h / 2 - r)
      const ox = Math.max(qx, 0),
        oy = Math.max(qy, 0)
      const length = Math.hypot(ox, oy)
      const distance = length + Math.min(Math.max(qx, qy), 0) - r
      const strength = distance <= 0 ? Math.max(0, 1 + distance / band) ** 2 : 0
      const nx = length ? (Math.sign(dx) * ox) / length : qx > qy ? Math.sign(dx) : 0
      const ny = length ? (Math.sign(dy) * oy) / length : qy >= qx ? Math.sign(dy) : 0
      const i = (y * w + x) * 4
      pixels[i] = 128 + nx * strength * 100
      pixels[i + 1] = 128 + ny * strength * 100
      pixels[i + 2] = 128
      pixels[i + 3] = 255
    }
  return { width: w, height: h, pixels }
}
export const withinGlassBudget = (width: number, height: number) =>
  width > 0 && height > 0 && width <= 640 && height <= 160 && width * height <= 60_000
