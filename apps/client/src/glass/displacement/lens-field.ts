/** Optical lens field. One rasterized RG displacement texture per surface size:
 * height field from the SDF rounded box, surface normals, center region with a
 * slight lens refraction and stronger refraction toward the rim (IOR ≈ 1.3–1.5
 * look). R = 128 + x displacement, G = 128 + y displacement. */
import { sdRoundedBox, sdfNormal } from './sdf'
import { cachedOrCompute } from './cache'

export interface LensField {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export const LENS_MAX_WIDTH = 640
export const LENS_MAX_HEIGHT = 160
export const LENS_BUDGET = 60_000

export const withinLensBudget = (width: number, height: number) =>
  width > 0 && height > 0 && width <= LENS_MAX_WIDTH && height <= LENS_MAX_HEIGHT &&
  width * height <= LENS_BUDGET

/** surface size (CSS px) → rasterized lens field data URL (LRU-cached). */
export function lensFieldDataUrl(
  width: number,
  height: number,
  radius: number,
  strength = 1,
): string | null {
  if (!withinLensBudget(width, height)) return null
  const key = `${width}:${height}:${Math.round(radius)}:${strength.toFixed(2)}`
  return cachedOrCompute(key, () => {
    const field = lensField(width, height, radius, strength)
    const canvas = document.createElement('canvas')
    canvas.width = field.width
    canvas.height = field.height
    const context = canvas.getContext('2d')
    if (!context) return ''
    const data = new Uint8ClampedArray(field.pixels)
    context.putImageData(new ImageData(data, field.width, field.height), 0, 0)
    return canvas.toDataURL('image/png')
  })
}

/** Compute the height/normal field for a rounded-box glass lens. */
export function lensField(
  surfaceW: number,
  surfaceH: number,
  radiusPx: number,
  strength = 1,
): LensField {
  const w = Math.max(2, Math.min(LENS_MAX_WIDTH, Math.round(surfaceW)))
  const h = Math.max(2, Math.min(LENS_MAX_HEIGHT, Math.round(surfaceH)))
  const scale = Math.min(w / surfaceW, h / surfaceH)
  const halfW = w / 2
  const halfH = h / 2
  const radius = Math.max(4, Math.min(radiusPx * scale, halfW, halfH))
  const band = Math.max(3, Math.min(14, h * 0.22))
  /** Center acts as a weak lens too (the whole pane refracts); edges add the
   * pronounced rim bending that reads as glass thickness. */
  const centerStrength = 0.35 * strength
  const edgeStrength = 1.15 * strength

  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - halfW
      const py = y + 0.5 - halfH
      const distance = sdRoundedBox(px, py, halfW, halfH, radius)
      const [nx, ny] = sdfNormal(px, py, halfW, halfH, radius)
      // 0 at the rim edge, growing to 1 a few px inside; 0 outside the pane.
      const edgeFalloff =
        distance < 0 ? Math.min(1, Math.max(0, 1 + distance / band) ** 2) : 0
      const amount = centerStrength + edgeFalloff * edgeStrength
      const i = (y * w + x) * 4
      // Refraction bends toward the pane center: invert the outward normal.
      pixels[i] = 128 - nx * amount * 100
      pixels[i + 1] = 128 - ny * amount * 100
      pixels[i + 2] = 128
      pixels[i + 3] = 255
    }
  }
  return { width: w, height: h, pixels }
}