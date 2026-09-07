/** React Bits Masonry adaptation; attribution and license in NOTICE.md. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PhotoSummary } from '@fanphoto/contracts'
import { masonry } from '../gallery/geometry'
import { imageSet } from '../lib/photos'
import { Button } from '../ui/primitives'

export function Masonry({
  photos,
  density,
  onOpen,
}: {
  photos: PhotoSummary[]
  density: number
  onOpen: (photo: PhotoSummary) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!root.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  const layout = useMemo(() => masonry(photos, width, density), [photos, width, density])
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
          onClick={() => onOpen(tile.photo)}
          style={{
            width: tile.width,
            height: tile.height,
            transform: `translate3d(${tile.x}px,${tile.y}px,0)`,
          }}
        >
          <img
            src={tile.photo.assets.sm.url}
            srcSet={imageSet(tile.photo)}
            sizes={`${Math.ceil(tile.width)}px`}
            width={tile.photo.width}
            height={tile.photo.height}
            alt={tile.photo.title}
            loading={i < 8 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : 'auto'}
            decoding="async"
            draggable={false}
          />
        </Button>
      ))}
    </div>
  )
}
