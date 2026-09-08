/** Signed-distance functions for the glass lens (px units, y-down). */
export const sdRoundedBox = (
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  radius: number,
) => {
  const qx = Math.abs(x) - (halfW - radius)
  const qy = Math.abs(y) - (halfH - radius)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius
}

/** x/y components of the outward unit normal of the SDF. */
export const sdfNormal = (
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  radius: number,
  eps = 1,
) => {
  const d = (px: number, py: number) => sdRoundedBox(px, py, halfW, halfH, radius)
  const nx = d(x + eps, y) - d(x - eps, y)
  const ny = d(x, y + eps) - d(x, y - eps)
  const length = Math.hypot(nx, ny) || 1
  return [nx / length, ny / length] as const
}

/** Signed distance from the shape's edge, negative inside. */
export type HeightField = (x: number, y: number) => number
