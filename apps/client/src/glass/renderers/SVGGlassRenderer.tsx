/** SVG optical renderer — the compatibility path for liquid glass in Chromium.
 * Chain: feImage (lens map) → feDisplacementMap (refraction) → feGaussianBlur →
 * feColorMatrix (brightness/saturation) → optional RGB dispersion (R +1px,
 * G 0, B −1px, only at edges) → optional lighting composite (rim sheen).
 * Only surfaces inside the lens budget receive this; everything else keeps the
 * plain CSS frosted material. */
export interface SVGGlassFilterProps {
  id: string
  refraction: number
  saturation: number
  brightness: number
  dispersion: boolean
  lighting: boolean
  map: string
}

export function SVGGlassFilter({
  id,
  refraction,
  saturation,
  brightness,
  dispersion,
  lighting,
  map,
}: SVGGlassFilterProps) {
  const dispersionChain = dispersion ? (
    <>
      <feColorMatrix
        in="colored"
        type="matrix"
        values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"
        result="r"
      />
      <feOffset in="r" dx="1" dy="0" result="r2" />
      <feColorMatrix
        in="colored"
        type="matrix"
        values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0"
        result="g"
      />
      <feColorMatrix
        in="colored"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
        result="b"
      />
      <feOffset in="b" dx="-1" dy="0" result="b2" />
      <feComposite in="r2" in2="g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rgb" />
    </>
  ) : null

  // Base input for the lighting pass (the recombined or plain colored result).
  const base = dispersion ? 'rgb' : 'colored'

  return (
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
          x="-15%"
          y="-30%"
          width="130%"
          height="160%"
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
            scale={Math.max(2, refraction)}
            xChannelSelector="R"
            yChannelSelector="G"
            result="refracted"
          />
          <feGaussianBlur in="refracted" stdDeviation="0.6" result="soft" />
          <feColorMatrix
            in="soft"
            type="matrix"
            values={`${brightness} 0 0 0 0  0 ${brightness} 0 0 0  0 0 ${brightness} 0 0  0 0 0 1 0`}
            result="bright"
          />
          <feColorMatrix in="bright" type="saturate" values={String(saturation)} result="colored" />
          {dispersionChain}
          {lighting && (
            <>
              <feSpecularLighting
                in={base}
                surfaceScale="1.6"
                specularConstant="0.4"
                specularExponent="24"
                lightingColor="#ffffff"
                result="rim"
              >
                <fePointLight x="-120" y="-120" z="160" />
              </feSpecularLighting>
              <feComposite
                in="rim"
                in2={base}
                operator="arithmetic"
                k1="0"
                k2="0.35"
                k3="1"
                k4="0"
              />
            </>
          )}
        </filter>
      </defs>
    </svg>
  )
}
