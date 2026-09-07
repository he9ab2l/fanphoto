/**
 * Application layout adapters for React Bits Masonry / DomeGallery.
 * Shortest-column masonry; tangent planes on the inside of a cylinder/sphere.
 * These pure functions also serve the geometry tests.
 */
import type { PhotoSummary } from '@fanphoto/contracts'
export type WallMode = 'flat' | 'cylinder' | 'sphere'
export interface Pose {
  x: number
  y: number
}
export interface Size {
  width: number
  height: number
}
export interface Tile {
  key: string
  photo: PhotoSummary
  x: number
  y: number
  width: number
  height: number
}
export const modulo = (value: number, length: number) => ((value % length) + length) % length
export function columnCount(width: number, density: number) {
  if (width < 600) return density === 3 ? 3 : 2
  return Math.max(2, Math.min(9, Math.floor(width / ({ 1: 340, 2: 260, 3: 200 }[density] || 260))))
}
export function masonry(photos: PhotoSummary[], width: number, density = 2) {
  if (width <= 0) return { tiles: [] as Tile[], height: 0 }
  const columns = columnCount(width, density),
    gap = density === 3 ? 6 : 10
  const columnWidth = (width - (columns - 1) * gap) / columns
  const heights = Array<number>(columns).fill(0)
  const tiles = photos.map((photo) => {
    const ratio = photo.width / photo.height
    const span = ratio >= 2.4 ? Math.min(2, columns) : 1
    let column = 0,
      y = Infinity
    for (let start = 0; start <= columns - span; start++) {
      const candidate = Math.max(...heights.slice(start, start + span))
      if (candidate < y) {
        column = start
        y = candidate
      }
    }
    const tileWidth = columnWidth * span + gap * (span - 1)
    const tileHeight = tileWidth / ratio
    for (let i = column; i < column + span; i++) heights[i] = y + tileHeight + gap
    return {
      key: photo.id,
      photo,
      x: column * (columnWidth + gap),
      y,
      width: tileWidth,
      height: tileHeight,
    }
  })
  return { tiles, height: Math.max(0, ...heights) - (photos.length ? gap : 0) }
}
export function sceneTiles(photos: PhotoSummary[], size: Size, pose: Pose, density = 2): Tile[] {
  if (!photos.length || !size.width || !size.height) return []
  const columns = columnCount(size.width, density),
    cell = size.width / columns
  const gap = density === 3 ? 8 : 14,
    width = cell - gap
  const margin = Math.max(cell * 2, size.height * 0.65)
  const left = Math.floor((pose.x - size.width / 2 - cell * 2) / cell)
  const right = Math.ceil((pose.x + size.width / 2 + cell * 2) / cell)
  const tiles: Tile[] = []
  for (let column = left; column <= right; column++) {
    const pool = photos.map((_, i) => photos[modulo(i + column * 5, photos.length)])
    const heights = pool.map((photo) => (width * photo.height) / photo.width)
    const period = heights.reduce((sum, height) => sum + height + gap, 0)
    const shift = modulo(column, 3) * cell * 0.23
    const low = pose.y - size.height / 2 - margin
    const high = pose.y + size.height / 2 + margin
    for (
      let cycle = Math.floor((low - shift) / period);
      cycle <= Math.floor((high - shift) / period);
      cycle++
    ) {
      let y = cycle * period + shift
      for (let row = 0; row < pool.length; row++) {
        const height = heights[row]
        if (y + height >= low && y <= high)
          tiles.push({
            key: `${column}:${cycle}:${row}`,
            photo: pool[row],
            x: column * cell + cell / 2,
            y: y + height / 2,
            width,
            height,
          })
        y += height + gap
      }
    }
  }
  return tiles
}
export function project(x: number, y: number, size: Size, mode: Exclude<WallMode, 'flat'>) {
  const dimension = Math.max(size.width, size.height)
  const radius = dimension * (mode === 'cylinder' ? 1.65 : 1.05)
  const theta = Math.max(-0.75, Math.min(0.75, x / radius))
  const phi = mode === 'sphere' ? Math.max(-0.68, Math.min(0.68, y / radius)) : 0
  return {
    x: radius * Math.sin(theta) * Math.cos(phi),
    y: mode === 'sphere' ? radius * Math.sin(phi) : y,
    z: radius * (1 - Math.cos(theta) * Math.cos(phi)),
    rotateY: (-theta * 180) / Math.PI,
    rotateX: (phi * 180) / Math.PI,
  }
}
