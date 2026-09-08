/** Optical lens field. One rasterized RG displacement texture per surface size.
 * Edge-band refraction only: the interior stays neutral (a flat pane does not
 * bend light), displacement ramps up inside a narrow band at the rim — this
 * also avoids the nearest-edge normal flip across the pane midline that a
 * whole-pane field would produce (visible seam artifacts).
 * R = 128 + x displacement, G = 128 + y displacement, A = rim height (for
 * edge lighting consumers). */
import { sdRoundedBox, sdfNormal } from './sdf'
import { cachedOrCompute } from './cache'

export interface LensField {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export const LENS_MAX_WIDTH = 1024
export const LENS_MAX_HEIGHT = 900
export const LENS_BUDGET = 280_000

export const withinLensBudget = (width: number, height: number) =>
  width > 0 &&
  height > 0 &&
  width <= LENS_MAX_WIDTH &&
  height <= LENS_MAX_HEIGHT &&
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

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** Compute the edge-band displacement field for a rounded-box glass lens. */
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
  const band = Math.max(4, Math.min(18, Math.min(w, h) * 0.28))
  const edgeStrength = 1.35 * strength

  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - halfW
      const py = y + 0.5 - halfH
      const distance = sdRoundedBox(px, py, halfW, halfH, radius)
      const i = (y * w + x) * 4
      // 0 deep inside the pane (flat glass — no displacement), 1 at the rim.
      const falloff = distance < 0 ? smoothstep(Math.min(1, Math.max(0, 1 + distance / band))) : 1
      const height = falloff * falloff
      if (height <= 0) {
        // Interior: neutral displacement, zero rim height.
        pixels[i] = 128
        pixels[i + 1] = 128
        pixels[i + 2] = 128
        pixels[i + 3] = 0
        continue
      }
      const [nx, ny] = sdfNormal(px, py, halfW, halfH, radius)
      const amount = edgeStrength * height
      // Refraction bends toward the pane center: invert the outward normal.
      pixels[i] = 128 - nx * amount * 100
      pixels[i + 1] = 128 - ny * amount * 100
      pixels[i + 2] = 128
      pixels[i + 3] = Math.round(height * 255)
    }
  }
  return { width: w, height: h, pixels }
}
