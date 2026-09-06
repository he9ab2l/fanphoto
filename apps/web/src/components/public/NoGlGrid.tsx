import { useEffect, useRef, useState } from 'react'
import { photoSite } from '../../config/site'
import { Icon } from '../../lib/icons'
import { GlassIconButton } from './controls'

interface GridPhoto {
  id: string
  title: string
  urls: { sm: string; md: string; lg: string }
}

interface Point {
  x: number
  y: number
}

interface CardCell {
  el: HTMLButtonElement
  img: HTMLImageElement
  index: number
}

interface FlipState {
  index: number
  id: string
  progress: number
  opening: boolean
  opened: boolean
}

const cfg = photoSite.grid
const mod = (value: number, base: number) => ((value % base) + base) % base
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function matrix(w: number, q0: Point, q1: Point, q2: Point, q3: Point) {
  const dx1 = q1.x - q3.x,
    dy1 = q1.y - q3.y,
    dx2 = q2.x - q3.x,
    dy2 = q2.y - q3.y,
    sx = q0.x - q1.x - q2.x + q3.x,
    sy = q0.y - q1.y - q2.y + q3.y,
    den = dx1 * dy2 - dx2 * dy1
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0,
    h = den ? (dx1 * sy - sx * dy1) / den : 0,
    a = q1.x - q0.x + g * q1.x,
    b = q2.x - q0.x + h * q2.x,
    d = q1.y - q0.y + g * q1.y,
    e = q2.y - q0.y + h * q2.y
  return `matrix3d(${a / w}, ${d / w}, 0, ${g / w}, ${b / w}, ${e / w}, 0, ${h / w}, 0, 0, 1, 0, ${q0.x}, ${q0.y}, 0, 1)`
}

