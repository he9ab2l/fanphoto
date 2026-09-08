/** SVG optical renderer — the compatibility path for liquid glass in Chromium.
 * Chain: feImage (lens map) → feDisplacementMap (refraction) → feGaussianBlur →
 * feColorMatrix (brightness/saturation) → optional RGB dispersion (R +1px,
 * G 0, B −1px, strongest at the rim via the map's height alpha). Rim lighting
 * is not part of this chain — the fresnel ring is painted by the CSS layer
 * (glass.css) so SVG and frosted surfaces share one rim language. Only
 * surfaces inside the lens budget receive this; everything else keeps the
 * plain CSS frosted material. */
export interface SVGGlassFilterProps {
  id: string
  refraction: number
  saturation: number
  brightness: number
  dispersion: boolean
  map: string
}

export function SVGGlassFilter({
  id,
  refraction,
  saturation,
  brightness,
  dispersion,
  map,
}: SVGGlassFilterProps) {
  // Split the chroma channels, slide red and blue in opposite directions and
  // recombine — a restrained edge rainbow like real crown glass. Each channel
  // is an (R/G/B, 0, 0, A) plane, so arithmetic-add composites merge them back.
  const dispersionChain = dispersion ? (
    <>
      <feColorMatrix
        in="colored"
        type="matrix"
        values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="r"
      />
      <feOffset in="r" dx="1" dy="0" result="r2" />
      <feColorMatrix
        in="colored"
        type="matrix"
        values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="g"
      />
      <feColorMatrix
        in="colored"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
        result="b"
      />
      <feOffset in="b" dx="-1" dy="0" result="b2" />
      <feComposite in="r2" in2="g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg" />
      <feComposite
        in="rg"
        in2="b2"
        operator="arithmetic"
        k1="0"
        k2="1"
        k3="1"
        k4="0"
        result="rgb"
      />
    </>
  ) : null

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
        </filter>
      </defs>
    </svg>
  )
}
