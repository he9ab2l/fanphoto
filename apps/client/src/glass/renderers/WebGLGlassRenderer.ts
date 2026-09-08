/** WebGL optical glass renderer — optional enhancement for a single hero
 * surface (the photo detail panel). It rebuilds the region beneath the glass
 * from the DOM photo layout (never a full-page screenshot), then runs a
 * rounded-box SDF lens: refraction, gaussian frost, RGB chromatic aberration
 * at edges, fresnel rim, specular tint. Static render-on-change; no rAF loop.
 * Degrades cleanly to the SVG/CSS path (auto-fallback) on any failure. */
import { oklchToSrgb } from '../oklch'

export interface WebGLGlassConfig {
  /** CSS px size of the host surface. */
  width: number
  height: number
  /** Rounded-box radius (CSS px) of the glass shape. */
  radius: number
  /** Max refraction shift in CSS px at the rim (center refracts less). */
  refraction: number
  /** Frost blur sigma in CSS px. */
  blur: number
  saturation: number
  /** OKLCH l/c/h tint, or null for neutral. */
  tint: readonly [number, number, number] | null
  tintMix: number
  rim: number
  /** Paint the true backdrop into `ctx` (already scaled to DPR; draw in CSS
   * px). Called again whenever the environment underneath may have moved. */
  paintBackdrop: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
}

const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_size;       // CSS px
uniform float u_radius;
uniform float u_refraction; // CSS px
uniform float u_blur;       // CSS px sigma
uniform float u_saturation;
uniform vec3 u_tint;
uniform float u_tint_mix;
uniform float u_rim;
uniform float u_rim_band;

