import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { thumbHashToDataURL } from 'thumbhash'
import type { PhotoSummary } from '@fanphoto/contracts'
import { imageAsset, imageQuality, retryImageUrl } from '../lib/image-loading'
import { Button } from './primitives'
import { Icon } from './icons'

const previews = new Map<string, string>()
function placeholder(hash: string | null) {
  if (!hash) return undefined
  if (previews.has(hash)) return previews.get(hash)
  try {
    const url = thumbHashToDataURL(Uint8Array.from(atob(hash), (char) => char.charCodeAt(0)))
    if (previews.size >= 160) previews.delete(previews.keys().next().value!)
    previews.set(hash, url)
    return url
  } catch {
    return undefined
  }
}

export function GalleryImage({
  photo,
  width,
  height,
  eager = false,
  background = false,
}: {
  photo: PhotoSummary
  width: number
  height: number
  eager?: boolean
  background?: boolean
}) {
  const preview = useMemo(() => placeholder(photo.thumbHash), [photo.thumbHash])
  const asset = imageAsset(photo, width, height, imageQuality(), true)
  return (
    <img
      src={asset.url}
      width={photo.width}
      height={photo.height}
      alt={photo.title}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={background ? 'low' : eager ? 'high' : 'auto'}
      decoding="async"
      draggable={false}
      style={
        preview ? { backgroundImage: `url(${preview})`, backgroundSize: '100% 100%' } : undefined
      }
    />
  )
}

/** A stable photo node across info-panel toggles. The already visible wall
 * image remains underneath until decode completes; failed upgrades keep it. */
export function DetailImage({
  photo,
  previewUrl,
  source,
  onReady,
}: {
  photo: PhotoSummary
  previewUrl?: string
  source: string
  onReady?: (id: string) => void
}) {
  const image = useRef<HTMLImageElement>(null)
  const [ready, setReady] = useState('')
  const [failed, setFailed] = useState('')
  const [attempt, setAttempt] = useState(0)
  const url = retryImageUrl(source, attempt)
  const preview = previewUrl || photo.assets.sm.url
  const background = useMemo(() => placeholder(photo.thumbHash), [photo.thumbHash])
  useLayoutEffect(() => {
    if (image.current?.complete && image.current.naturalWidth) {
      setReady(url)
      onReady?.(photo.id)
    }
  }, [url, onReady, photo.id])
  return (
    <div
      className="detail-image-stack"
      style={background ? { backgroundImage: `url(${background})` } : undefined}
    >
      <img
        className="detail-image-preview"
        src={preview}
        width={photo.width}
        height={photo.height}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
      />
      <img
        ref={image}
        className="detail-image-full"
        data-ready={ready === url}
        data-testid="detail-image"
        src={url}
        width={photo.width}
        height={photo.height}
        alt={photo.title}
        draggable={false}
        decoding="async"
        fetchPriority="high"
        onLoad={(event) => {
          const node = event.currentTarget
          void node
            .decode()
            .catch(() => {})
            .then(() => {
              if (
                image.current === node &&
                node.complete &&
                node.naturalWidth > 0 &&
                node.getAttribute('src') === url
              ) {
                setReady(url)
                onReady?.(photo.id)
              }
            })
        }}
        onError={() => setFailed(url)}
      />
      {failed === url ? (
        <div className="detail-image-status" role="alert">
          <span>清晰图加载失败，预览仍可查看</span>
          <Button onClick={() => setAttempt((value) => value + 1)}>
            <Icon name="refresh" size={16} />
            重试
          </Button>
        </div>
      ) : (
        ready !== url && (
          <div className="detail-image-status" role="status">
            <Icon name="photo" size={15} />
            正在载入清晰图
          </div>
        )
      )}
    </div>
  )
}