export default function NoGlGrid({
  photos,
  onOpen,
  context,
}: {
  photos: GridPhoto[]
  onOpen: (id: string) => void
  context?: string
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const poolRef = useRef<HTMLDivElement>(null)
  const shadeRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)
  const coverRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [curved, setCurved] = useState(true)
  const [torch, setTorch] = useState(false)
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  const settings = useRef({ zoom: 1, curved: true, torch: false })
  settings.current = { zoom, curved, torch }
  const wakeRef = useRef<() => void>(() => {})
  const resetRef = useRef<() => void>(() => {})

  useEffect(() => {
    const root = stageRef.current,
      parent = poolRef.current
    if (!root || !parent || !photos.length) return

    let width = root.clientWidth,
      height = root.clientHeight,
      x = 0,
      y = 0,
      tx = 0,
      ty = 0,
      frame = 0,
      previous = performance.now()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const half = () => ({ x: width / 2, y: height / 2 })
    let cursor = { x: 0, y: 0 }
    let cursorTarget = { x: 0, y: 0 }
    const cells: CardCell[] = []
    const pointers = new Map<number, Point>()
    let press: {
      px: number
      py: number
      ox: number
      oy: number
      id: string | null
      index: number
    } | null = null
    let pinchDistance = 0
    let pinchZoom = 1
    let flip: FlipState = { index: -1, id: '', progress: 0, opening: false, opened: false }
    let resetFlipTimer: ReturnType<typeof setTimeout> | undefined

    const addCell = () => {
      const el = document.createElement('button')
      const img = document.createElement('img')
      el.type = 'button'
      el.className = 'wall-tile'
      img.draggable = false
      img.decoding = 'async'
      img.loading = 'lazy'
      el.append(img)
      parent.append(el)
      const cell = { el, img, index: -1 }
      cells.push(cell)
      return cell
    }

    const warp = (px: number, py: number) => {
      const center = half(),
        nx = (px - center.x) / center.x,
        ny = (py - center.y) / center.y,
        f = 1 + (settings.current.curved ? cfg.bow : 0) * (nx * nx + ny * ny)
      let wx = (px - center.x) * f,
        wy = (py - center.y) * f
      const dx = wx - cursor.x,
        dy = wy - cursor.y,
        reach2 = (cfg.reach * (width / cfg.visibleColumns) * settings.current.zoom) ** 2,
        push = settings.current.curved ? cfg.bulge * Math.exp(-(dx * dx + dy * dy) / reach2) : 0
      return { x: center.x + wx + dx * push, y: center.y + wy + dy * push }
    }

    const inset = (corner: Point, alongA: Point, alongB: Point, amount: number) => {
      const ax = alongA.x - corner.x,
        ay = alongA.y - corner.y,
        bx = alongB.x - corner.x,
        by = alongB.y - corner.y,
        la = Math.hypot(ax, ay) || 1,
        lb = Math.hypot(bx, by) || 1
      return {
        x: corner.x + (ax / la + bx / lb) * amount,
        y: corner.y + (ay / la + by / lb) * amount,
      }
    }

    const damp = (from: number, to: number, rate: number, dt: number) =>
      reduced ? to : from + (to - from) * (1 - Math.pow(1 - rate, dt * 60))

    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(draw)
      }
    }
    wakeRef.current = schedule

    const draw = (now: number) => {
      frame = 0
      const dt = Math.min(3, (now - previous) / 16.67 || 1)
      previous = now
      const lag = Math.hypot(tx - x, ty - y)
      const calm = reduced ? 1 : 1 / (1 + lag / 40)
      x = damp(x, tx, cfg.dampScroll, dt)
      y = damp(y, ty, cfg.dampScroll, dt)
      cursor.x = damp(cursor.x, cursorTarget.x, 0.14, dt)
      cursor.y = damp(cursor.y, cursorTarget.y, 0.14, dt)
      if (flip.opening || flip.progress > 0) {
        const flipTarget = flip.opening ? 1 : 0
        if (flip.progress !== flipTarget)
          flip.progress = damp(flip.progress, flipTarget, flip.opening ? 0.7 : 0.6, dt)
      }

      const period =
        Math.max(170, Math.min(430, width / cfg.visibleColumns)) * settings.current.zoom
      const card = period - cfg.gap
      const halfGap = cfg.gap / 2
      const center = half()
      const cols = Math.ceil(width / period) + 2
      const rows = Math.ceil(height / period) + 2
      const col0 = Math.floor(x / period) - 1
      const row0 = Math.floor(y / period) - 1
      let active = 0

      for (let i = 0; i < cols * rows; i++) {
        const col = col0 + (i % cols),
          row = row0 + Math.floor(i / cols)
        const left = col * period - x,
          top = row * period - y
        if (
          left > width + period ||
          left + period < -period ||
          top > height + period ||
          top + period < -period
        ) {
          if (cells[i]) cells[i].el.style.display = 'none'
          continue
        }
        const cell = cells[i] || addCell()
        const index = mod(col * 31 + row * 17, photos.length)
        const photo = photos[index]
        if (cell.index !== index) {
          cell.index = index
          cell.img.src = photo.urls.md
          cell.img.alt = photo.title
          cell.el.dataset.photoId = photo.id
          cell.el.dataset.gridIndex = String(i)
          cell.el.setAttribute('aria-label', `查看照片：${photo.title}`)
        }

        const l = left - halfGap,
          r = left + card + halfGap,
          t = top - halfGap,
          b = top + card + halfGap
        let tl = warp(l, t),
          tr = warp(r, t),
          bl = warp(l, b),
          br = warp(r, b)
        tl = inset(tl, tr, bl, halfGap)
        tr = inset(tr, tl, br, halfGap)
        bl = inset(bl, tl, br, halfGap)
        br = inset(br, tr, bl, halfGap)

        if (flip.index === i && flip.progress > 0) {
          const size = Math.min(width, height) * cfg.flipFraction
          const sx = center.x - size / 2,
            sy = center.y - size / 2
          const ex = center.x + size / 2,
            ey = center.y + size / 2
          const mix = (a: Point, b: Point) => ({
            x: a.x + (b.x - a.x) * flip.progress,
            y: a.y + (b.y - a.y) * flip.progress,
          })
          tl = mix(tl, { x: sx, y: sy })
          tr = mix(tr, { x: ex, y: sy })
          bl = mix(bl, { x: sx, y: ey })
          br = mix(br, { x: ex, y: ey })
        }

        cell.el.style.display = 'block'
        cell.el.style.width = `${card}px`
        cell.el.style.height = `${card}px`
        cell.el.style.zIndex = flip.index === i ? '30' : '1'
        cell.el.style.transform = matrix(card, tl, tr, bl, br)
        active++
      }

      for (let i = cols * rows; i < cells.length; i++) cells[i].el.style.display = 'none'

      if (shadeRef.current) {
        const enabled = settings.current.torch
        shadeRef.current.style.opacity = enabled ? '1' : '0'
        if (enabled) {
          shadeRef.current.style.setProperty('--fx', `${cursor.x + center.x}px`)
          shadeRef.current.style.setProperty('--fy', `${cursor.y + center.y}px`)
        }
      }
      if (dimRef.current) {
        const falloff = flip.progress > 0 && flip.opening ? clamp(flip.progress * 1.6, 0, 1) : 0
        dimRef.current.style.opacity = String(falloff * 0.62)
      }

      const moving =
        Math.hypot(tx - x, ty - y) +
          Math.hypot(cursorTarget.x - cursor.x, cursorTarget.y - cursor.y) >
        0.1
      if (moving || (flip.opening ? flip.progress < 1 : flip.progress > 0)) schedule()

      if (flip.opening && flip.progress >= 1 && !flip.opened) {
        flip.opened = true
        openRef.current(flip.id)
        resetFlipTimer = setTimeout(() => {
          flip.opening = false
          schedule()
        }, 900)
      }
      if (!flip.opening && flip.progress <= 0 && flip.progress > -0.01) {
        if (flip.index !== -1) {
          flip = { index: -1, id: '', progress: 0, opening: false, opened: false }
        }
      }
    }

    const startFlip = (index: number, id: string) => {
      if (flip.opening) return
      flip = { index, id, progress: flip.progress || 0, opening: true, opened: false }
      schedule()
    }

    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('.grid-toolbar, .grid-context')) return
      root.focus({ preventScroll: true })
      root.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-grid-index]')
      press = {
        px: event.clientX,
        py: event.clientY,
        ox: tx,
        oy: ty,
        id: target?.dataset.photoId || null,
        index: target ? Number(target.dataset.gridIndex) : -1,
      }
      if (pointers.size === 2) {
        const points = [...pointers.values()]
        pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
        pinchZoom = settings.current.zoom
      }
      root.classList.add('is-dragging')
    }

    const move = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect()
      cursorTarget = {
        x: event.clientX - rect.left - width / 2,
        y: event.clientY - rect.top - height / 2,
      }
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pointers.size === 2 && pinchDistance) {
          const points = [...pointers.values()]
          setZoom(
            clamp(
              (pinchZoom * Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)) /
                pinchDistance,
              cfg.zoomMin,
              cfg.zoomMax,
            ),
          )
        } else if (press) {
          tx = press.ox - (event.clientX - press.px)
          ty = press.oy - (event.clientY - press.py)
        }
      }
      schedule()
    }

    const up = (event: PointerEvent) => {
      if (
        press?.id &&
        press.index >= 0 &&
        !pinchDistance &&
        Math.hypot(event.clientX - press.px, event.clientY - press.py) < 7
      )
        startFlip(press.index, press.id)
      pointers.delete(event.pointerId)
      press = null
      if (!pointers.size) pinchDistance = 0
      root.classList.remove('is-dragging')
      schedule()
    }

    const cancel = () => {
      pointers.clear()
      press = null
      pinchDistance = 0
      root.classList.remove('is-dragging')
    }

    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.ctrlKey) {
        setZoom((value) => clamp(value * Math.exp(-event.deltaY * 0.003), cfg.zoomMin, cfg.zoomMax))
      } else {
        tx += event.deltaX
        ty += event.deltaY
      }
      schedule()
    }

    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (flip.opening) {
          flip.opening = false
          schedule()
        }
        return
      }
      const step = width / cfg.visibleColumns + cfg.gap
      if (event.key === 'ArrowLeft') tx -= step
      else if (event.key === 'ArrowRight') tx += step
      else if (event.key === 'ArrowUp') ty -= step
      else if (event.key === 'ArrowDown' || event.key === ' ') ty += step
      else return
      event.preventDefault()
      schedule()
    }

    const click = (event: MouseEvent) => {
      if (event.detail !== 0) return
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-grid-index]')
      if (target?.dataset.photoId)
        startFlip(Number(target.dataset.gridIndex), target.dataset.photoId)
    }

    resetRef.current = () => {
      tx = 0
      ty = 0
      flip = { index: -1, id: '', progress: 0, opening: false, opened: false }
      setZoom(1)
      schedule()
    }

    const resize = new ResizeObserver(() => {
      width = root.clientWidth
      height = root.clientHeight
      schedule()
    })
    resize.observe(root)

    root.addEventListener('pointerdown', down)
    root.addEventListener('pointermove', move)
    root.addEventListener('pointerup', up)
    root.addEventListener('pointercancel', cancel)
    root.addEventListener('wheel', wheel, { passive: false })
    root.addEventListener('keydown', key)
    root.addEventListener('click', click)
    schedule()

    const timer = setTimeout(() => {
      coverRef.current?.classList.add('is-gone')
    }, 1100)
    return () => {
      clearTimeout(timer)
      if (resetFlipTimer) clearTimeout(resetFlipTimer)
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
      wakeRef.current = () => {}
    }
  }, [photos])

  useEffect(() => {
    wakeRef.current()
  }, [zoom, curved, torch])

  return (
    <div className="wall-page">
      <div
        className="wall-stage"
        ref={stageRef}
        tabIndex={0}
        aria-label="无限照片墙：拖拽或方向键移动，双击或回车查看照片"
      >
        <div className="wall-pool" ref={poolRef} />
        <div className="wall-dim" ref={dimRef} aria-hidden="true" />
        <div className={`wall-shade ${torch ? 'enabled' : ''}`} ref={shadeRef} aria-hidden="true" />
        <div className="wall-cover" ref={coverRef} aria-hidden="true" />
        {context && (
          <div className="grid-context liquid">
            <span>{context}</span>
          </div>
        )}
        <div className="grid-toolbar liquid">
          <GlassIconButton
            label="缩小照片墙"
            icon="zoom-out-line"
            onClick={() => setZoom((v) => clamp(v - cfg.zoomStep, cfg.zoomMin, cfg.zoomMax))}
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
            label="放大照片墙"
            icon="zoom-in-line"
            onClick={() => setZoom((v) => clamp(v + cfg.zoomStep, cfg.zoomMin, cfg.zoomMax))}
          />
          <span className="control-divider" />
          <GlassIconButton
            label="穹顶效果"
            icon="layout-grid-line"
            active={curved}
            onClick={() => setCurved((v) => !v)}
          />
          <GlassIconButton
            label="聚光效果"
            icon="flashlight-line"
            active={torch}
            onClick={() => setTorch((v) => !v)}
          />
          <GlassIconButton
            label="重置照片墙"
            icon="refresh-2-line"
            onClick={() => resetRef.current()}
          />
        </div>
      </div>
    </div>
  )
}
