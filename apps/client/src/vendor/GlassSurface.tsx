/** Adapted from React Bits GlassSurface, David Haz (see NOTICE.md).
 * CSS frost everywhere; one cached RG displacement pass on small Chromium
 * control surfaces. Text and icons never pass through the filter. */
import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react'
import { glassDisplacementPixels, withinGlassBudget } from '../ui/glass-map'
const maps = new Map<string, string>()
export function GlassSurface({
  className = '',
  children,
  style,
  effect = 'liquid',
  ...props
}: HTMLAttributes<HTMLDivElement> & { effect?: 'liquid' | 'frosted' }) {
  const id = `glass-${useId().replace(/:/g, '')}`
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [enabled, setEnabled] = useState(false)
  const [map, setMap] = useState('')
  useEffect(() => {
    const preferences = matchMedia(
      '(prefers-reduced-transparency: reduce), (prefers-contrast: more), (prefers-reduced-motion: reduce)',
    )
    const check = () => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection
      // CSS.supports alone checks syntax; WebKit and Firefox do not yet paint
      // URL backdrop filters reliably. They keep the same readable CSS surface.
      setEnabled(
        effect === 'liquid' &&
          !preferences.matches &&
          !connection?.saveData &&
          navigator.hardwareConcurrency > 2 &&
          /Chrome|Chromium|Edg\//.test(navigator.userAgent) &&
          CSS.supports('backdrop-filter', `url(#${id})`),
      )
    }
    check()
    preferences.addEventListener('change', check)
    return () => preferences.removeEventListener('change', check)
  }, [effect, id])
  useEffect(() => {
    if (!root.current || !enabled) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.borderBoxSize[0]?.inlineSize || entry.contentRect.width)
      const height = Math.round(entry.borderBoxSize[0]?.blockSize || entry.contentRect.height)
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      )
    })
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [enabled])
  const eligible = enabled && withinGlassBudget(size.width, size.height)
  useEffect(() => {
    if (!eligible) return
    const key = `${size.width}:${size.height}`
    const cached = maps.get(key)
    if (cached) {
      setMap(cached)
      return
    }
    const field = glassDisplacementPixels(size.width, size.height, size.height / 2)
    const canvas = document.createElement('canvas')
    canvas.width = field.width
    canvas.height = field.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.putImageData(new ImageData(field.pixels, field.width, field.height), 0, 0)
    const image = canvas.toDataURL('image/png')
    if (maps.size >= 16) maps.delete(maps.keys().next().value!)
    maps.set(key, image)
    setMap(image)
  }, [eligible, size])
  const refracting = eligible && Boolean(map)
  return (
    <div
      ref={root}
      className={`glass-surface ${className}`}
      data-glass={refracting ? 'liquid' : 'frosted'}
      style={{ ...style, '--glass-filter': `url(#${id})` } as CSSProperties}
      {...props}
    >
      {refracting && (
        <svg
          className="glass-surface__filter"
          aria-hidden="true"
          width="0"
          height="0"
          focusable="false"
        >
          <defs>
            <filter
              id={id}
              x="-10%"
              y="-20%"
              width="120%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={map}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale="18"
                xChannelSelector="R"
                yChannelSelector="G"
                result="refracted"
              />
              <feGaussianBlur in="refracted" stdDeviation="0.6" />
            </filter>
          </defs>
        </svg>
      )}
      <div className="glass-surface__content">{children}</div>
    </div>
  )
}
