/** React Bits Masonry adaptation; attribution and license in NOTICE.md. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PhotoSummary } from '@fanphoto/contracts'
import { masonry, appendMasonry, type JustifyOverrides } from '../gallery/geometry'
import { GalleryImage } from '../ui/PhotoImage'
import { Button } from '../ui/primitives'

export function Masonry({
  photos,
  density,
  options,
  onOpen,
  onIntent,
  paused = false,
}: {
  photos: PhotoSummary[]
  density: number
  /** 覆盖默认布局参数（用于调试/调参，日常不传） */
  options?: JustifyOverrides
  onOpen: (photo: PhotoSummary, preview?: string) => void
  onIntent?: (photo: PhotoSummary) => void
  paused?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const committed = useRef<{
    photos: PhotoSummary[]
    width: number
    density: number
    options?: JustifyOverrides
    layout: ReturnType<typeof masonry>
  } | null>(null)
  useLayoutEffect(() => {
    if (!root.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  const layout = useMemo(() => {
    const previous = committed.current
    return previous &&
      previous.width === width &&
      previous.density === density &&
      previous.options === options
      ? appendMasonry(previous.layout, previous.photos, photos, width, density, options)
      : masonry(photos, width, density, options)
  }, [photos, width, density, options])
  useLayoutEffect(() => {
    committed.current = { photos, width, density, options, layout }
  }, [photos, width, density, options, layout])
  return (
    <div
      className="photo-grid"
      ref={root}
      style={{ height: layout.height }}
      aria-label="平铺照片墙"
    >
      {layout.tiles.map((tile, i) => (
        <Button
          key={tile.key}
          className="photo-tile"
          data-testid="photo-card"
          data-photo-id={tile.photo.id}
          data-ratio={tile.photo.width / tile.photo.height}
          aria-label={`查看照片：${tile.photo.title}`}
          onPointerEnter={() => onIntent?.(tile.photo)}
          onFocus={() => onIntent?.(tile.photo)}
          onClick={(event) =>
            onOpen(tile.photo, event.currentTarget.querySelector('img')?.currentSrc)
          }
          style={{
            width: tile.width,
            height: tile.height,
            transform: `translate3d(${tile.x}px,${tile.y}px,0)`,
          }}
        >
          <GalleryImage
            photo={tile.photo}
            width={tile.width}
            height={tile.height}
            eager={i < 4}
            background={paused}
          />
        </Button>
      ))}
    </div>
  )
}
