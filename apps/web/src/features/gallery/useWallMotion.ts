import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  WALL_EFFECTS,
  insetCorner,
  interpolatePoint,
  quadMatrix,
  type EffectFrame,
  type Point,
  type WallEffectId,
} from './wallEffects'

export interface WallLayout {
  width: number
  height: number
  card: number
  gap: number
  columns: number
  rows: number
}

export interface WallActivation {
  slotIndex: number
  photoIndex: number
  trigger: HTMLElement
}

interface UseWallMotionOptions {
  layout: WallLayout
  stageRef: RefObject<HTMLDivElement | null>
  tileRefs: RefObject<Map<number, HTMLElement>>
  effectId: WallEffectId
  onActivate: (activation: WallActivation) => void
  onEscape: () => void
  onPinchScale: (scale: number) => void
}

interface WallMotionApi {
  reset(): void
  invalidate(): void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const damp = (from: number, to: number, rate: number, delta: number) =>
  from + (to - from) * (1 - Math.pow(1 - rate, delta))
const smooth = (value: number) => value * value * (3 - 2 * value)

/**
 * 把位移回绕进 [0, extent)。整张墙共享同一个回绕结果：
 * 卡片间距恒为 period，相邻卡片的晶格点严格对齐 —— 穹顶变形无缝；
 * 越过回绕边界时整场同时平移一个坐标场宽度（落在屏外冗余区），内容逐像素一致。
 */
const wrapField = (value: number, extent: number) => ((value % extent) + extent) % extent

export function useWallMotion({
  layout,
  stageRef,
  tileRefs,
  effectId,
  onActivate,
  onEscape,
  onPinchScale,
}: UseWallMotionOptions): WallMotionApi {
  const frameRef = useRef(0)
  const onActivateRef = useRef(onActivate)
  const onEscapeRef = useRef(onEscape)
  const onPinchScaleRef = useRef(onPinchScale)
  const motionRef = useRef({
    current: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    cursor: { x: 0, y: 0 },
    cursorTarget: { x: 0, y: 0 },
    effectFrom: effectId,
    effectTo: effectId,
    effectProgress: 1,
    lastTime: performance.now(),
  })

  onActivateRef.current = onActivate
  onEscapeRef.current = onEscape
  onPinchScaleRef.current = onPinchScale

  const drawRef = useRef<() => void>(() => undefined)
  const invalidateRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    const motion = motionRef.current
    if (motion.effectTo === effectId) return
    motion.effectFrom = motion.effectTo
    motion.effectTo = effectId
    motion.effectProgress = 0
    invalidateRef.current()
  }, [effectId])

  useLayoutEffect(() => {
    const motion = motionRef.current
    const period = layout.card + layout.gap
    const fieldWidth = layout.columns * period
    const fieldHeight = layout.rows * period
    const marginX = (layout.width - fieldWidth) / 2
    const marginY = (layout.height - fieldHeight) / 2
    // 离屏卡片：只写一次 park 变换，之后整帧跳过，直到重新进入视野
    const parked = new Set<HTMLElement>()

    const applyTransform = (element: HTMLElement, value: string) => {
      if (element.style.transform !== value) element.style.transform = value
    }

    const applyVisibility = (element: HTMLElement, visible: boolean) => {
      if (element.dataset.visible === String(visible)) return
      element.dataset.visible = String(visible)
      const trigger = element.querySelector<HTMLElement>('.photo-card-trigger')
      if (trigger) trigger.tabIndex = visible ? 0 : -1
      element.setAttribute('aria-hidden', String(!visible))
    }

    drawRef.current = () => {
      const now = performance.now()
      const delta = clamp((now - motion.lastTime) / 16.667, 0.25, 3)
      motion.lastTime = now
      motion.current.x = damp(motion.current.x, motion.target.x, 0.16, delta)
      motion.current.y = damp(motion.current.y, motion.target.y, 0.16, delta)
      motion.cursor.x = damp(motion.cursor.x, motion.cursorTarget.x, 0.18, delta)
      motion.cursor.y = damp(motion.cursor.y, motion.cursorTarget.y, 0.18, delta)
      motion.effectProgress = damp(motion.effectProgress, 1, 0.13, delta)

      const velocity = Math.hypot(motion.target.x - motion.current.x, motion.target.y - motion.current.y)
      const effectProgress = smooth(clamp(motion.effectProgress, 0, 1))
      const frame: EffectFrame = {
        width: layout.width,
        height: layout.height,
        period,
        cursor: motion.cursor,
        velocity,
      }
      const fromEffect = WALL_EFFECTS[motion.effectFrom]
      const toEffect = WALL_EFFECTS[motion.effectTo]
      const useLightPath = motion.effectTo === 'grid' && effectProgress >= 0.999

      // wrap：整墙共享一个回绕后的相机位置（替代原来逐卡片/逐轴回绕）
      const wrappedX = wrapField(motion.current.x, fieldWidth)
      const wrappedY = wrapField(motion.current.y, fieldHeight)

      for (const [slotIndex, element] of tileRefs.current.entries()) {
        const column = slotIndex % layout.columns
        const row = Math.floor(slotIndex / layout.columns)
        const x = marginX + column * period - wrappedX
        const y = marginY + row * period - wrappedY

        // 视野预判垫一个周期：宁可多渲染也不在快速拖动时露边；
        // 离屏卡片只做一次 park 写入，避免每帧矩阵计算与样式写入。
        const visible = x + layout.card >= -period && x <= layout.width + period
          && y + layout.card >= -period && y <= layout.height + period
        if (!visible) {
          if (!parked.has(element)) {
            parked.add(element)
            applyTransform(element, 'translate3d(-20000px, -20000px, 0)')
            applyVisibility(element, false)
          }
          continue
        }
        parked.delete(element)
        applyVisibility(element, true)

        let transform: string
        if (useLightPath) {
          // 网格静置路径：translate 定位 + 围绕卡片中心做轻倾斜（transform-origin: top left，居中补偿显式写出）
          const nx = (x + layout.card / 2 - layout.width / 2) / Math.max(layout.width / 2, 1)
          const ny = (y + layout.card / 2 - layout.height / 2) / Math.max(layout.height / 2, 1)
          const distance = Math.min(1.4, nx * nx + ny * ny)
          const scale = 1 + distance * 0.035
          const tiltX = clamp(-ny * 1.2, -1.8, 1.8)
          const tiltY = clamp(nx * 1.2, -1.8, 1.8)
          const half = layout.card / 2
          transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate3d(${half.toFixed(2)}px, ${half.toFixed(2)}px, 0) perspective(1200px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) scale(${scale.toFixed(4)}) translate3d(${-half.toFixed(2)}px, ${-half.toFixed(2)}px, 0)`
        } else {
          // warp + inset + matrix3d：变形作用于 period 盒四角，相邻卡片共享晶格点
          const lattice = [
            { x, y },
            { x: x + period, y },
            { x, y: y + period },
            { x: x + period, y: y + period },
          ]
          const projected = lattice.map((point) => interpolatePoint(
            fromEffect.project(point, frame),
            toEffect.project(point, frame),
            effectProgress,
          ))
          const topLeft = insetCorner(projected[0], projected[1], projected[2], layout.gap)
          const topRight = insetCorner(projected[1], projected[0], projected[3], layout.gap)
          const bottomLeft = insetCorner(projected[2], projected[0], projected[3], layout.gap)
          const bottomRight = insetCorner(projected[3], projected[1], projected[2], layout.gap)
          transform = quadMatrix(layout.card, topLeft, topRight, bottomLeft, bottomRight)
        }

        applyTransform(element, transform)
      }

      const cursorMatters = motion.effectFrom === 'dome' || motion.effectTo === 'dome'
      const settled =
        Math.abs(motion.current.x - motion.target.x) < 0.05 &&
        Math.abs(motion.current.y - motion.target.y) < 0.05 &&
        (!cursorMatters || (
          Math.abs(motion.cursor.x - motion.cursorTarget.x) < 0.05 &&
          Math.abs(motion.cursor.y - motion.cursorTarget.y) < 0.05
        )) &&
        Math.abs(motion.effectProgress - 1) < 0.0005

      if (!settled) frameRef.current = requestAnimationFrame(drawRef.current)
      else frameRef.current = 0
    }

    invalidateRef.current = () => {
      if (frameRef.current) return
      motion.lastTime = performance.now()
      frameRef.current = requestAnimationFrame(drawRef.current)
    }

    drawRef.current()
    return () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [layout, tileRefs])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const pointers = new Map<number, Point>()
    let drag: { start: Point; target: Point; moved: number } | null = null
    let press: WallActivation | null = null
    let pinch: { distance: number; scale: number; origin: Point } | null = null

    const pointerDistance = () => {
      const [first, second] = [...pointers.values()]
      return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const motion = motionRef.current
      motion.target.x += event.deltaX * 1.1
      motion.target.y += event.deltaY * 1.1
      invalidateRef.current()
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      stage.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const trigger = (event.target as Element).closest<HTMLElement>('.photo-card-trigger')
      const card = trigger?.closest<HTMLElement>('.photo-card')
      const photoIndex = Number(card?.dataset.photoIndex)
      const slotIndex = Number(card?.dataset.slotIndex)
      press = trigger && Number.isInteger(photoIndex) && Number.isInteger(slotIndex)
        ? { photoIndex, slotIndex, trigger }
        : null
      drag = {
        start: { x: event.clientX, y: event.clientY },
        target: { ...motionRef.current.target },
        moved: 0,
      }
      stage.classList.add('is-dragging')
      card?.classList.add('is-pressed')
      if (pointers.size === 2) {
        const values = [...pointers.values()]
        pinch = {
          distance: pointerDistance(),
          scale: 1,
          origin: { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 },
        }
        drag = null
        press = null
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const motion = motionRef.current
      motion.cursorTarget.x = event.clientX - layout.width / 2
      motion.cursorTarget.y = event.clientY - layout.height / 2
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pinch && pointers.size >= 2) {
        const distance = pointerDistance()
        pinch.scale = clamp(distance / Math.max(pinch.distance, 1), 0.72, 1.4)
        stage.style.transformOrigin = `${pinch.origin.x}px ${pinch.origin.y}px`
        stage.style.transform = `scale(${pinch.scale})`
        return
      }
      if (!drag) {
        invalidateRef.current()
        return
      }
      const deltaX = event.clientX - drag.start.x
      const deltaY = event.clientY - drag.start.y
      drag.moved = Math.max(drag.moved, Math.hypot(deltaX, deltaY))
      motion.target.x = drag.target.x - deltaX
      motion.target.y = drag.target.y - deltaY
      invalidateRef.current()
    }

    const releasePointer = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (pointers.size < 2 && pinch) {
        const scale = pinch.scale
        pinch = null
        stage.style.transform = ''
        stage.style.transformOrigin = ''
        if (Math.abs(scale - 1) > 0.04) onPinchScaleRef.current(scale)
      }
      if (pointers.size > 0) return
      stage.classList.remove('is-dragging')
      stage.querySelectorAll('.photo-card.is-pressed').forEach((card) => card.classList.remove('is-pressed'))
      if (press && drag && drag.moved <= 7) onActivateRef.current(press)
      drag = null
      press = null
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'Escape') {
        onEscapeRef.current()
        return
      }
      if (target instanceof HTMLElement && target.closest('.photo-viewer, .detail-panel, .detail-content')) return
      const motion = motionRef.current
      const step = layout.card + layout.gap
      if (event.key === 'ArrowLeft') motion.target.x -= step
      else if (event.key === 'ArrowRight') motion.target.x += step
      else if (event.key === 'ArrowUp') motion.target.y -= step
      else if (event.key === 'ArrowDown') motion.target.y += step
      else if (event.code === 'Space' && target === document.body) motion.target.x += (event.shiftKey ? -1 : 1) * layout.width * 0.75
      else return
      event.preventDefault()
      invalidateRef.current()
    }

    stage.addEventListener('wheel', handleWheel, { passive: false })
    stage.addEventListener('pointerdown', handlePointerDown)
    stage.addEventListener('pointermove', handlePointerMove)
    stage.addEventListener('pointerup', releasePointer)
    stage.addEventListener('pointercancel', releasePointer)
    stage.addEventListener('lostpointercapture', releasePointer)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      stage.removeEventListener('wheel', handleWheel)
      stage.removeEventListener('pointerdown', handlePointerDown)
      stage.removeEventListener('pointermove', handlePointerMove)
      stage.removeEventListener('pointerup', releasePointer)
      stage.removeEventListener('pointercancel', releasePointer)
      stage.removeEventListener('lostpointercapture', releasePointer)
      window.removeEventListener('keydown', handleKeyDown)
      stage.style.transform = ''
      stage.style.transformOrigin = ''
    }
  }, [layout.card, layout.gap, layout.height, layout.width, stageRef])

  return {
    reset() {
      const motion = motionRef.current
      motion.target.x = 0
      motion.target.y = 0
      invalidateRef.current()
    },
    invalidate() {
      invalidateRef.current()
    },
  }
}
