import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Info,
  Download,
  Share2,
  Maximize,
  Camera,
  MapPin,
  CalendarDays,
  Play,
  Pause,
} from 'lucide-react'
import type { PhotoDetail } from '@fanphoto/shared'
import { api, shortDate, useSite } from '../lib/api'
import { Modal, IconButton, Spinner, ErrorState, useToast } from '../components/ui'
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
  const [info, setInfo] = useState(() => window.innerWidth > 1000),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [live, setLive] = useState(false),
    [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false)
  const stage = useRef<HTMLDivElement>(null),
    img = useRef<HTMLImageElement>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef({ x: 0, y: 0, panX: 0, panY: 0, distance: 0, zoom: 1 })
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
    if (zoom === 1) setPan({ x: 0, y: 0 })
  }, [zoom])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return
      if (event.key === 'ArrowRight') turn(result.data?.nextId)
      if (event.key === 'ArrowLeft') turn(result.data?.previousId)
      if (event.key.toLowerCase() === 'i') setInfo((v) => !v)
      if (event.key === '+' || event.key === '=') setZoom((v) => clamp(v + 0.5, 1, 5))
      if (event.key === '-') setZoom((v) => clamp(v - 0.5, 1, 5))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [result.data, location.state])
  useEffect(() => {
    const node = stage.current
    if (!node) return
    const wheel = (e: WheelEvent) => {
      if (live) return
      e.preventDefault()
      setZoom((v) => clamp(v * Math.exp(-e.deltaY * 0.002), 1, 5))
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [photo, live])
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
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('请从地址栏复制照片链接', true)
    }
  }
  return (
    <Modal title={photo?.title || '照片'} onClose={close} className="viewer-modal">
      {result.isPending ? (
        <div className="viewer-loading">
          <Spinner />
        </div>
      ) : result.isError ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
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
                      1,
                      5,
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
                  <button
                    className="button glass"
                    onClick={() => {
                      setFailed(false)
                      if (img.current) img.current.src = `${photo.urls.lg}?retry=${Date.now()}`
                    }}
                  >
                    重试
                  </button>
                </div>
              )}
              {result.data?.previousId && (
                <IconButton
                  label="上一张"
                  className="viewer-prev glass"
                  onClick={() => turn(result.data?.previousId)}
                >
                  <ChevronLeft size={22} />
                </IconButton>
              )}
              {result.data?.nextId && (
                <IconButton
                  label="下一张"
                  className="viewer-next glass"
                  onClick={() => turn(result.data?.nextId)}
                >
                  <ChevronRight size={22} />
                </IconButton>
              )}
              <div className="viewer-controls glass">
                <IconButton
                  label="缩小"
                  disabled={zoom <= 1 || live}
                  onClick={() => setZoom(clamp(zoom - 0.5, 1, 5))}
                >
                  <ZoomOut size={19} />
                </IconButton>
                <button className="zoom-label" onClick={() => setZoom(1)} aria-label="重置缩放">
                  {Math.round(zoom * 100)}%
                </button>
                <IconButton
                  label="放大"
                  disabled={zoom >= 5 || live}
                  onClick={() => setZoom(clamp(zoom + 0.5, 1, 5))}
                >
                  <ZoomIn size={19} />
                </IconButton>
                <span className="control-divider" />
                {photo.videoUrl && (
                  <IconButton label={live ? '停止实况' : '播放实况'} onClick={() => setLive(!live)}>
                    {live ? <Pause size={18} /> : <Play size={18} />}
                  </IconButton>
                )}
                <IconButton
                  label="全屏"
                  onClick={() => {
                    const dialog = stage.current?.closest('dialog')
                    if (document.fullscreenElement) void document.exitFullscreen()
                    else
                      void dialog
                        ?.requestFullscreen()
                        .catch(() => toast('浏览器暂不支持全屏', true))
                  }}
                >
                  <Maximize size={18} />
                </IconButton>
                <IconButton label="照片信息" aria-pressed={info} onClick={() => setInfo(!info)}>
                  <Info size={19} />
                </IconButton>
              </div>
            </div>
            <AnimatePresence>
              {info && (
                <motion.aside
                  className="photo-info"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                >
                  <div className="info-title">
                    <span className="eyebrow">FRAME / {photo.id.slice(-4).toUpperCase()}</span>
                    <h2>{photo.title}</h2>
                    {photo.description && <p>{photo.description}</p>}
                    {photo.isDemo && <span className="small-tag">演示素材</span>}
                  </div>
                  {(photo.exif.model || photo.exif.make) && (
                    <div className="camera-line">
                      <Camera size={18} />
                      <div>
                        <strong>
                          {[photo.exif.make, photo.exif.model].filter(Boolean).join(' ')}
                        </strong>
                        {photo.exif.lens && <small>{photo.exif.lens}</small>}
                      </div>
                    </div>
                  )}
                  <dl className="exif-grid">
                    {[
                      [photo.exif.focalLength ? `${photo.exif.focalLength} mm` : null, '焦距'],
                      [photo.exif.aperture ? `ƒ/${photo.exif.aperture}` : null, '光圈'],
                      [
                        photo.exif.exposureTime
                          ? photo.exif.exposureTime < 1
                            ? `1/${Math.round(1 / photo.exif.exposureTime)} s`
                            : `${photo.exif.exposureTime} s`
                          : null,
                        '快门',
                      ],
                      [photo.exif.iso ? `ISO ${photo.exif.iso}` : null, '感光度'],
                    ]
                      .filter(([value]) => value)
                      .map(([value, label]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                  </dl>
                  <div className="info-meta">
                    {photo.takenAt && (
                      <span>
                        <CalendarDays size={15} />
                        {shortDate(photo.takenAt)}
                      </span>
                    )}
                    <span>
                      {photo.width} × {photo.height}
                    </span>
                    {photo.latitude !== null && (
                      <Link to="/map">
                        <MapPin size={15} />
                        {photo.location ||
                          `${photo.latitude.toFixed(3)}, ${photo.longitude?.toFixed(3)}`}
                      </Link>
                    )}
                  </div>
                  {photo.analysis && (
                    <div className="color-analysis">
                      <div className="palette">
                        {photo.analysis.colors.map((color, index) => (
                          <button
                            key={`${color}-${index}`}
                            style={{ backgroundColor: color }}
                            title={color}
                            aria-label={`复制颜色 ${color}`}
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(color)
                                .then(() => toast(`${color} 已复制`))
                                .catch(() => toast(color))
                            }
                          />
                        ))}
                      </div>
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
                      <div className="analysis-label">
                        <span>影调</span>
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
                    <button className="button glass" onClick={() => void share()}>
                      <Share2 size={17} />
                      分享
                    </button>
                    {site.data?.site.allowDownload && (
                      <a
                        className="button glass"
                        href={`/api/photos/${photo.id}/download`}
                        download
                      >
                        <Download size={17} />
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
    </Modal>
  )
}
