/** GlassSurface — the single React entry to the Glass Engine. Every glass
 * component (dock, toolbar, buttons, dialogs, popovers, photo controls, detail
 * panel) renders through here; materials, shapes, tint, light and motion all
 * resolve inside the engine instead of being hardcoded in components. */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
} from 'react'
import type { PhotoSummary } from '@fanphoto/contracts'
import { usePreferences } from '../lib/preferences'
import {
  MATERIALS,
  materialVars,
  SHAPE_RADII,
  type GlassShape,
  type MaterialLevel,
} from './GlassMaterial'
import { neutralOklch, type Oklch } from './oklch'
import {
  AMBIENT_EVENT,
  blendGlassBg,
  readGlassAmbient,
  tintFromPhoto,
} from './GlassEnvironment'
import { glassCapabilities } from './GlassRenderer'
import { subscribeGlassLight, type GlassLightState } from './GlassLight'
import { withinLensBudget, lensFieldDataUrl } from './displacement/lens-field'
import { SVGGlassFilter } from './renderers/SVGGlassRenderer'
import type { WebGLGlassRenderer as WebGLRendererType } from './renderers/WebGLGlassRenderer'
type WebGLGlassRenderer = WebGLRendererType

const InteractiveGlassSurface = lazy(() => import('./GlassMotion'))

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Material level; the engine resolves every glass parameter from it. */
  material?: MaterialLevel
  /** Continuous corner shape. */
  shape?: GlassShape
  /** 'auto' follows the environment (photo tint); 'neutral' ignores it. */
  tint?: 'auto' | 'neutral'
  /** Explicit photo environment source (detail panel, controls over a photo). */
  photo?: PhotoSummary | null
  /** Spring interaction: hover attraction, pointer deformation, press/release. */
  interactive?: boolean
  /** Allow the SVG displacement refraction path (Chromium, budgeted). */
  refractive?: boolean
  /** Dynamic specular highlight driven by the pointer. */
  specular?: boolean
  /** Root element ref (consumers needing the live surface rect). */
  rootRef?: Ref<HTMLDivElement>
  /** Hero WebGL lens (photo detail panel). Requires a backdrop painter whose
   * work is re-run whenever paintKey changes. */
  webgl?: {
    enabled: boolean
    paintKey: string
    paintBackdrop: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
  }
}

