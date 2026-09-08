/** Environment System. Turns the current photo's thumbhash average color into
 * a restrained OKLCH glass tint, published as document-level CSS variables so
 * every glass surface belongs to its environment without per-surface sampling. */
import { useMemo, useEffect } from 'react'
import type { PhotoSummary } from '@fanphoto/contracts'
import { thumbHashToAverageRGBA } from 'thumbhash'
import { srgbToOklch, oklch, neutralOklch, type Oklch } from './oklch'

export type GlassTheme = 'light' | 'dark'

/** Target surface lightness per theme (keeps text readable over any photo). */
const LIGHT_TARGET = 0.88
const DARK_TARGET = 0.27
/** Never paint obvious color into the glass — the photo is a hint, not a dye. */
const MAX_CHROMA = 0.05
const MIN_CHROMA = 0.014

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function averageRgb(hash: string): { r: number; g: number; b: number } | null {
  try {
    const { r, g, b } = thumbHashToAverageRGBA(
      Uint8Array.from(atob(hash), (char) => char.charCodeAt(0)),
    )
    if (![r, g, b].every((value) => Number.isFinite(value))) return null
    return { r: clamp(r, 0, 1), g: clamp(g, 0, 1), b: clamp(b, 0, 1) }
  } catch {
    return null
  }
}

/** thumbhash average → restrained tint, adapted for the active theme. */
export function tintFromPhoto(thumbHash: string | null, theme: GlassTheme): Oklch {
  const target = theme === 'dark' ? DARK_TARGET : LIGHT_TARGET
  if (!thumbHash) return neutralOklch(target)
  const rgb = averageRgb(thumbHash)
  if (!rgb) return neutralOklch(target)
  const photo = srgbToOklch(rgb)
  const lightness = clamp(photo.l, 0.12, 0.96) * 0.45 + target * 0.55
  const chroma = photo.c > MIN_CHROMA ? Math.min(photo.c, MAX_CHROMA) : 0
  // Near-neutral hues (snow, night, monochrome) stay perfectly neutral.
  const hue = chroma > 0 ? photo.h : 0
  return { l: lightness, c: chroma, h: hue }
}

export const tintToCss = (tint: Oklch | null, theme: GlassTheme, alpha = 1) =>
  oklch(tint || neutralOklch(theme === 'dark' ? DARK_TARGET : LIGHT_TARGET), alpha)

export const AMBIENT_EVENT = 'fanphoto:glass-ambient'

/** Neutral fallback that glass surfaces use when no photo context exists. */
export function neutralTint(theme: GlassTheme): Oklch {
  return neutralOklch(theme === 'dark' ? DARK_TARGET : LIGHT_TARGET)
}

const BASE_NEUTRAL: Record<GlassTheme, Oklch> = {
  light: { l: 0.9, c: 0.006, h: 250 },
  dark: { l: 0.27, c: 0.006, h: 250 },
}

/** Blend the ambient tint with the material's neutral base (OKLCH) and return
 * a CSS background color at the given surface alpha. Shared by GlassSurface
 * and by token-driven panels (mobile photo sheet) so tint stays consistent. */
export function blendGlassBg(
  source: Oklch | null,
  theme: GlassTheme,
  mix: number,
  alpha: number,
): string {
  const base = BASE_NEUTRAL[theme]
  const tint = source || base
  const l = base.l * (1 - mix) + tint.l * mix
  const c = (tint.c || 0.006) * mix * 1.6
  const h = tint.c > 0.012 ? tint.h : base.h
  return oklch({ l, c, h }, alpha)
}

/** Publish the current environment (photo thumbhash → CSS vars on :root). */
export function setGlassAmbient(thumbHash: string | null, theme: GlassTheme) {
  const tint = tintFromPhoto(thumbHash, theme)
  const root = document.documentElement
  root.style.setProperty('--glass-ambient', oklch(tint))
  root.style.setProperty('--glass-ambient-l', tint.l.toFixed(4))
  root.style.setProperty('--glass-ambient-c', tint.c.toFixed(4))
  root.style.setProperty('--glass-ambient-h', String(tint.h))
  root.dataset.glassAmbient = thumbHash ? 'photo' : 'neutral'
  window.dispatchEvent(new CustomEvent(AMBIENT_EVENT))
}

/** Publish the ambient for a photo (effect-driven; used by dialogs/gallery).
 * Resets to neutral when the photo context unmounts so gallery glass does not
 * stay tinted by a closed viewer. */
export function useGlassAmbient(photo: PhotoSummary | null | undefined, theme: GlassTheme) {
  useEffect(() => {
    setGlassAmbient(photo?.thumbHash ?? null, theme)
    return () => {
      setGlassAmbient(null, theme)
    }
  }, [photo?.thumbHash, theme])
}

/** Sample a specific photo directly (surfaces with their own photo context). */
export function useGlassTint(photo: PhotoSummary | null | undefined, theme: GlassTheme): string {
  return useMemo(
    () => oklch(tintFromPhoto(photo?.thumbHash ?? null, theme), 1),
    [photo?.thumbHash, theme],
  )
}

/** Read the currently published ambient (for one-shot surfaces). */
export function readGlassAmbient(): {
  l: number
  c: number
  h: number
  color: string
} | null {
  const root = document.documentElement
  const l = parseFloat(root.style.getPropertyValue('--glass-ambient-l'))
  const c = parseFloat(root.style.getPropertyValue('--glass-ambient-c'))
  const h = parseFloat(root.style.getPropertyValue('--glass-ambient-h'))
  const color = root.style.getPropertyValue('--glass-ambient').trim()
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h) || !color) return null
  return { l, c, h, color }
}