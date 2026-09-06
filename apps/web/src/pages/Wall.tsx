import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Grid2X2, Plus, Minus, RotateCcw, Flashlight, Orbit } from 'lucide-react'
import { usePhotos } from '../lib/api'
import { Empty, ErrorState, IconButton, Spinner } from '../components/ui'
const mod = (value: number, base: number) => ((value % base) + base) % base
export default function Wall() {
  const result = usePhotos({ limit: '60' }),
    photos = useMemo(() => result.data?.pages.flatMap((p) => p.photos) || [], [result.data]),
    location = useLocation(),
    navigate = useNavigate()
  const stage = useRef<HTMLDivElement>(null),
    pool = useRef<HTMLDivElement>(null),
    shade = useRef<HTMLDivElement>(null),
    wake = useRef<() => void>(() => {}),
    reset = useRef<() => void>(() => {})
  const [zoom, setZoom] = useState(1),
    [curved, setCurved] = useState(true),
    [torch, setTorch] = useState(false)
  const settings = useRef({ zoom, curved, torch })
  settings.current = { zoom, curved, torch }
  const openPhoto = useRef((id: string) =>
    navigate(`/photos/${id}`, { state: { background: location } }),
  )
  openPhoto.current = (id) => navigate(`/photos/${id}`, { state: { background: location } })
  useEffect(() => {
    if (result.hasNextPage && !result.isFetchingNextPage && !result.isFetchNextPageError)
      void result.fetchNextPage()
  }, [result.hasNextPage, result.isFetchingNextPage, result.isFetchNextPageError])
  useEffect(() => {
    wake.current()
  }, [zoom, curved, torch])
  useEffect(() => {
    const root = stage.current,
      parent = pool.current
    if (!root || !parent || !photos.length) return
    let width = root.clientWidth,
      height = root.clientHeight,
      frame = 0,
      currentX = 0,
      currentY = 0,
      targetX = 0,
      targetY = 0,
      pointerX = width / 2,
      pointerY = height / 2,
      previous = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cells: {
      button: HTMLButtonElement
      img: HTMLImageElement
      label: HTMLSpanElement
      index: number
    }[] = []
    let press: { x: number; y: number; ox: number; oy: number; id: string | null } | null = null
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDistance = 0,
      pinchZoom = 1
    const add = () => {
      const button = document.createElement('button'),
        img = document.createElement('img'),
        label = document.createElement('span')
      button.className = 'wall-tile'
      button.type = 'button'
      img.draggable = false
      img.decoding = 'async'
      img.loading = 'lazy'
      button.append(img, label)
      parent.append(button)
      const cell = { button, img, label, index: -1 }
      cells.push(cell)
      return cell
    }
    const draw = (now: number) => {
      frame = 0
      const dt = Math.min(3, (now - previous) / 16.67 || 1)
      previous = now
      const damping = reduced ? 1 : 1 - 0.82 ** dt
      currentX += (targetX - currentX) * damping
      currentY += (targetY - currentY) * damping
      const cellW =
          (width < 600 ? 168 : Math.max(200, Math.min(310, width / 5))) * settings.current.zoom,
        cellH = cellW * 0.82,
        gap = 20 * settings.current.zoom
      const cols = Math.ceil(width / cellW) + 2,
        rows = Math.ceil(height / cellH) + 2
      const col0 = Math.floor(currentX / cellW) - 1,
        row0 = Math.floor(currentY / cellH) - 1
      for (let i = 0; i < rows * cols; i++) {
        const cell = cells[i] || add(),
          col = col0 + (i % cols),
          row = row0 + Math.floor(i / cols)
        const x = col * cellW - currentX,
          y = row * cellH - currentY,
          nx = (x + cellW / 2 - width / 2) / width,
          ny = (y + cellH / 2 - height / 2) / height
        const index = mod(col + row * 17, photos.length),
          photo = photos[index]
        if (cell.index !== index) {
          cell.index = index
          cell.img.src = photo.urls.md
          cell.img.alt = photo.title
          cell.button.dataset.photoId = photo.id
          cell.button.setAttribute('aria-label', `查看照片：${photo.title}`)
          cell.label.textContent = photo.title
        }
        const warp = settings.current.curved ? 1 + 0.15 * (nx * nx + ny * ny) : 1
        const lens =
          !press && settings.current.curved
            ? 0.05 *
              Math.exp(
                -((x + cellW / 2 - pointerX) ** 2 + (y + cellH / 2 - pointerY) ** 2) /
                  (cellW * cellW),
              )
            : 0
        cell.button.style.display = 'block'
        cell.button.style.width = `${cellW - gap}px`
        cell.button.style.height = `${cellH - gap}px`
        cell.button.style.transform = `translate3d(${width / 2 + (x - width / 2) * warp}px,${height / 2 + (y - height / 2) * warp}px,0) perspective(900px) rotateX(${settings.current.curved ? -ny * 12 : 0}deg) rotateY(${settings.current.curved ? nx * 12 : 0}deg) scale(${1 + lens})`
      }
      for (let i = rows * cols; i < cells.length; i++) cells[i].button.style.display = 'none'
      if (shade.current) {
        shade.current.style.setProperty('--torch-x', `${pointerX}px`)
        shade.current.style.setProperty('--torch-y', `${pointerY}px`)
      }
      if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.1)
        frame = requestAnimationFrame(draw)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    wake.current = schedule
    reset.current = () => {
      targetX = targetY = 0
      setZoom(1)
      schedule()
    }
    const resize = new ResizeObserver(() => {
      width = root.clientWidth
      height = root.clientHeight
      schedule()
    })
    resize.observe(root)
    const down = (event: PointerEvent) => {
      root.focus({ preventScroll: true })
      root.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      press = {
        x: event.clientX,
        y: event.clientY,
        ox: targetX,
        oy: targetY,
        id:
          (event.target as HTMLElement).closest<HTMLButtonElement>('[data-photo-id]')?.dataset
            .photoId || null,
      }
      if (pointers.size === 2) {
        const p = [...pointers.values()]
        pinchDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
        pinchZoom = settings.current.zoom
      }
      root.classList.add('dragging')
    }
    const move = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect()
      pointerX = event.clientX - rect.left
      pointerY = event.clientY - rect.top
      if (pointers.has(event.pointerId))
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2 && pinchDistance) {
        const p = [...pointers.values()]
        setZoom(
          Math.max(
            0.65,
            Math.min(
              1.8,
              (pinchZoom * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)) / pinchDistance,
            ),
          ),
        )
      } else if (press) {
        targetX = press.ox - event.clientX + press.x
        targetY = press.oy - event.clientY + press.y
      }
      schedule()
    }
    const up = (event: PointerEvent) => {
      if (
        press?.id &&
        !pinchDistance &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) < 7
      )
        openPhoto.current(press.id)
      pointers.delete(event.pointerId)
      press = null
      if (!pointers.size) pinchDistance = 0
      root.classList.remove('dragging')
      schedule()
    }
    const cancel = () => {
      pointers.clear()
      press = null
      pinchDistance = 0
      root.classList.remove('dragging')
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey)
        setZoom((v) => Math.max(0.65, Math.min(1.8, v * Math.exp(-event.deltaY * 0.003))))
      else {
        targetX += event.deltaX
        targetY += event.deltaY
      }
      schedule()
    }
    const key = (event: KeyboardEvent) => {
      const amount = 170
      if (event.key === 'ArrowLeft') targetX -= amount
      else if (event.key === 'ArrowRight') targetX += amount
      else if (event.key === 'ArrowUp') targetY -= amount
      else if (event.key === 'ArrowDown' || event.key === ' ') targetY += amount
      else return
      event.preventDefault()
      schedule()
    }
    const click = (event: MouseEvent) => {
      if (event.detail !== 0) return
      const id = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-photo-id]')
        ?.dataset.photoId
      if (id) openPhoto.current(id)
    }
    root.addEventListener('pointerdown', down)
    root.addEventListener('pointermove', move)
    root.addEventListener('pointerup', up)
    root.addEventListener('pointercancel', cancel)
    root.addEventListener('wheel', wheel, { passive: false })
    root.addEventListener('keydown', key)
    root.addEventListener('click', click)
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      root.removeEventListener('pointerdown', down)
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerup', up)
      root.removeEventListener('pointercancel', cancel)
      root.removeEventListener('wheel', wheel)
      root.removeEventListener('keydown', key)
      root.removeEventListener('click', click)
      parent.replaceChildren()
      wake.current = () => {}
    }
  }, [photos])
  return (
    <section className="wall-page">
      <h1 className="sr-only">无限照片墙</h1>
      <div
        className="wall-stage"
        ref={stage}
        tabIndex={0}
        aria-label="无限照片墙：拖拽或方向键移动，双指或 Ctrl 加滚轮缩放"
      >
        <div className="wall-pool" ref={pool} />
        <div className={`wall-shade ${torch ? 'enabled' : ''}`} ref={shade} />
      </div>
      {result.isPending && (
        <div className="wall-empty">
          <Spinner />
        </div>
      )}
      {result.isError && (
        <div className="wall-empty">
          <ErrorState error={result.error} retry={() => void result.refetch()} />
        </div>
      )}
      {!result.isPending && !photos.length && (
        <div className="wall-empty">
          <Empty
            title="照片墙还在等第一帧"
            action={
              <Link to="/admin" className="button glass">
                上传照片
              </Link>
            }
          />
        </div>
      )}
      <div className="wall-controls glass">
        <Link to="/" className="icon-button" aria-label="返回照片网格">
          <Grid2X2 size={19} />
        </Link>
        <span className="control-divider" />
        <IconButton
          label="缩小照片墙"
          disabled={zoom <= 0.65}
          onClick={() => setZoom(Math.max(0.65, zoom - 0.15))}
        >
          <Minus size={18} />
        </IconButton>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <IconButton
          label="放大照片墙"
          disabled={zoom >= 1.8}
          onClick={() => setZoom(Math.min(1.8, zoom + 0.15))}
        >
          <Plus size={18} />
        </IconButton>
        <span className="control-divider" />
        <IconButton label="穹顶效果" aria-pressed={curved} onClick={() => setCurved(!curved)}>
          <Orbit size={19} />
        </IconButton>
        <IconButton label="聚光效果" aria-pressed={torch} onClick={() => setTorch(!torch)}>
          <Flashlight size={18} />
        </IconButton>
        <IconButton label="重置照片墙" onClick={() => reset.current()}>
          <RotateCcw size={17} />
        </IconButton>
      </div>
      <span className="wall-hint glass">{photos.length} 帧 · 拖动探索</span>
    </section>
  )
}