float sdBox(vec2 p, vec2 h, float r) {
  vec2 q = abs(p) - (h - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 css = v_uv * u_size;
  vec2 h = u_size * 0.5;
  float d = sdBox(css - h, h, u_radius);

  // Outward normal via tiny box tap (portable, no derivatives extension).
  float eps = 0.6;
  float dx = sdBox(css - h + vec2(eps, 0.0), h, u_radius)
           - sdBox(css - h - vec2(eps, 0.0), h, u_radius);
  float dy = sdBox(css - h + vec2(0.0, eps), h, u_radius)
           - sdBox(css - h - vec2(0.0, eps), h, u_radius);
  vec2 normal = vec2(dx, dy) / max(length(vec2(dx, dy)), 1e-4);

  // 1 inside the pane, 0 outside (edge d=0).
  float inside = 1.0 - smoothstep(-2.0, 2.0, d);
  // 1 at the rim edge, decaying to 0 u_rim_band deep inside: refraction lives
  // only in this band — the flat interior of a pane does not bend light.
  float band = clamp(1.0 + d / u_rim_band, 0.0, 1.0);
  float strength = band * (0.35 + 0.65 * band);
  vec2 refracted = v_uv - (normal * u_refraction * strength) / u_size;

  // Frost: separable-looking 3×3 gaussian [1 2 1]^2, radius = blur sigma.
  vec2 s = u_blur / u_size;
  vec3 acc = vec3(0.0);
  float accW = 0.0;
  for (int gy = -1; gy <= 1; gy++) {
    for (int gx = -1; gx <= 1; gx++) {
      float w = float((2 - abs(gx)) * (2 - abs(gy)));
      acc += texture2D(u_tex, refracted + vec2(float(gx), float(gy)) * s).rgb * w;
      accW += w;
    }
  }
  vec3 base = acc / accW;

  // Rim-only RGB dispersion: R +1px, B −1px, squared falloff keeps the
  // interior clean (very restrained).
  vec2 ca = (vec2(0.6, 0.0) * band * band) / u_size;
  base.r = texture2D(u_tex, refracted + ca).r;
  base.b = texture2D(u_tex, refracted - ca).b;

  // Saturation then environment tint.
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  vec3 colored = mix(vec3(lum), base, u_saturation);
  vec3 tinted = mix(colored, u_tint, u_tint_mix * inside);

  // Fresnel rim light: a bright ring hugging the inner edge only.
  float ring = clamp(1.0 + d / max(u_rim_band * 0.5, 3.0), 0.0, 1.0) * inside;
  float rimGlow = pow(ring, 2.2) * u_rim * 0.45;
  vec3 result = tinted + vec3(rimGlow);

  gl_FragColor = vec4(result, 1.0);
}
`

const MAX_DPR = 1.5

export class WebGLGlassRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private texture: WebGLTexture | null = null
  private paint: HTMLCanvasElement | null = null
  private location = new Map<string, WebGLUniformLocation | null>()
  private config: WebGLGlassConfig
  private dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  private lost = false
  private destroyed = false
  private onContextLost: (() => void) | null = null

  private handleLost = (event: Event) => {
    event.preventDefault()
    this.lost = true
    this.onContextLost?.()
  }
  private handleRestored = () => {
    if (this.destroyed) return
    this.lost = false
    if (this.init()) this.render()
  }

  constructor(canvas: HTMLCanvasElement, config: WebGLGlassConfig) {
    this.canvas = canvas
    this.config = config
    canvas.addEventListener('webglcontextlost', this.handleLost, false)
    canvas.addEventListener('webglcontextrestored', this.handleRestored, false)
    this.init()
  }

  static supported(): boolean {
    try {
      const canvas = document.createElement('canvas')
      const gl = (canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
      if (gl) {
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
      return Boolean(gl)
    } catch {
      return false
    }
  }

  get active() {
    return Boolean(this.gl && !this.lost && !this.destroyed)
  }

  setOnContextLost(callback: (() => void) | null) {
    this.onContextLost = callback
  }

  private init(): boolean {
    try {
      const gl =
        (this.canvas.getContext('webgl2') as WebGLRenderingContext | null) ||
        (this.canvas.getContext('webgl') as WebGLRenderingContext | null) ||
        (this.canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
      if (!gl) return false
      this.gl = gl
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      const vs = this.compile(gl.VERTEX_SHADER, VERTEX)
      const fs = this.compile(gl.FRAGMENT_SHADER, FRAGMENT)
      if (!vs || !fs) return false
      const program = gl.createProgram()
      if (!program) return false
      gl.attachShader(program, vs)
      gl.attachShader(program, fs)
      gl.linkProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false
      this.program = program
      gl.useProgram(program)
      const buffer = gl.createBuffer()
      if (!buffer) return false
      this.buffer = buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      // Fullscreen triangle.
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'a_position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      for (const name of [
        'u_tex',
        'u_size',
        'u_radius',
        'u_refraction',
        'u_blur',
        'u_saturation',
        'u_tint',
        'u_tint_mix',
        'u_rim',
        'u_rim_band',
      ])
        this.location.set(name, gl.getUniformLocation(program, name))
      this.resize(this.config.width, this.config.height)
      return true
    } catch {
      this.gl = null
      return false
    }
  }

  private compile(type: number, source: string): WebGLShader | null {
    const gl = this.gl
    if (!gl) return null
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
  }

  /** Resize the backing store (CSS px). Rerenders. */
  resize(width: number, height: number) {
    this.config = { ...this.config, width, height }
    this.paint = null
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    this.canvas.width = Math.max(2, Math.round(width * this.dpr))
    this.canvas.height = Math.max(2, Math.round(height * this.dpr))
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.render()
  }

  /** Merge new optics/painter and repaint. Width/height resize the store. */
  update(patch: Partial<WebGLGlassConfig>) {
    const { width, height, paintBackdrop, ...rest } = patch
    this.config = { ...this.config, ...rest }
    if (paintBackdrop) this.config.paintBackdrop = paintBackdrop
    if (this.paint && paintBackdrop) this.paint = null
    const w = width ?? this.config.width
    const h = height ?? this.config.height
    if (width !== undefined || height !== undefined) this.resize(w, h)
    else this.render()
  }

  /** Re-run the backdrop painter and draw the glass frame. */
  render() {
    const gl = this.gl
    if (!gl || this.lost || this.destroyed || !this.program) return
    const { width, height } = this.config
    if (width <= 2 || height <= 2) return
    if (!this.paint) {
      this.paint = document.createElement('canvas')
      this.paint.width = this.canvas.width
      this.paint.height = this.canvas.height
      const ctx = this.paint.getContext('2d')
      if (!ctx) return
      const dpr = this.dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      this.config.paintBackdrop(ctx, width, height)
    }
    if (!this.texture) this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.paint)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.useProgram(this.program)
    const set = (name: string, value: number | number[]) => {
      const loc = this.location.get(name)
      if (!loc) return
      if (typeof value === 'number') gl.uniform1f(loc, value)
      else if (value.length === 2) gl.uniform2f(loc, value[0], value[1])
      else gl.uniform3f(loc, value[0], value[1], value[2])
    }
    gl.uniform1i(this.location.get('u_tex')!, 0)
    set('u_size', [width, height])
    set('u_radius', this.config.radius)
    set('u_refraction', this.config.refraction)
    set('u_blur', this.config.blur)
    set('u_saturation', this.config.saturation)
    const { tint, tintMix } = this.config
    const tintRgb = tint
      ? oklchToSrgb({ l: tint[0], c: tint[1], h: tint[2] })
      : { r: 1, g: 1, b: 1 }
    set('u_tint', [tintRgb.r, tintRgb.g, tintRgb.b])
    set('u_tint_mix', tint ? tintMix : 0)
    set('u_rim', this.config.rim)
    set('u_rim_band', Math.max(6, Math.min(26, Math.min(width, height) * 0.12)))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    const gl = this.gl
    if (gl && this.program) {
      if (this.buffer) gl.deleteBuffer(this.buffer)
      if (this.texture) gl.deleteTexture(this.texture)
      if (this.program) gl.deleteProgram(this.program)
      const lose = gl.getExtension('WEBGL_lose_context')
      lose?.loseContext()
    }
    this.canvas.removeEventListener('webglcontextlost', this.handleLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored)
    this.gl = null
    this.program = null
    this.paint = null
  }

  /** Redraw with updated optical parameters (no texture rebuild). */
  setConfig(patch: Partial<Omit<WebGLGlassConfig, 'paintBackdrop'>>) {
    this.config = { ...this.config, ...patch }
    this.render()
  }
}
