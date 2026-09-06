import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { PhotoDetail } from '@fanphoto/shared'
import { api, shortDate, useSite } from '../lib/api'
import { photoSite } from '../config/site'
import { Icon } from '../lib/icons'
import { GlassButton, GlassIconButton } from '../components/public/controls'
import { useToast } from '../components/ui'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export default function Viewer() {
  const { id } = useParams(),
    navigate = useNavigate(),
    location = useLocation(),
    toast = useToast(),
    site = useSite(),
    reduced = useReducedMotion()
  const result = useQuery({
      queryKey: ['photo', id],
      queryFn: () => api<PhotoDetail>(`/photos/${id}`),
    }),
    photo = result.data?.photo
  const [info, setInfo] = useState(false),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [live, setLive] = useState(false),
    [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false)
  const stage = useRef<HTMLDivElement>(null),
    img = useRef<HTMLImageElement>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    drag = useRef({ x: 0, y: 0, panX: 0, panY: 0, distance: 0, zoom: 1 })
  const cfg = photoSite.viewer

  const close = () => (location.state?.background ? navigate(-1) : navigate('/', { replace: true }))
  const turn = (next: string | null | undefined) => {
    if (next) navigate(`/photos/${next}`, { replace: true, state: location.state })
  }

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setLive(false)
    setLoaded(false)
    setFailed(false)
    pointers.current.clear()
  }, [id])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return
      if (event.key === 'Escape') close()
      if (event.key === 'ArrowRight') turn(result.data?.nextId)
      if (event.key === 'ArrowLeft') turn(result.data?.previousId)
      if (event.key.toLowerCase() === 'i') setInfo((v) => !v)
      if (event.key === '+' || event.key === '=')
        setZoom((v) => clamp(v + cfg.zoomStep, cfg.zoomMin, cfg.zoomMax))
      if (event.key === '-') setZoom((v) => clamp(v - cfg.zoomStep, cfg.zoomMin, cfg.zoomMax))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [result.data, location.state])

  useEffect(() => {
    const node = stage.current
    if (!node || live) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      setZoom((v) => clamp(v * Math.exp(-event.deltaY * 0.002), cfg.zoomMin, cfg.zoomMax))
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [photo, live, cfg.zoomMin, cfg.zoomMax])

  const move = (x: number, y: number) => {
    const maxX = Math.max(
        0,
        ((img.current?.clientWidth || 0) * zoom - (stage.current?.clientWidth || 0)) / 2,
      ),
      maxY = Math.max(
        0,
        ((img.current?.clientHeight || 0) * zoom - (stage.current?.clientHeight || 0)) / 2,
      )
    setPan({ x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) })
  }

  const share = async () => {
    try {
      const url = `${window.location.origin}/photos/${id}`
      if (navigator.share && navigator.maxTouchPoints > 0)
        await navigator.share({ title: photo?.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('链接已复制')
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast('请从地址栏复制照片链接', true)
    }
  }

  return (
    <div
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={photo?.title || '照片'}
    >
      <div className="viewer-top">
        <GlassIconButton label="关闭" icon="close-line" className="viewer-close" onClick={close} />
        <div className="viewer-title liquid">
          <span>{photo?.title || ''}</span>
        </div>
      </div>
      {result.isPending ? (
        <div className="viewer-loading">
          <span className="dot-pulse" />
        </div>
      ) : result.isError ? (
        <div className="viewer-error liquid">
          <p>照片暂时无法显示</p>
          <GlassButton onClick={() => void result.refetch()}>重试</GlassButton>
        </div>
      ) : (
        photo && (
          <div className={`viewer-content ${info ? 'with-info' : ''}`}>
            <div
              className={`viewer-stage ${zoom > 1 ? 'zoomed' : ''}`}
              ref={stage}
              onDoubleClick={() => setZoom(zoom === 1 ? 2 : 1)}
              onPointerDown={(e) => {
                if (live || (e.target as HTMLElement).closest('button,a')) return
                e.currentTarget.setPointerCapture(e.pointerId)
                pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
                const points = [...pointers.current.values()]
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  panX: pan.x,
                  panY: pan.y,
                  distance:
                    points.length === 2
                      ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
                      : 0,
                  zoom,
                }
              }}
              onPointerMove={(e) => {
                if (!pointers.current.has(e.pointerId)) return
                pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
                const points = [...pointers.current.values()]
                if (points.length === 2 && drag.current.distance)
                  setZoom(
                    clamp(
                      (drag.current.zoom *
                        Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)) /
                        drag.current.distance,
                      cfg.zoomMin,
                      cfg.zoomMax,
                    ),
                  )
                else if (zoom > 1)
                  move(
                    drag.current.panX + e.clientX - drag.current.x,
                    drag.current.panY + e.clientY - drag.current.y,
                  )
              }}
              onPointerUp={(e) => {
                if (
                  pointers.current.size === 1 &&
                  !drag.current.distance &&
                  zoom === 1 &&
                  Math.abs(e.clientX - drag.current.x) > 65 &&
                  Math.abs(e.clientX - drag.current.x) > Math.abs(e.clientY - drag.current.y) * 1.4
                )
                  turn(e.clientX > drag.current.x ? result.data?.previousId : result.data?.nextId)
                pointers.current.delete(e.pointerId)
              }}
              onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
            >
              {live && photo.videoUrl ? (
                <video
                  className="live-video"
                  src={photo.videoUrl}
                  autoPlay
                  loop
                  playsInline
                  controls
                  onError={() => {
                    setLive(false)
                    toast('当前浏览器不支持这个实况片段', true)
                  }}
                />
              ) : (
                <>
                  <img
                    className="viewer-placeholder"
                    src={photo.urls.sm}
                    alt=""
                    aria-hidden="true"
                    style={{ opacity: loaded ? 0 : 1 }}
                  />
                  <motion.img
                    ref={img}
                    key={photo.id}
                    className={`viewer-image ${loaded ? 'loaded' : ''}`}
                    src={photo.urls.lg}
                    alt={photo.title}
                    draggable={false}
                    onLoad={() => setLoaded(true)}
                    onError={() => setFailed(true)}
                    animate={{ scale: zoom, x: pan.x, y: pan.y }}
                    transition={{ duration: pointers.current.size || reduced ? 0 : 0.18 }}
                  />
                </>
              )}
              {failed && (
                <div className="viewer-image-error">
                  <p>图片加载失败</p>
                  <GlassButton
                    onClick={() => {
                      setFailed(false)
                      if (img.current) img.current.src = `${photo.urls.lg}?retry=${Date.now()}`
                    }}
                  >
                    重试
                  </GlassButton>
                </div>
              )}
              {result.data?.previousId && (
                <GlassIconButton
                  label="上一张"
                  icon="arrow-left-line"
                  className="viewer-prev"
                  onClick={() => turn(result.data?.previousId)}
                />
              )}
              {result.data?.nextId && (
                <GlassIconButton
                  label="下一张"
                  icon="arrow-right-line"
                  className="viewer-next"
                  onClick={() => turn(result.data?.nextId)}
                />
              )}
              <div className="viewer-controls liquid">
                <GlassIconButton
                  label="缩小"
                  icon="zoom-out-line"
                  disabled={zoom <= cfg.zoomMin || live}
                  onClick={() => setZoom(clamp(zoom - cfg.zoomStep, cfg.zoomMin, cfg.zoomMax))}
                />
                <button
                  className="zoom-label"
                  onClick={() => setZoom(1)}
                  aria-label="重置缩放"
                  title="重置缩放"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <GlassIconButton
                  label="放大"
                  icon="zoom-in-line"
                  disabled={zoom >= cfg.zoomMax || live}
                  onClick={() => setZoom(clamp(zoom + cfg.zoomStep, cfg.zoomMin, cfg.zoomMax))}
                />
                <span className="control-divider" />
                {photo.videoUrl && (
                  <GlassIconButton
                    label={live ? '暂停实况' : '播放实况'}
                    icon={live ? 'pause-line' : 'play-line'}
                    onClick={() => setLive(!live)}
                  />
                )}
                <GlassIconButton
                  label="全屏"
                  icon="fullscreen-line"
                  onClick={() => {
                    if (document.fullscreenElement) void document.exitFullscreen()
                    else
                      void stage.current
                        ?.requestFullscreen()
                        .catch(() => toast('浏览器暂不支持全屏', true))
                  }}
                />
                <GlassIconButton
                  label="照片信息"
                  icon="information-line"
                  active={info}
                  onClick={() => setInfo(!info)}
                />
              </div>
            </div>
            <AnimatePresence>
              {info && (
                <motion.aside
                  className="photo-info liquid"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                >
                  <div className="info-title">
                    <h2>{photo.title}</h2>
                    {photo.description && <p>{photo.description}</p>}
                  </div>
                  <dl className="exif-grid">
                    {photo.takenAt && (
                      <div>
                        <dt>日期</dt>
                        <dd>{shortDate(photo.takenAt)}</dd>
                      </div>
                    )}
                    <div>
                      <dt>尺寸</dt>
                      <dd>
                        {photo.width} × {photo.height}
                      </dd>
                    </div>
                    {photo.exif.model && (
                      <div>
                        <dt>相机</dt>
                        <dd>{photo.exif.model}</dd>
                      </div>
                    )}
                    {photo.latitude !== null && (
                      <div>
                        <dt>位置</dt>
                        <dd>
                          {photo.location ||
                            `${photo.latitude.toFixed(3)}, ${photo.longitude?.toFixed(3)}`}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {photo.analysis && (
                    <div className="color-analysis">
                      <svg
                        className="histogram"
                        viewBox="0 0 252 64"
                        role="img"
                        aria-label="亮度直方图"
                      >
                        <path
                          d={`M0,64 ${photo.analysis.histogram.map((value, index) => `L${index * 4},${62 - (value / Math.max(...photo.analysis!.histogram, 0.001)) * 55}`).join(' ')} L252,64 Z`}
                        />
                      </svg>
                      <span>
                        {
                          {
                            'low-key': '低调',
                            'high-key': '高调',
                            'high-contrast': '高对比',
                            balanced: '均衡',
                          }[photo.analysis.tone]
                        }
                      </span>
                    </div>
                  )}
                  {!!photo.tags.length && (
                    <div className="photo-tags">
                      {photo.tags.map((tag) => (
                        <Link key={tag} to={`/?tag=${encodeURIComponent(tag)}`}>
                          #{tag}
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="info-actions">
                    <GlassButton icon="share-forward-line" onClick={() => void share()}>
                      分享
                    </GlassButton>
                    {site.data?.site.allowDownload && (
                      <a
                        className="liquid pill-btn"
                        href={`/api/photos/${photo.id}/download`}
                        download
                      >
                        <Icon icon="mingcute:download-2-line" width={17} height={17} />
                        下载
                      </a>
                    )}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </div>
        )
      )}
    </div>
  )
}
