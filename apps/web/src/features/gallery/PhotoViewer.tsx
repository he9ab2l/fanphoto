import { useEffect, useMemo, useRef, useState } from 'react'
import exifr from 'exifr'
import {
  ArrowLeftRegular,
  ArrowRightRegular,
  CalendarRegular,
  CameraRegular,
  CloseRegular,
  FileInfoRegular,
  InformationRegular,
  LayoutRightbarCloseRegular,
  LayoutRightbarOpenRegular,
  RulerRegular,
} from '@mingcute/react/core-regular'
import type { ImageItem } from '../../data/images'
import type { ImageMetadata } from './PhotoCard'

interface ParsedPhotoMetadata {
  bytes?: number
  mime?: string
  make?: string
  model?: string
  lens?: string
  iso?: number
  exposureTime?: number
  aperture?: number
  focalLength?: number
  capturedAt?: Date
}

export interface ViewerSnapshot {
  item: ImageItem
  index: number
  metadata?: ImageMetadata
}

interface PhotoViewerProps extends ViewerSnapshot {
  total: number
  expanded: boolean
  outgoing?: ViewerSnapshot | null
  onExpandedChange: (expanded: boolean) => void
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
}

const metadataCache = new Map<string, ParsedPhotoMetadata>()

function imageFormat(src: string) {
  const extension = src.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toUpperCase()
  return extension === 'JPG' ? 'JPEG' : extension ?? '图片'
}

