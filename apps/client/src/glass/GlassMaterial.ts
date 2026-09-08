/** Material System — the single source of truth for every glass parameter.
 * Components never hardcode blur/alpha/border values; they pick a level and
 * the engine resolves the full spec into CSS variables. */
import type { CSSProperties } from 'react'

export type MaterialLevel = 'ultraThin' | 'thin' | 'regular' | 'thick' | 'ultraThick'
export type GlassShape = 'small' | 'medium' | 'large' | 'capsule'

export interface MaterialSpec {
  /** Surface alpha of the neutral tint layer (0..1). */
  opacity: number
  /** backdrop blur radius in px. 0 = no blur (ultraThin keeps a hint). */
  blur: number
  /** saturation factor applied after refraction (1 = neutral). */
  saturation: number
  /** brightness factor applied to the backdrop before tinting. */
  brightness: number
  /** How strongly the environment tint is mixed into the surface (0..1). */
  tint: number
  /** Rim (fresnel) light strength at edges (0..1). */
  rim: number
  /** Shadow token (CSS value). */
  shadow: string
  /** radial-gradient highlight placement: 'light' | 'dark' variant. */
  highlight: string
  /** SVG displacement scale in px; 0 disables the liquid refraction renderer. */
  refraction: number
  /** Edge RGB dispersion (R +1px / B −1px). */
  dispersion: boolean
  /** Whether the WebGL renderer is permitted for this surface. */
  webgl: boolean
}

export type MaterialTheme = 'light' | 'dark'

export const MATERIALS: Record<MaterialLevel, Record<MaterialTheme, MaterialSpec>> = {
  /** Control Center style — barely there, high transparency. */
  ultraThin: {
    light: {
      opacity: 0.28,
      blur: 18,
      saturation: 1.35,
      brightness: 1.08,
      tint: 0.5,
      rim: 0.5,
      shadow: '0 2px 8px rgb(20 20 20 / 8%)',
      highlight: 'rgb(255 255 255 / 42%)',
      refraction: 10,
      dispersion: false,
      webgl: false,
    },
    dark: {
      opacity: 0.3,
      blur: 18,
      saturation: 1.4,
      brightness: 1.05,
      tint: 0.55,
      rim: 0.4,
      shadow: '0 2px 10px rgb(0 0 0 / 30%)',
      highlight: 'rgb(255 255 255 / 18%)',
      refraction: 10,
      dispersion: false,
      webgl: false,
    },
  },
  /** Toolbars and small controls. */
  thin: {
    light: {
      opacity: 0.5,
      blur: 22,
      saturation: 1.28,
      brightness: 1.06,
      tint: 0.45,
      rim: 0.65,
      shadow: '0 4px 18px rgb(20 20 20 / 10%)',
      highlight: 'rgb(255 255 255 / 55%)',
      refraction: 14,
      dispersion: true,
      webgl: false,
    },
    dark: {
      opacity: 0.5,
      blur: 22,
      saturation: 1.32,
      brightness: 1.02,
      tint: 0.5,
      rim: 0.45,
      shadow: '0 4px 20px rgb(0 0 0 / 34%)',
      highlight: 'rgb(255 255 255 / 22%)',
      refraction: 14,
      dispersion: true,
      webgl: false,
    },
  },
  /** Main windows and reading panels. */
  regular: {
    light: {
      opacity: 0.62,
      blur: 26,
      saturation: 1.22,
      brightness: 1.04,
      tint: 0.6,
      rim: 0.8,
      shadow: '0 8px 34px rgb(20 20 20 / 14%)',
      highlight: 'rgb(255 255 255 / 62%)',
      refraction: 16,
      dispersion: true,
      webgl: true,
    },
    dark: {
      opacity: 0.58,
      blur: 26,
      saturation: 1.26,
      brightness: 1.0,
      tint: 0.65,
      rim: 0.5,
      shadow: '0 8px 36px rgb(0 0 0 / 40%)',
      highlight: 'rgb(255 255 255 / 20%)',
      refraction: 16,
      dispersion: true,
      webgl: true,
    },
  },
  /** Dialogs and floating panels. */
  thick: {
    light: {
      opacity: 0.74,
      blur: 30,
      saturation: 1.18,
      brightness: 1.02,
      tint: 0.55,
      rim: 0.7,
      shadow: '0 14px 48px rgb(20 20 20 / 18%)',
      highlight: 'rgb(255 255 255 / 66%)',
      refraction: 12,
      dispersion: false,
      webgl: true,
    },
    dark: {
      opacity: 0.68,
      blur: 30,
      saturation: 1.2,
      brightness: 1.0,
      tint: 0.6,
      rim: 0.45,
      shadow: '0 14px 50px rgb(0 0 0 / 46%)',
      highlight: 'rgb(255 255 255 / 18%)',
      refraction: 12,
      dispersion: false,
      webgl: true,
    },
  },
  /** Large floating layers (sheets, modals over media). */
  ultraThick: {
    light: {
      opacity: 0.84,
      blur: 36,
      saturation: 1.15,
      brightness: 1.0,
      tint: 0.5,
      rim: 0.6,
      shadow: '0 20px 64px rgb(20 20 20 / 22%)',
      highlight: 'rgb(255 255 255 / 70%)',
      refraction: 8,
      dispersion: false,
      webgl: false,
    },
    dark: {
      opacity: 0.78,
      blur: 36,
      saturation: 1.16,
      brightness: 1.0,
      tint: 0.55,
      rim: 0.4,
      shadow: '0 20px 68px rgb(0 0 0 / 52%)',
      highlight: 'rgb(255 255 255 / 16%)',
      refraction: 8,
      dispersion: false,
      webgl: false,
    },
  },
}

/** Continuous corner system. */
export const SHAPE_RADII: Record<GlassShape, number> = {
  small: 10,
  medium: 16,
  large: 22,
  capsule: 999,
}

/** Resolve a material into the CSS variables a surface consumes. */
export function materialVars(
  level: MaterialLevel,
  theme: MaterialTheme,
  extra?: Record<string, string>,
): CSSProperties {
  const spec = MATERIALS[level][theme]
  return {
    '--glass-blur': `${spec.blur}px`,
    '--glass-saturate': String(spec.saturation),
    '--glass-brightness': String(spec.brightness),
    '--glass-surface-alpha': String(spec.opacity),
    '--glass-tint-mix': String(spec.tint),
    '--glass-rim-strength': String(spec.rim),
    '--glass-shadow': spec.shadow,
    '--glass-highlight': spec.highlight,
    '--glass-refraction': String(spec.refraction),
    ...(extra || {}),
  } as CSSProperties
}

export type { CSSProperties }