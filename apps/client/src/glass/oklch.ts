/** OKLCH color math (Björn Ottosson). sRGB 0..1 floats in, CSS color strings out.
 * Used by the Environment System to turn photo averages into restrained glass tints. */
export interface Oklch {
  l: number
  c: number
  h: number
}
export interface Rgb01 {
  r: number
  g: number
  b: number
}

const srgbToLinear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)

export const srgbToOklch = (rgb: Rgb01): Oklch => {
  const r = srgbToLinear(rgb.r),
    g = srgbToLinear(rgb.g),
    b = srgbToLinear(rgb.b)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l),
    m_ = Math.cbrt(m),
    s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return { l: L, c: Math.hypot(a, B), h: (Math.atan2(B, a) * 180) / Math.PI }
}

/** OKLCH → CSS color string. H in degrees; a/l optional. */
export const oklch = (value: Oklch, alpha = 1) => {
  const hue = ((value.h % 360) + 360) % 360
  return alpha >= 1
    ? `oklch(${value.l.toFixed(4)} ${value.c.toFixed(4)} ${hue.toFixed(1)})`
    : `oklch(${value.l.toFixed(4)} ${value.c.toFixed(4)} ${hue.toFixed(1)} / ${alpha.toFixed(3)})`
}

/** OKLCH → sRGB (0..1). Used to feed the WebGL tint uniform. */
export const oklchToSrgb = ({ l, c, h }: Oklch): Rgb01 => {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const l__ = l_ ** 3
  const m__ = m_ ** 3
  const s__ = s_ ** 3
  const r = 4.0767416621 * l__ - 3.3077115913 * m__ + 0.2309699292 * s__
  const g = -1.2684380046 * l__ + 2.6097574011 * m__ - 0.3413193965 * s__
  const bl = -0.0041960863 * l__ - 0.7034186147 * m__ + 1.707614701 * s__
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  // linear → sRGB
  const enc = (v: number) =>
    v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return { r: clamp01(enc(r)), g: clamp01(enc(g)), b: clamp01(enc(bl)) }
}

/** Neutral tint at a given lightness (no hue), as an OKLCH value. */
export const neutralOklch = (l: number): Oklch => ({ l, c: 0, h: 0 })