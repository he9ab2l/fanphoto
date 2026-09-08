export const VIEWER = {
  breakpoint: 900,
  infoWidth: 320,
  maxWidth: 1600,
  desktopMargin: 24,
  desktopPadding: 48,
  phonePadding: 8,
  phoneControls: 56,
  navigationSize: 50,
  partialSheet: 252,
  fullSheet: 0.76,
} as const

export type InfoState = 'collapsed' | 'partial' | 'full'
export interface Viewport {
  width: number
  height: number
  safeTop?: number
  safeBottom?: number
}

export function sheetHeights(viewport: Viewport) {
  const full = Math.round(viewport.height * VIEWER.fullSheet)
  return { partial: Math.min(VIEWER.partialSheet, Math.round(full * 0.8)), full }
}

export function fitPhoto(aspect: number, width: number, height: number) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const h = Math.max(1, Math.min(Math.max(1, width) / safeAspect, Math.max(1, height)))
  return { width: h * safeAspect, height: h }
}

/** The transparent viewing layer stays stable while the exact image rectangle
 * adapts to its ratio. Changing photos never moves the metadata or close button,
 * and panoramas are not placed inside a fixed-height white image box. */
export function viewerLayout(viewport: Viewport, aspect: number, info: InfoState) {
  const mobile = viewport.width <= VIEWER.breakpoint
  const sheet = sheetHeights(viewport)
  const sheetHeight = mobile && info !== 'collapsed' ? sheet[info] : 0
  const shellWidth = mobile
    ? viewport.width
    : Math.min(VIEWER.maxWidth, viewport.width - VIEWER.desktopMargin * 2)
  const padding = mobile ? VIEWER.phonePadding : VIEWER.desktopPadding
  const maxHeight = viewport.height - VIEWER.desktopMargin * 2
  const shellHeight = mobile ? viewport.height : Math.max(1, maxHeight)
  const stageWidth = shellWidth - (!mobile && info !== 'collapsed' ? VIEWER.infoWidth : 0)
  const stageHeight = shellHeight - sheetHeight
  const top = mobile ? VIEWER.phoneControls + (viewport.safeTop || 0) : padding
  const bottom =
    mobile && info === 'collapsed' ? VIEWER.phoneControls + (viewport.safeBottom || 0) : padding
  const photo = fitPhoto(aspect, stageWidth - padding * 2, stageHeight - top - bottom)
  return {
    mobile,
    shellWidth,
    shellHeight,
    stageWidth,
    stageHeight,
    sheet,
    photo: {
      ...photo,
      x: (stageWidth - photo.width) / 2,
      y: top + Math.max(0, (stageHeight - top - bottom - photo.height) / 2),
    },
  }
}
