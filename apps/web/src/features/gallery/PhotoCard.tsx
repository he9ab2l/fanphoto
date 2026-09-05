import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ImageItem } from '../../data/images'
import type { WallActivation } from './useWallMotion'

export interface ImageMetadata {
  width: number
  height: number
}

interface PhotoCardProps {
  item: ImageItem
  itemIndex: number
  slotIndex: number
  priority: boolean
  detailState: 'idle' | 'active' | 'outgoing'
  register: (slotIndex: number, element: HTMLElement | null) => void
  onImageSettled: (src: string) => void
  onMetadata: (src: string, metadata: ImageMetadata) => void
  onKeyboardActivate: (activation: WallActivation) => void
}

export const PhotoCard = memo(function PhotoCard({
  item,
  itemIndex,
  slotIndex,
  priority,
  detailState,
  register,
  onImageSettled,
  onMetadata,
  onKeyboardActivate,
}: PhotoCardProps) {
  const elementRef = useRef<HTMLElement>(null)
  const [shouldLoad, setShouldLoad] = useState(priority)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const setElement = useCallback((element: HTMLElement | null) => {
    elementRef.current = element
    register(slotIndex, element)
  }, [register, slotIndex])

  useEffect(() => {
    if (priority || shouldLoad) return
    const element = elementRef.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setShouldLoad(true)
      observer.disconnect()
    }, { rootMargin: '320px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [priority, shouldLoad])

  const handleLoad: React.ReactEventHandler<HTMLImageElement> = (event) => {
    const image = event.currentTarget
    setStatus('ready')
    onMetadata(item.src, { width: image.naturalWidth, height: image.naturalHeight })
    onImageSettled(item.src)
  }

  const handleError = () => {
    setStatus('error')
    onImageSettled(item.src)
  }

  return (
    <article
      ref={setElement}
      className={`photo-card is-detail-${detailState}`}
      data-photo-index={itemIndex}
      data-slot-index={slotIndex}
    >
      <button
        className="photo-card-trigger"
        type="button"
        aria-label={`查看照片：${item.title}`}
        onClick={(event) => {
          if (event.detail === 0) {
            onKeyboardActivate({ photoIndex: itemIndex, slotIndex, trigger: event.currentTarget })
          }
        }}
      >
        <span className={`photo-media is-${status}`}>
          <span className="photo-placeholder" aria-hidden="true" />
          <img
            src={shouldLoad ? item.src : undefined}
            alt={item.alt ?? item.title}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            draggable="false"
            onLoad={handleLoad}
            onError={handleError}
          />
          {status === 'error' && <span className="photo-error">图片暂时无法显示</span>}
          <span className="photo-caption" aria-hidden="true">{item.title}</span>
        </span>
      </button>
    </article>
  )
})
