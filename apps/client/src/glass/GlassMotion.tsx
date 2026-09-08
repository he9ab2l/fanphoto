/** Motion System (lazy module). Apple-quiet spring interactions for glass
 * surfaces: hover attracts gently, the pointer deforms the surface slightly,
 * press compresses, release recovers elastically. Stiffness 280–350,
 * damping 20–30. Loaded on demand so the gallery entry chunk never parses the
 * motion library. */
import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

const PRESS_SCALE = 0.965
const HOVER_SCALE = 1.022
const TRACK_PX = 1.6

export function InteractiveGlassSurface({
  style,
  className = '',
  stiffness = 320,
  damping = 24,
  children,
}: {
  style?: CSSProperties
  className?: string
  stiffness?: number
  damping?: number
  children?: ReactNode
}) {
  const reduced = useReducedMotion()
  const active = !reduced
  const ref = useRef<HTMLDivElement | null>(null)

  const scaleX = useMotionValue(1)
  const scaleY = useMotionValue(1)
  const tx = useMotionValue(0)
  const ty = useMotionValue(0)
  const springScaleX = useSpring(scaleX, active ? { stiffness, damping } : { duration: 0 })
  const springScaleY = useSpring(scaleY, active ? { stiffness, damping } : { duration: 0 })
  const springTx = useSpring(tx, active ? { stiffness, damping } : { duration: 0 })
  const springTy = useSpring(ty, active ? { stiffness, damping } : { duration: 0 })

  const reset = () => {
    scaleX.set(1)
    scaleY.set(1)
    tx.set(0)
    ty.set(0)
  }
  const onPointerEnter = () => {
    if (!active) return
    // hover: slight attraction
    scaleX.set(HOVER_SCALE)
    scaleY.set(HOVER_SCALE)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const dx = (event.clientX - (rect.left + rect.width / 2)) / Math.max(rect.width, 1)
    const dy = (event.clientY - (rect.top + rect.height / 2)) / Math.max(rect.height, 1)
    // pointer: slight deformation toward the cursor, capped and subtle
    tx.set(dx * TRACK_PX)
    ty.set(dy * TRACK_PX)
    scaleX.set(HOVER_SCALE - Math.abs(dx) * 0.006)
    scaleY.set(HOVER_SCALE - Math.abs(dy) * 0.006)
  }
  const onPointerLeave = () => {
    if (!active) return
    reset()
  }
  const onPointerDown = () => {
    if (!active) return
    // press: compression
    scaleX.set(PRESS_SCALE)
    scaleY.set(PRESS_SCALE)
  }
  const onPointerUp = () => {
    if (!active) return
    // release: elastic recovery back to the hovered pose
    scaleX.set(HOVER_SCALE)
    scaleY.set(HOVER_SCALE)
  }
  const onPointerCancel = () => {
    if (!active) return
    reset()
  }

  const motionStyle = useMemo(
    () =>
      ({
        scaleX: springScaleX,
        scaleY: springScaleY,
        x: springTx,
        y: springTy,
        transformOrigin: '50% 50%',
      }) as unknown as CSSProperties,
    // springs are stable per render cycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active],
  )

  return (
    <motion.div
      ref={ref}
      className={`glass-surface__content glass-surface__motion ${className}`.trim()}
      style={{ ...motionStyle, ...(style || {}) }}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {children}
    </motion.div>
  )
}

export default InteractiveGlassSurface