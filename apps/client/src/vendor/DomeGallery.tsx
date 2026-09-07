/**
 * FanPhoto adaptation of React Bits DomeGallery: natural-aspect columns,
 * concave tangent planes, infinite wrap, view-only tiles, on-demand animation.
 * See NOTICE.md and react-bits-license.txt.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useGesture } from '@use-gesture/react'
import { useReducedMotion } from 'motion/react'
import type { PhotoSummary } from '@fanphoto/contracts'
import { project, sceneTiles, columnCount, type Pose, type Size } from '../gallery/geometry'
import { imageSet } from '../lib/photos'
import { Button } from '../ui/primitives'

export function DomeGallery({
  photos,
  mode,
  density,
  paused,
  pose,
  onOpen,
  onExplore,
}: {
  photos: PhotoSummary[]
  mode: 'cylinder' | 'sphere'
  density: number
  paused: boolean
  pose: MutableRefObject<Pose | null>
  onOpen: (photo: PhotoSummary) => void
  onExplore: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [windowPose, setWindowPose] = useState<Pose>({ x: 0, y: 0 })
  const [explored, setExplored] = useState(false)
  const nodes = useRef(new Map<string, HTMLButtonElement>())
  const raf = useRef(0),
    velocity = useRef({ x: 0, y: 0 })
  const dragStart = useRef({ x: 0, y: 0 }),
    dragging = useRef(false)
  const lastFrame = useRef(0),
    lastLayout = useRef(0),
    suppressClick = useRef(false)
  const travel = useRef(0),
    reduced = useReducedMotion()
  const renderFrame = useRef<(time: number) => void>(() => {})
  const tiles = useMemo(
    () => sceneTiles(photos, size, windowPose, density),
    [photos, size, windowPose, density],
  )
  const latest = useRef({ size, mode, tiles, windowPose, density, paused, reduced, onExplore })
  useLayoutEffect(() => {
    latest.current = { size, mode, tiles, windowPose, density, paused, reduced, onExplore }
  })
  const schedule = () => {
    if (!raf.current && !document.hidden)
      raf.current = requestAnimationFrame((time) => renderFrame.current(time))
  }
  const stop = () => {
    cancelAnimationFrame(raf.current)
    raf.current = 0
    velocity.current = { x: 0, y: 0 }
  }
  const paint = () => {
    const current = latest.current,
      camera = pose.current
    if (!camera) return
    for (const tile of current.tiles) {
      const node = nodes.current.get(tile.key)
      if (!node) continue
      const x = tile.x - camera.x,
        y = tile.y - camera.y
      const point = project(x, y, current.size, current.mode)
      const visible =
        Math.abs(x) < current.size.width / 2 + tile.width * 0.6 &&
        Math.abs(y) < current.size.height / 2 + tile.height * 0.6
      node.style.transform = `translate3d(${current.size.width / 2 + point.x - tile.width / 2}px,${current.size.height / 2 + point.y - tile.height / 2}px,${point.z}px) rotateY(${point.rotateY}deg) rotateX(${point.rotateX}deg)`
      node.style.visibility = visible ? 'visible' : 'hidden'
      node.tabIndex = visible && !current.paused ? 0 : -1
      node.setAttribute('aria-hidden', String(!visible))
    }
  }
  renderFrame.current = (time) => {
    raf.current = 0
    const current = latest.current
    if (current.paused || document.hidden || !pose.current) return
    const dt = Math.min(32, time - (lastFrame.current || time)) / 1000
    lastFrame.current = time
    if (!dragging.current && !current.reduced) {
      pose.current.x += velocity.current.x * dt
      pose.current.y += velocity.current.y * dt
      const damping = Math.exp(-7 * dt)
      velocity.current.x *= damping
      velocity.current.y *= damping
    }
    paint()
    const threshold = (current.size.width / columnCount(current.size.width, current.density)) * 0.6
    if (
      time - lastLayout.current > 100 &&
      (Math.abs(pose.current.x - current.windowPose.x) > threshold ||
        Math.abs(pose.current.y - current.windowPose.y) > threshold)
    ) {
      lastLayout.current = time
      setWindowPose({ ...pose.current })
    }
    if (Math.abs(velocity.current.x) + Math.abs(velocity.current.y) > 5) schedule()
    else velocity.current = { x: 0, y: 0 }
  }
  useLayoutEffect(() => {
    if (!root.current) return
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height }
      if (!pose.current) pose.current = { x: next.width / 2, y: next.height / 2 }
      setWindowPose({ ...pose.current })
      setSize(next)
    })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [pose])
  useLayoutEffect(() => {
    paint()
  }, [tiles, size, mode, paused])
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) stop()
      else schedule()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  useEffect(() => {
    if (paused) stop()
  }, [paused])
  const explore = (distance: number) => {
    travel.current += distance
    if (distance > 4) setExplored(true)
    if (travel.current > Math.max(400, latest.current.size.width * 0.6)) {
      travel.current = 0
      latest.current.onExplore()
    }
  }
  useGesture(
    {
      onDragStart: () => {
        stop()
        dragging.current = true
        dragStart.current = { ...(pose.current || { x: 0, y: 0 }) }
      },
      onDrag: ({
        movement: [x, y],
        delta: [dx, dy],
        last,
        tap,
        velocity: [vx, vy],
        direction: [sx, sy],
      }) => {
        if (tap || !pose.current) {
          if (last) dragging.current = false
          return
        }
        pose.current.x = dragStart.current.x - x
        pose.current.y = dragStart.current.y - y
        explore(Math.abs(dx) + Math.abs(dy))
        if (last) {
          dragging.current = false
          suppressClick.current = true
          if (!latest.current.reduced)
            velocity.current = {
              x: -sx * Math.min(2.4, vx) * 1000,
              y: -sy * Math.min(2.4, vy) * 1000,
            }
        }
        schedule()
      },
      onWheel: ({ event, delta: [dx, dy] }) => {
        if ((event as WheelEvent).ctrlKey || !pose.current) return
        event.preventDefault()
        stop()
        pose.current.x += dx
        pose.current.y += dy
        explore(Math.abs(dx) + Math.abs(dy))
        schedule()
      },
    },
    {
      target: root,
      enabled: !paused,
      drag: { filterTaps: true, threshold: 5 },
      eventOptions: { passive: false },
    },
  )
  return (
    <div
      ref={root}
      className="immersive-wall"
      tabIndex={paused ? -1 : 0}
      data-testid="immersive-wall"
      data-curvature={mode}
      aria-label={`${mode === 'cylinder' ? '圆柱' : '球面'}照片墙，拖动或使用方向键探索`}
      onPointerDownCapture={() => {
        // A fresh press is new intent, even immediately after inertia/drag.
        // Only suppress the synthetic click belonging to the drag itself.
        suppressClick.current = false
        stop()
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !pose.current) return
        const directions: Record<string, [number, number]> = {
          ArrowLeft: [-160, 0],
          ArrowRight: [160, 0],
          ArrowUp: [0, -160],
          ArrowDown: [0, 160],
        }
        const delta = directions[event.key]
        if (!delta) return
        event.preventDefault()
        stop()
        pose.current.x += delta[0]
        pose.current.y += delta[1]
        explore(160)
        schedule()
      }}
    >
      <div
        className="immersive-stage"
        style={{ perspective: `${Math.max(size.width, size.height) * 2.4}px` }}
      >
        {tiles.map((tile) => (
          <Button
            className="scene-tile"
            key={tile.key}
            ref={(node) => {
              if (node) nodes.current.set(tile.key, node)
              else nodes.current.delete(tile.key)
            }}
            data-testid="photo-card"
            data-photo-id={tile.photo.id}
            aria-label={`查看照片：${tile.photo.title}`}
            style={{ width: tile.width, height: tile.height }}
            onClick={(event) => {
              if (event.detail !== 0 && suppressClick.current) {
                suppressClick.current = false
                return
              }
              stop()
              onOpen(tile.photo)
            }}
          >
            <img
              src={tile.photo.assets.sm.url}
              srcSet={imageSet(tile.photo)}
              sizes={`${Math.ceil(tile.width)}px`}
              width={tile.photo.width}
              height={tile.photo.height}
              alt={tile.photo.title}
              draggable={false}
              decoding="async"
            />
          </Button>
        ))}
      </div>
      {!explored && (
        <p className="explore-hint" aria-hidden="true">
          拖动探索
        </p>
      )}
    </div>
  )
}
