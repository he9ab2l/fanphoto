import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  FlashlightRegular,
  FullscreenRegular,
  GridRegular,
  Magic1Regular,
  PhotoAlbumRegular,
  TargetRegular,
  ZoomInRegular,
  ZoomOutRegular,
} from '@mingcute/react/core-regular'
import type { ImageItem } from '../../data/images'
import { PhotoCard, type ImageMetadata } from './PhotoCard'
import { PhotoViewer } from './PhotoViewer'
import { useWallMotion, type WallActivation, type WallLayout } from './useWallMotion'
import type { WallEffectId } from './wallEffects'

interface GalleryWallProps {
  images: ImageItem[]
}

const MIN_ZOOM = 0.65
const MAX_ZOOM = 1.65
const ZOOM_STEP = 0.14
const GAP = 8

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

interface ActiveCard {
  slotIndex: number
  photoIndex: number
}

function shuffledDeck(images: ImageItem[]) {
  const deck = images.map((item, index) => ({ item, index }))
  let seed = images.length * 2654435761
  for (let index = deck.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const target = seed % (index + 1)
    ;[deck[index], deck[target]] = [deck[target], deck[index]]
  }
  return deck
}

export function GalleryWall({ images }: GalleryWallProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef(new Map<number, HTMLElement>())
  const statusTimerRef = useRef(0)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [zoom, setZoom] = useState(1)
  const [effectId, setEffectId] = useState<WallEffectId>('grid')
  const [torchEnabled, setTorchEnabled] = useState(false)
  const [active, setActive] = useState<ActiveCard | null>(null)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const [metadata, setMetadata] = useState<Record<string, ImageMetadata>>({})
  const [loadedSources, setLoadedSources] = useState<Set<string>>(() => new Set())
  const [coverTimedOut, setCoverTimedOut] = useState(false)
  const [hintVisible, setHintVisible] = useState(true)
  const [status, setStatus] = useState('')

  const deck = useMemo(() => shuffledDeck(images), [images])
  const layout = useMemo<WallLayout>(() => {
    const shortSide = Math.min(viewport.width, viewport.height)
    const card = clamp(Math.min(330 * zoom, shortSide * 0.46 * zoom), 140, 560)
    const period = card + GAP
    return {
      width: viewport.width,
      height: viewport.height,
      card,
      gap: GAP,
      columns: Math.max(4, Math.ceil(viewport.width / period) + 4),
      rows: Math.max(4, Math.ceil(viewport.height / period) + 4),
    }
  }, [viewport, zoom])
  const slotCount = layout.columns * layout.rows
  const criticalSources = useMemo(() => {
    const sources = new Set<string>()
    if (!deck.length) return sources
    for (let slot = 0; slot < Math.min(slotCount, 12); slot += 1) sources.add(deck[slot % deck.length].item.src)
    return sources
  }, [deck, slotCount])
  const coverReady = !images.length || coverTimedOut || [...criticalSources].every((src) => loadedSources.has(src))

  const showStatus = useCallback((message: string) => {
    window.clearTimeout(statusTimerRef.current)
    setStatus(message)
    statusTimerRef.current = window.setTimeout(() => setStatus(''), 1600)
  }, [])

  const updateZoom = useCallback((next: number) => {
    const value = clamp(next, MIN_ZOOM, MAX_ZOOM)
    setZoom(value)
    showStatus(`缩放 ${Math.round(value * 100)}%`)
  }, [showStatus])

  const openPhoto = useCallback((activation: WallActivation) => {
    setHintVisible(false)
    setActive({ slotIndex: activation.slotIndex, photoIndex: activation.photoIndex })
  }, [])

  const closePhoto = useCallback(() => {
    setActive(null)
  }, [])

  const previousPhoto = useCallback(() => {
    setActive((current) => current && images.length > 1
      ? { ...current, photoIndex: (current.photoIndex - 1 + images.length) % images.length }
      : current)
  }, [images.length])

  const nextPhoto = useCallback(() => {
    setActive((current) => current && images.length > 1
      ? { ...current, photoIndex: (current.photoIndex + 1) % images.length }
      : current)
  }, [images.length])

  const motion = useWallMotion({
    layout,
    stageRef,
    tileRefs,
    effectId,
    onActivate: openPhoto,
    onEscape: closePhoto,
    onPinchScale: (scale) => updateZoom(zoom * scale),
  })

  const registerTile = useCallback((slotIndex: number, element: HTMLElement | null) => {
    if (element) tileRefs.current.set(slotIndex, element)
    else tileRefs.current.delete(slotIndex)
  }, [])

  const handleImageSettled = useCallback((src: string) => {
    setLoadedSources((current) => {
      if (current.has(src)) return current
      const next = new Set(current)
      next.add(src)
      return next
    })
  }, [])

  const handleMetadata = useCallback((src: string, value: ImageMetadata) => {
    setMetadata((current) => {
      const previous = current[src]
      if (previous?.width === value.width && previous.height === value.height) return current
      return { ...current, [src]: value }
    })
  }, [])

  const changeEffect = useCallback((next: WallEffectId) => {
    setEffectId(next)
    const label = next === 'dome' ? '穹顶透镜' : '经典网格'
    showStatus(`已切换为${label}`)
  }, [showStatus])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setViewport({ width, height })
    })
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setLoadedSources(new Set())
    setCoverTimedOut(false)
    const timeout = window.setTimeout(() => setCoverTimedOut(true), 4000)
    return () => window.clearTimeout(timeout)
  }, [images])

  useEffect(() => {
    const timeout = window.setTimeout(() => setHintVisible(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => () => {
    window.clearTimeout(statusTimerRef.current)
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const updateTorchPosition = (event: PointerEvent) => {
      const rect = shell.getBoundingClientRect()
      shell.style.setProperty('--torch-x', `${Math.round(event.clientX - rect.left)}px`)
      shell.style.setProperty('--torch-y', `${Math.round(event.clientY - rect.top)}px`)
    }
    shell.addEventListener('pointermove', updateTorchPosition)
    return () => shell.removeEventListener('pointermove', updateTorchPosition)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => motion.invalidate())
    return () => window.cancelAnimationFrame(frame)
  }, [slotCount])

  const activeItem = active ? images[active.photoIndex] : null

  return (
    <main ref={shellRef} className={`gallery-shell${torchEnabled ? ' has-torch' : ''}`}>
      <div
        ref={stageRef}
        className="gallery-stage"
        aria-label="可拖动照片墙"
        style={{ '--card-size': `${layout.card}px` } as CSSProperties}
      >
        {deck.length ? Array.from({ length: slotCount }, (_, slotIndex) => {
          const entry = deck[slotIndex % deck.length]
          return (
            <PhotoCard
              key={`${slotIndex}-${entry.item.src}`}
              item={entry.item}
              itemIndex={entry.index}
              slotIndex={slotIndex}
              priority={criticalSources.has(entry.item.src)}
              detailState={active?.slotIndex === slotIndex ? 'active' : 'idle'}
              register={registerTile}
              onImageSettled={handleImageSettled}
              onMetadata={handleMetadata}
              onKeyboardActivate={openPhoto}
            />
          )
        }) : (
          <section className="gallery-empty" role="status">
            <PhotoAlbumRegular size={34} />
            <h1>还没有照片</h1>
            <p>添加照片后，这里会自动生成照片墙。</p>
          </section>
        )}
      </div>

      <div className="gallery-vignette" aria-hidden="true" />
      <div className="torch-overlay" aria-hidden="true" />
      <div className="torch-glow" aria-hidden="true" />

      <header className="gallery-header">
        <div className="brand">
          <span className="brand-icon"><PhotoAlbumRegular size={18} /></span>
          <span className="text"><strong>fffaa photo</strong><small>Infinite Wall</small></span>
        </div>

        <div className="header-controls">
          <div className="effect-menu" role="group" aria-label="墙面效果">
            <button
              type="button"
              className={`effect-option${effectId === 'grid' ? ' is-active' : ''}`}
              aria-label="经典网格"
              aria-pressed={effectId === 'grid'}
              onClick={() => changeEffect('grid')}
            >
              <GridRegular size={16} />
              <span>经典网格</span>
            </button>
            <button
              type="button"
              className={`effect-option${effectId === 'dome' ? ' is-active' : ''}`}
              aria-label="穹顶透镜"
              aria-pressed={effectId === 'dome'}
              onClick={() => changeEffect('dome')}
            >
              <Magic1Regular size={16} />
              <span>穹顶透镜</span>
            </button>
          </div>

          <nav className="buttons" aria-label="展示控制">
            <button
              type="button"
              className={`control-btn${torchEnabled ? ' is-active' : ''}`}
              title="手电筒"
              aria-label="手电筒"
              aria-pressed={torchEnabled}
              onClick={() => {
                setTorchEnabled((current) => !current)
                showStatus(torchEnabled ? '手电筒已关闭' : '手电筒已开启')
              }}
            >
              <FlashlightRegular size={18} />
            </button>
            <button
              type="button"
              className="control-btn"
              title="回到中心"
              aria-label="回到中心"
              onClick={() => {
                motion.reset()
                showStatus('已回到照片墙中心')
              }}
            >
              <TargetRegular size={18} />
            </button>
          </nav>
        </div>
      </header>

      <nav className="zoom-dock" aria-label="缩放控制">
        <button className="dock-btn" type="button" title="缩小" aria-label="缩小" disabled={zoom <= MIN_ZOOM} onClick={() => updateZoom(zoom - ZOOM_STEP)}>
          <ZoomOutRegular size={18} />
        </button>
        <span className="zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button className="dock-btn" type="button" title="放大" aria-label="放大" disabled={zoom >= MAX_ZOOM} onClick={() => updateZoom(zoom + ZOOM_STEP)}>
          <ZoomInRegular size={18} />
        </button>
        <span className="dock-divider" />
        <button className={`dock-btn${Math.abs(zoom - 1) < 0.001 ? ' is-active' : ''}`} type="button" title="适配屏幕" aria-label="适配屏幕" onClick={() => updateZoom(1)}>
          <FullscreenRegular size={18} />
        </button>
      </nav>

      <div className={`interaction-hint${hintVisible ? '' : ' is-hidden'}`} aria-hidden="true">
        <span>拖动浏览</span><span className="hint-dot" /><span>点击照片查看详情</span>
      </div>
      <div className={`wall-status${status ? ' is-visible' : ''}`} role="status" aria-live="polite">{status}</div>

      <div className={`loading-cover${coverReady ? ' is-done' : ''}`} aria-hidden={coverReady}>
        <div className="cover-inner">
          <PhotoAlbumRegular className="cover-icon" size={32} />
          <span>正在加载照片墙…</span>
        </div>
      </div>

      {activeItem && active && (
        <PhotoViewer
          item={activeItem}
          index={active.photoIndex}
          total={images.length}
          metadata={metadata[activeItem.src]}
          expanded={panelExpanded}
          onExpandedChange={setPanelExpanded}
          onClose={closePhoto}
          onPrevious={previousPhoto}
          onNext={nextPhoto}
        />
      )}
    </main>
  )
}
