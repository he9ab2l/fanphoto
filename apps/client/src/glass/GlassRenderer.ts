/** Rendering strategy. Probes the environment once and lets surfaces decide:
 * css (frosted) → svg (displacement refraction, Chromium) → webgl (hero lens).
 * Everything falls back toward css; nothing depends on the enhanced paths. */
export interface GlassCapabilities {
  /** backdrop-filter is painted by this browser at all. */
  backdrop: boolean
  /** url(#filter) backdrop support — the liquid refraction gate (Chromium). */
  svg: boolean
  /** accessibility / data-saver gates that force the plain frosted path. */
  restricted: boolean
}

let cached: GlassCapabilities | null = null

export function glassCapabilities(): GlassCapabilities {
  if (cached) return cached
  const preferences = matchMedia(
    '(prefers-reduced-transparency: reduce), (prefers-contrast: more), (prefers-reduced-motion: reduce)',
  )
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  const backdrop =
    CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
  const chromium = /Chrome|Chromium|Edg\//.test(navigator.userAgent)
  const restricted =
    preferences.matches ||
    Boolean(connection?.saveData) ||
    (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2)
  const svg = backdrop && chromium && !restricted
  cached = { backdrop, svg, restricted }
  return cached
}

/** Re-probe (settings can change between sessions). */
export const resetGlassCapabilities = () => {
  cached = null
}

export function prefersReducedTransparency() {
  return (
    matchMedia('(prefers-reduced-transparency: reduce)').matches ||
    matchMedia('(prefers-contrast: more)').matches
  )
}
