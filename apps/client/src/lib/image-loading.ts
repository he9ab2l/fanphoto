import type { PhotoSummary } from '@fanphoto/contracts'

/** Select from clean server derivatives; never fetch the private source or
 * full-size download just to render a preview. Panel size is not an input. */
export function imageAsset(
  photo: PhotoSummary,
  width: number,
  height: number,
  pixelRatio = 1,
  wall = false,
) {
  const ratio = photo.width / photo.height
  const needed = Math.min(width, height * ratio) * Math.max(1, Math.min(2, pixelRatio))
  const variants = wall && width < 600 ? (['sm', 'md'] as const) : (['sm', 'md', 'lg'] as const)
  return (
    variants.map((variant) => photo.assets[variant]).find((asset) => asset.width >= needed) ||
    photo.assets[variants.at(-1)!]
  )
}

export function retryImageUrl(url: string, attempt: number) {
  if (!attempt) return url
  return `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}`
}

export const imageQuality = () => {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection
  return connection?.saveData || connection?.effectiveType === '2g'
    ? 1
    : Math.min(window.devicePixelRatio || 1, 2)
}