function fileName(src: string) {
  const path = src.split(/[?#]/)[0]
  return decodeURIComponent(path.split('/').at(-1) || src)
}

function orientation(metadata?: ImageMetadata) {
  if (!metadata) return '读取中'
  if (metadata.width === metadata.height) return '方形'
  return metadata.width > metadata.height ? '横向' : '竖向'
}

function greatestCommonDivisor(first: number, second: number): number {
  return second ? greatestCommonDivisor(second, first % second) : first
}

function ratio(metadata?: ImageMetadata) {
  if (!metadata) return '—'
  const divisor = greatestCommonDivisor(metadata.width, metadata.height)
  return `${metadata.width / divisor}:${metadata.height / divisor}`
}

function megapixels(metadata?: ImageMetadata) {
  if (!metadata) return '—'
  return `${(metadata.width * metadata.height / 1_000_000).toFixed(1)} MP`
}

function byteSize(bytes?: number) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function exposure(value?: number) {
  if (!value) return undefined
  return value < 1 ? `1/${Math.round(1 / value)} s` : `${value} s`
}

function displayDate(value?: Date) {
  if (!value) return undefined
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function PhotoVisual({ snapshot, outgoing = false }: { snapshot: ViewerSnapshot; outgoing?: boolean }) {
  return (
    <div className={`detail-visual${outgoing ? ' is-outgoing' : ' is-incoming'}`} aria-hidden={outgoing || undefined}>
      <div className="detail-image-frame">
        <img src={snapshot.item.src} alt={outgoing ? '' : snapshot.item.alt ?? snapshot.item.title} decoding="async" draggable="false" />
      </div>
    </div>
  )
}

export function PhotoViewer({
  item,
  index,
  total,
  metadata,
  expanded,
  outgoing,
  onExpandedChange,
  onClose,
  onPrevious,
  onNext,
}: PhotoViewerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [parsed, setParsed] = useState<ParsedPhotoMetadata>(() => metadataCache.get(item.src) ?? {})

  useEffect(() => {
    let cancelled = false
    const cached = metadataCache.get(item.src)
    if (cached) {
      setParsed(cached)
      return
    }
    setParsed({})

    Promise.all([
      fetch(item.src, { method: 'HEAD' }).then((response) => ({
        bytes: Number(response.headers.get('content-length')) || undefined,
        mime: response.headers.get('content-type') || undefined,
      })).catch(() => ({})),
      exifr.parse(item.src, [
        'Make',
        'Model',
        'LensModel',
        'ISO',
        'ExposureTime',
        'FNumber',
        'FocalLength',
        'DateTimeOriginal',
      ]).catch(() => undefined),
    ]).then(([file, exif]) => {
      if (cancelled) return
      const value: ParsedPhotoMetadata = {
        ...file,
        make: exif?.Make,
        model: exif?.Model,
        lens: exif?.LensModel,
        iso: exif?.ISO,
        exposureTime: exif?.ExposureTime,
        aperture: exif?.FNumber,
        focalLength: exif?.FocalLength,
        capturedAt: exif?.DateTimeOriginal,
      }
      metadataCache.set(item.src, value)
      setParsed(value)
    })

    return () => {
      cancelled = true
    }
  }, [item.src])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [item.src])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      const target = event.target as HTMLElement | null
      if (!(target instanceof HTMLElement && target.closest('.detail-content'))) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onPrevious()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onNext, onPrevious])

  const orientationName = orientation(metadata)
  const layout = orientationName === '竖向' ? 'portrait' : orientationName === '方形' ? 'square' : 'landscape'
  const cameraName = useMemo(() => [parsed.make, parsed.model].filter(Boolean).join(' '), [parsed.make, parsed.model])
  const cameraSettings = [
    parsed.aperture ? `ƒ/${parsed.aperture}` : undefined,
    exposure(parsed.exposureTime),
    parsed.iso ? `ISO ${parsed.iso}` : undefined,
    parsed.focalLength ? `${parsed.focalLength} mm` : undefined,
  ].filter(Boolean).join(' · ')

  return (
    <section className="photo-viewer photo-detail-layer" aria-label={`${item.title} 的照片详情`}>
      <div className="detail-scrim" aria-hidden="true" />
      {outgoing && <PhotoVisual key={`out-${outgoing.item.src}`} snapshot={outgoing} outgoing />}
      <div
        key={item.src}
        className={`detail-content is-${layout}${expanded ? ' is-expanded' : ' is-collapsed'}`}
      >
        <PhotoVisual snapshot={{ item, index, metadata }} />

        <aside className="detail-panel" aria-label="照片信息">
          <div className="detail-panel-inner">
            <header className="detail-heading">
              <div>
                <p className="detail-eyebrow"><InformationRegular size={14} /> PHOTO DETAILS</p>
                <h2 id="viewer-title">{item.title}</h2>
                <p>{fileName(item.src)}</p>
              </div>
            </header>

            <div className="detail-section">
              <h3><RulerRegular size={15} /> 图像</h3>
              <dl className="detail-metadata-grid">
                <div><dt>分辨率</dt><dd>{metadata ? `${metadata.width} × ${metadata.height}` : '读取中'}</dd></div>
                <div><dt>像素量</dt><dd>{megapixels(metadata)}</dd></div>
                <div><dt>宽高比</dt><dd>{ratio(metadata)}</dd></div>
                <div><dt>方向</dt><dd>{orientationName}</dd></div>
              </dl>
            </div>

            <div className="detail-section">
              <h3><FileInfoRegular size={15} /> 文件</h3>
              <dl className="detail-list">
                <div><dt>格式</dt><dd>{imageFormat(item.src)}</dd></div>
                <div><dt>类型</dt><dd>{parsed.mime ?? `${imageFormat(item.src)} 图像`}</dd></div>
                <div><dt>大小</dt><dd>{byteSize(parsed.bytes)}</dd></div>
                <div><dt>序号</dt><dd>{index + 1} / {total}</dd></div>
              </dl>
            </div>

            {(cameraName || parsed.lens || cameraSettings) && (
              <div className="detail-section">
                <h3><CameraRegular size={15} /> 拍摄参数</h3>
                <dl className="detail-list">
                  {cameraName && <div><dt>相机</dt><dd>{cameraName}</dd></div>}
                  {parsed.lens && <div><dt>镜头</dt><dd>{parsed.lens}</dd></div>}
                  {cameraSettings && <div><dt>参数</dt><dd>{cameraSettings}</dd></div>}
                </dl>
              </div>
            )}

            {displayDate(parsed.capturedAt) && (
              <div className="detail-section">
                <h3><CalendarRegular size={15} /> 拍摄时间</h3>
                <p className="detail-date">{displayDate(parsed.capturedAt)}</p>
              </div>
            )}

            {total > 1 && (
              <nav className="detail-navigation" aria-label="照片切换">
                <button type="button" onClick={onPrevious} aria-label="上一张照片"><ArrowLeftRegular size={18} /></button>
                <span>{index + 1} / {total}</span>
                <button type="button" onClick={onNext} aria-label="下一张照片"><ArrowRightRegular size={18} /></button>
              </nav>
            )}
          </div>
        </aside>

        <button
          className="detail-panel-toggle"
          type="button"
          aria-label={expanded ? '折叠详情面板' : '展开详情面板'}
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <LayoutRightbarCloseRegular size={19} /> : <LayoutRightbarOpenRegular size={19} />}
        </button>
        <button ref={closeButtonRef} className="detail-close" type="button" aria-label="关闭照片详情" onClick={onClose}>
          <CloseRegular size={20} />
        </button>
      </div>
    </section>
  )
}