export function GlassSurface({
  material = 'regular',
  shape = 'medium',
  tint = 'auto',
  photo = undefined,
  interactive = false,
  refractive = true,
  specular = true,
  webgl = undefined,
  rootRef,
  className = '',
  children,
  style,
  ...props
}: GlassSurfaceProps) {
  const { resolvedTheme } = usePreferences()
  const theme = resolvedTheme
  const spec = MATERIALS[material][theme]
  const radius = SHAPE_RADII[shape]
  const id = `glass-${useId().replace(/:/g, '')}`
  const root = useRef<HTMLDivElement | null>(null)

  const [size, setSize] = useState({ width: 0, height: 0 })
  const [ambient, setAmbient] = useState<Oklch | null>(() => {
    const current = readGlassAmbient()
    return current ? { l: current.l, c: current.c, h: current.h } : null
  })
  const [liquid, setLiquid] = useState(false)
  const [map, setMap] = useState('')
  const [webglActive, setWebglActive] = useState(false)
  const webglRef = useRef<WebGLGlassRenderer | null>(null)
  const webglCanvas = useRef<HTMLCanvasElement | null>(null)
  const painterRef = useRef(webgl?.paintBackdrop)
  useEffect(() => {
    painterRef.current = webgl?.paintBackdrop
  }, [webgl?.paintBackdrop])

  // The WebGL renderer is only needed by the hero lens (photo dialog); load it
  // lazily so the gallery entry chunk stays lean.
  const loadWebGL = useCallback(async () => {
    const module = await import('./renderers/WebGLGlassRenderer')
    return module.WebGLGlassRenderer
  }, [])
  const [webglAvailable, setWebglAvailable] = useState(false)
  useEffect(() => {
    let alive = true
    void loadWebGL().then((WebGLGlassRenderer) => {
      if (alive) setWebglAvailable(WebGLGlassRenderer.supported())
    })
    return () => {
      alive = false
    }
  }, [loadWebGL])

  // Environment tint ------------------------------------------------------
  const photoTint = useMemo(
    () => (photo ? tintFromPhoto(photo.thumbHash, theme) : null),
    [photo?.thumbHash, theme],
  )
  useEffect(() => {
    if (tint !== 'auto' || photo) return
    const update = () => {
      const current = readGlassAmbient()
      setAmbient(current ? { l: current.l, c: current.c, h: current.h } : null)
    }
    update()
    window.addEventListener(AMBIENT_EVENT, update)
    return () => window.removeEventListener(AMBIENT_EVENT, update)
  }, [tint, photo])

  const background = useMemo(() => {
    const source = photoTint || ambient || neutralOklch(theme === 'dark' ? 0.27 : 0.9)
    return blendGlassBg(source, theme, spec.tint, spec.opacity)
  }, [photoTint, ambient, theme, spec.tint, spec.opacity])

  // Size observation ------------------------------------------------------
  useEffect(() => {
    const node = root.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.borderBoxSize[0]?.inlineSize || entry.contentRect.width)
      const height = Math.round(entry.borderBoxSize[0]?.blockSize || entry.contentRect.height)
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      )
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // SVG liquid refraction --------------------------------------------------
  const caps = useMemo(() => glassCapabilities(), [])
  const eligible = useMemo(
    () =>
      refractive &&
      spec.refraction > 0 &&
      caps.svg &&
      !caps.restricted &&
      withinLensBudget(size.width, size.height),
    [refractive, spec.refraction, caps, size.width, size.height],
  )
  const filterId = eligible ? `url(#${id})` : ''
  useEffect(() => {
    if (!eligible) {
      setMap('')
      setLiquid(false)
      return
    }
    const url = lensFieldDataUrl(size.width, size.height, radius)
    if (!url) {
      setLiquid(false)
      return
    }
    setMap(url)
    setLiquid(true)
  }, [eligible, size.width, size.height, radius])

  // Hero WebGL lens ---------------------------------------------------------
  const webglWanted =
    webgl?.enabled &&
    webglAvailable &&
    !caps.restricted &&
    spec.webgl &&
    size.width > 2 &&
    size.height > 2
  const activeTint = photoTint || ambient || neutralOklch(0.5)
  useEffect(() => {
    if (!webglWanted) {
      setWebglActive(false)
      webglRef.current?.destroy()
      webglRef.current = null
      return
    }
    const canvas = webglCanvas.current
    if (!canvas) return
    let alive = true
    let cancelled = false
    let renderer: WebGLGlassRenderer | null = null
    void loadWebGL().then((WebGLGlassRenderer) => {
      if (cancelled || !alive) return
      renderer = new WebGLGlassRenderer(canvas, {
        width: size.width,
        height: size.height,
        radius: Math.max(4, Math.min(radius, Math.min(size.width, size.height) / 2 - 2)),
        refraction: Math.max(2, spec.refraction * 1.1),
        blur: Math.max(3, spec.blur * 0.3),
        saturation: 1.15,
        tint: [activeTint.l, activeTint.c, activeTint.h],
        tintMix: spec.tint,
        rim: spec.rim,
        paintBackdrop: () => {},
      })
      if (!renderer.active || cancelled || !alive) {
        renderer.destroy()
        return
      }
      webglRef.current = renderer
      renderer.setOnContextLost(() => {
        if (alive) setWebglActive(false)
      })
      setWebglActive(true)
    })
    return () => {
      alive = false
      cancelled = true
      if (renderer) renderer.destroy()
      webglRef.current = null
    }
  }, [
    webglWanted,
    size.width,
    size.height,
    radius,
    spec.refraction,
    spec.blur,
    spec.rim,
    spec.tint,
    activeTint,
    loadWebGL,
  ])

  // Repaint the lens when the backdrop under the glass moved (photo/layout).
  const paintKey = webgl?.paintKey
  useEffect(() => {
    const renderer = webglRef.current
    if (!renderer || !webglWanted) return
    const painter = painterRef.current
    renderer.update({
      paintBackdrop: painter || (() => {}),
      tint: [activeTint.l, activeTint.c, activeTint.h],
      tintMix: spec.tint,
    })
  }, [paintKey, webglWanted, activeTint, spec.tint])

  // Dynamic specular light -------------------------------------------------
  const [specLight, setSpecLight] = useState<{ x: number; y: number; intensity: number }>({
    x: 0.3,
    y: 0.2,
    intensity: 0.4,
  })
  useEffect(() => {
    if (!specular) return
    const node = root.current
    if (!node) return
    let rect = node.getBoundingClientRect()
    const measure = () => {
      if (root.current) rect = root.current.getBoundingClientRect()
    }
    const onLight = (state: GlassLightState) => {
      if (!root.current) return
      measure()
      const px = state.x * window.innerWidth
      const py = state.y * window.innerHeight
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dist = Math.hypot(px - cx, py - cy)
      const reach = Math.max(rect.width, rect.height) * 0.9 + 240
      const falloff = Math.max(0, 1 - dist / reach)
      const localX = Math.min(1, Math.max(0, (px - rect.left) / Math.max(rect.width, 1)))
      const localY = Math.min(1, Math.max(0, (py - rect.top) / Math.max(rect.height, 1)))
      const intensity = 0.3 + 0.7 * falloff * state.intensity
      setSpecLight({ x: localX, y: localY, intensity })
    }
    const unsubscribe = subscribeGlassLight(onLight)
    window.addEventListener('resize', measure)
    return () => {
      unsubscribe()
      window.removeEventListener('resize', measure)
    }
  }, [specular])

  // Spring interaction -------------------------------------------------------
  // The interactive layer is a lazily-loaded motion surface (the gallery entry
  // chunk never parses the motion library); the wrapper keeps the glass
  // visuals and the observation anchors.
  const content = <div className="glass-surface__content">{children}</div>
  const interactiveLayer = interactive ? (
    <Suspense fallback={content}>
      <InteractiveGlassSurface>{children}</InteractiveGlassSurface>
    </Suspense>
  ) : (
    content
  )
  const glassType = webglWanted && webglActive ? 'webgl' : liquid ? 'liquid' : 'frosted'
  const surfaceStyle = {
    ...materialVars(material, theme),
    '--glass-radius': `${radius}px`,
    '--glass-bg': background,
    '--glass-spec-x': `${specLight.x * 100}%`,
    '--glass-spec-y': `${specLight.y * 100}%`,
    '--glass-spec-intensity': String(specLight.intensity.toFixed(2)),
    ...(filterId ? { '--glass-filter': filterId } : {}),
    ...(style || {}),
  } as CSSProperties

  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node
      if (typeof rootRef === 'function') rootRef(node)
      else if (rootRef) rootRef.current = node
    },
    [rootRef],
  )

  return (
    <div
      ref={setRoot}
      className={`glass-surface ${className}`}
      data-glass={glassType}
      data-material={material}
      data-shape={shape}
      data-tint={tint}
      style={surfaceStyle}
      {...(props as HTMLAttributes<HTMLDivElement>)}
    >
      {liquid && map && (
        <SVGGlassFilter
          id={id}
          refraction={spec.refraction}
          saturation={spec.saturation}
          brightness={spec.brightness}
          dispersion={spec.dispersion}
          lighting={material === 'regular'}
          map={map}
        />
      )}
      {webglWanted && (
        <canvas
          ref={webglCanvas}
          className="glass-surface__webgl"
          aria-hidden="true"
          data-active={webglActive || undefined}
        />
      )}
      {interactiveLayer}
    </div>
  )
}