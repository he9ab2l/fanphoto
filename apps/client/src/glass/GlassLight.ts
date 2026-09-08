/** Lighting System. One rAF-throttled global listener samples the pointer and
 * notifies specular surfaces so they can light themselves locally. The loop
 * self-terminates once the pointer has been idle for a moment — no frame is
 * burned while the page rests — and pointer/scroll events re-arm it. */
export interface GlassLightState {
  /** pointer in viewport fractions (0..1), viewport center when idle. */
  x: number
  y: number
  /** 0 (idle) .. 1 (pointer moving over the page). */
  intensity: number
  active: boolean
}

const IDLE_AFTER_MS = 220

const listeners = new Set<(state: GlassLightState) => void>()
let running = false
let pointer = { x: 0.5, y: 0.5 }
let movedAt = 0
let raf = 0
let scheduled = false

function compute(): GlassLightState {
  const moving = performance.now() - movedAt < IDLE_AFTER_MS
  return { ...pointer, intensity: moving ? 1 : 0, active: moving }
}

function requestTick() {
  if (scheduled || raf) return
  scheduled = true
  raf = requestAnimationFrame(() => {
    scheduled = false
    tick()
  })
}

function tick() {
  raf = 0
  const state = compute()
  if (listeners.size) {
    window.dispatchEvent(new CustomEvent('fanphoto:glass', { detail: state }))
  }
  // Keep ticking only while the light is live; the frame that observes the
  // idle threshold publishes intensity 0 and lets the loop die. Any pointer
  // or scroll event re-arms it.
  if (listeners.size && state.active) requestTick()
}

function schedule() {
  movedAt = performance.now()
  requestTick()
}

/** Activate global listeners. Refcounted; returns a dispose function. */
export function startGlassLight(): () => void {
  if (running) return () => {}
  running = true
  const onPointer = (event: PointerEvent) => {
    pointer = {
      x: Math.min(1, Math.max(0, event.clientX / window.innerWidth)),
      y: Math.min(1, Math.max(0, event.clientY / window.innerHeight)),
    }
    schedule()
  }
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('pointerdown', onPointer, { passive: true })
  const onScroll = () => schedule()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  return () => {
    running = false
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('pointerdown', onPointer)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    scheduled = false
  }
}

/** Subscribe to live light state. Returns an unsubscribe function. */
export function subscribeGlassLight(listener: (state: GlassLightState) => void): () => void {
  listeners.add(listener)
  listener(compute())
  return () => {
    listeners.delete(listener)
  }
}
