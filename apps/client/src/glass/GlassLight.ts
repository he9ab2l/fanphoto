/** Lighting System. One rAF-throttled global listener samples pointer,
 * viewport and scroll, publishes document-level --glass-light-* variables, and
 * notifies specular surfaces so they can light themselves locally. */
export interface GlassLightState {
  /** pointer in viewport fractions (0..1), viewport center when idle. */
  x: number
  y: number
  /** 0 (idle) .. 1 (pointer moving over the page). */
  intensity: number
  active: boolean
}

const LIGHT_EVENT = 'fanphoto:glass'
const listeners = new Set<(state: GlassLightState) => void>()
let running = false
let pointer = { x: 0.5, y: 0.5 }
let movedAt = 0
let raf = 0

function compute(): GlassLightState {
  const moving = performance.now() - movedAt < 220
  const intensity = moving ? 1 : 0
  return { ...pointer, intensity, active: moving }
}

function tick() {
  raf = 0
  const state = compute()
  const root = document.documentElement
  root.style.setProperty('--glass-light-x', String(state.x))
  root.style.setProperty('--glass-light-y', String(state.y))
  root.style.setProperty('--glass-intensity', String(state.intensity))
  if (listeners.size) {
    window.dispatchEvent(new CustomEvent(LIGHT_EVENT, { detail: state }))
  }
  // Stay silent once idle: no listener loop while the pointer rests.
  if (listeners.size) requestTick()
}

let scheduled = false
function requestTick() {
  if (scheduled) return
  scheduled = true
  raf = requestAnimationFrame(() => {
    scheduled = false
    tick()
  })
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
  tick()
  return () => {
    running = false
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('pointerdown', onPointer)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    if (raf) cancelAnimationFrame(raf)
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

export { LIGHT_EVENT }
