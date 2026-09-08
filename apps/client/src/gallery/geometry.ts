/**
 * Application layout adapters for React Bits Masonry / DomeGallery.
 * Flat wall = globally balanced, aspect-preserving justified rows.
 * Surround = tangent planes on the inside of a horizontally curved surface.
 * These pure functions also serve the geometry tests.
 */
import type { PhotoSummary } from '@fanphoto/contracts'
export type WallMode = 'flat' | 'surround'
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
// Density parity with the flat wall: same gap schedule (10px regular /
// 6px dense) and pure proportional sizing, so surround tiles pack as
// tightly as flat rows without an extra area tax on portraits.
const SURROUND_OPTIONS = {
  areaFactor: 1,
  gap: 10,
  denseGap: 6,
  overscanColumns: 2,
  overscanHeight: 0.65,
}

// ---------------------------------------------------------------------------
// Balanced justified wall
// ---------------------------------------------------------------------------
// 所有参数集中在 DEFAULT_JUSTIFY_OPTIONS（按密度档），调用方可用
// JustifyOverrides 覆盖任意字段（含嵌套字段），方便调试。

export interface JustifyBand {
  min: number
  max: number
}
export interface JustifyWeights {
  area: number
  rowHeight: number
  flow: number
  shortSide: number
  tileSize: number
  dispersion: number
  nonRectangular: number
}
export interface JustifyOptions {
  targetRowHeight: number
  mobileRowFactor: number
  targetAspect: number
  minimumWidthFraction: number
  gap: number
  soft: JustifyBand
  tileDispersion: number
  tileDispersionSoft: number
  isolatedPortraitMin: number
  isolatedPortraitMax: number
  isolatedAreaFactor: number
  specialMaxHeight: number
  maxRowPhotos: number
  reflowRows: number
  /** Safety ceiling for a full-width row made from only very tall photos. */
  rowHeightCap: number
  weights: JustifyWeights
}
export type JustifyOverrides = Omit<Partial<JustifyOptions>, 'soft' | 'weights'> & {
  soft?: Partial<JustifyBand>
  weights?: Partial<JustifyWeights>
}
const sharedOptions = {
  targetAspect: 1.45,
  minimumWidthFraction: 0.22,
  tileDispersion: 6,
  tileDispersionSoft: 3.5,
  isolatedPortraitMin: 0.45,
  isolatedPortraitMax: 0.85,
  isolatedAreaFactor: 3,
  maxRowPhotos: 10,
  reflowRows: 2,
  rowHeightCap: 20,
  weights: {
    area: 2,
    rowHeight: 0.3,
    flow: 0.65,
    shortSide: 3,
    tileSize: 0.3,
    dispersion: 0.2,
    nonRectangular: 10000,
  },
}
export const DEFAULT_JUSTIFY_OPTIONS: Record<number, JustifyOptions> = {
  1: {
    ...sharedOptions,
    targetRowHeight: 250,
    mobileRowFactor: 0.5,
    gap: 10,
    soft: { min: 140, max: 600 },
    specialMaxHeight: 2000,
  },
  2: {
    ...sharedOptions,
    targetRowHeight: 195,
    mobileRowFactor: 0.4,
    gap: 10,
    soft: { min: 110, max: 468 },
    specialMaxHeight: 1560,
  },
  3: {
    ...sharedOptions,
    targetRowHeight: 150,
    mobileRowFactor: 0.3,
    gap: 6,
    soft: { min: 84, max: 360 },
    specialMaxHeight: 1200,
  },
}
export function mergeJustifyOptions(density: number, options?: JustifyOverrides): JustifyOptions {
  const base = DEFAULT_JUSTIFY_OPTIONS[density] ?? DEFAULT_JUSTIFY_OPTIONS[2]
  return {
    ...base,
    ...options,
    soft: { ...base.soft, ...options?.soft },
    weights: { ...base.weights, ...options?.weights },
  }
}

/** A chosen row; geometry is emitted once after the sequence is planned. */
interface RowPlan {
  count: number
  rowHeight: number
  /** true = 铺满行（最后一张做浮点修正贴齐容器右缘）；false = 允许行尾留白 */
  fill: boolean
  /** 单张 special 超高行靠容器水平居中 */
  align: 'left' | 'center'
}

const photoRatio = (photo: PhotoSummary) => photo.width / photo.height
/** 输出一行 tiles。铺满行的最后一张用 width - x 精确保贴容器右缘，消除浮点累计误差。 */
function emitRow(
  photos: PhotoSummary[],
  start: number,
  plan: RowPlan,
  width: number,
  gap: number,
  y: number,
): Tile[] {
  const out: Tile[] = []
  let x = 0
  for (let j = 0; j < plan.count; j++) {
    const photo = photos[start + j]
    const ratio = photoRatio(photo)
    if (j === 0 && plan.align === 'center') x = Math.max(0, (width - ratio * plan.rowHeight) / 2)
    const isLast = j === plan.count - 1
    const tileWidth = plan.fill && isLast ? width - x : ratio * plan.rowHeight
    out.push({ key: photo.id, photo, x, y, width: tileWidth, height: plan.rowHeight })
    x += tileWidth + gap
  }
  return out
}

/**
 * Plan the whole loaded sequence instead of committing locally to a row and
 * enlarging its leftovers later. Log-area error penalizes tiny and huge photos
 * equally; a transition cost avoids an isolated very tall row between panoramas.
 * Candidate rows and suffix solutions are reused: O(n * maxRowPhotos²).
 */
function balancedRows(photos: PhotoSummary[], width: number, opts: JustifyOptions): RowPlan[] {
  const target = Math.min(opts.targetRowHeight, width * opts.mobileRowFactor)
  const targetArea = target * Math.min(width, target * opts.targetAspect)
  const minimumWidth = Math.min(opts.soft.min, width * opts.minimumWidthFraction)
  const isolatedPortrait = (index: number, ratio: number, fullHeight: number) => {
    if (
      photos.length < 2 ||
      ratio < opts.isolatedPortraitMin ||
      ratio >= opts.isolatedPortraitMax ||
      fullHeight * width <= targetArea * opts.isolatedAreaFactor
    )
      return false
    return [photos[index - 1], photos[index + 1]].filter(Boolean).every((neighbor) => {
      const other = photoRatio(neighbor)
      const height = (width - opts.gap) / (ratio + other)
      return (
        Math.max(ratio, other) / Math.min(ratio, other) > opts.tileDispersion ||
        Math.min(ratio, other) * height < minimumWidth
      )
    })
  }
  type Candidate = { plan: RowPlan; cost: number; total: number; next: number }
  const candidates: Candidate[][] = Array.from({ length: photos.length }, () => [])
  for (let start = photos.length - 1; start >= 0; start--) {
    let sum = 0
    let minRatio = Infinity
    let maxRatio = 0
    for (let count = 1; count <= Math.min(opts.maxRowPhotos, photos.length - start); count++) {
      const ratio = photoRatio(photos[start + count - 1])
      sum += ratio
      minRatio = Math.min(minRatio, ratio)
      maxRatio = Math.max(maxRatio, ratio)
      const fullHeight = (width - (count - 1) * opts.gap) / sum
      if (fullHeight <= 0) break
      if (count > 1 && fullHeight > opts.targetRowHeight * opts.rowHeightCap) continue
      if (
        count > 1 &&
        (maxRatio / minRatio > opts.tileDispersion || minRatio * fullHeight < minimumWidth)
      )
        continue
      const heightCap =
        count === 1 && isolatedPortrait(start, ratio, fullHeight)
          ? Math.min(opts.specialMaxHeight, Math.sqrt(targetArea / ratio))
          : opts.specialMaxHeight
      const rowHeight = count === 1 ? Math.min(fullHeight, heightCap) : fullHeight
      const plan: RowPlan = {
        count,
        rowHeight,
        fill: rowHeight === fullHeight,
        align: rowHeight === fullHeight ? 'left' : 'center',
      }
      // A bounded, centered strip is a last resort, never a cheaper way to
      // leave a hole when a proportional, full-width partition exists.
      let cost = plan.fill ? 0 : opts.weights.nonRectangular
      for (let j = start; j < start + count; j++) {
        const tileWidth = photoRatio(photos[j]) * rowHeight
        const areaError = Math.log((tileWidth * rowHeight) / targetArea)
        const shortSide = Math.min(tileWidth, rowHeight)
        cost +=
          opts.weights.area * areaError ** 2 +
          opts.weights.rowHeight * Math.log(rowHeight / target) ** 2
        cost += opts.weights.shortSide * Math.max(0, Math.log(minimumWidth / shortSide)) ** 2
        cost += opts.weights.tileSize * Math.max(0, Math.log(tileWidth / opts.soft.max)) ** 2
      }
      cost +=
        opts.weights.dispersion *
        Math.max(0, Math.log(maxRatio / minRatio / opts.tileDispersionSoft)) ** 2
      const end = start + count
      let total = cost
      let next = -1
      if (end < photos.length) {
        total = Infinity
        candidates[end].forEach((candidate, index) => {
          const flow = opts.weights.flow * Math.log(candidate.plan.rowHeight / rowHeight) ** 2
          const score = cost + candidate.total + flow
          if (score < total) {
            total = score
            next = index
          }
        })
      }
      candidates[start].push({ plan, cost, total, next })
    }
  }
  const rows: RowPlan[] = []
  let start = 0
  let choice = 0
  candidates[0].forEach((candidate, index) => {
    if (candidate.total < candidates[0][choice].total) choice = index
  })
  while (start < photos.length) {
    const candidate = candidates[start][choice]
    rows.push(candidate.plan)
    start += candidate.plan.count
    choice = candidate.next
  }
  return rows
}

/**
 * Balanced justified rows：整段最优化面积/行高/相邻变化，保持原始顺序。
 * 返回 { tiles, height } 供照片墙定位，不在布局函数中触碰 DOM。
 */
export function masonry(
  photos: PhotoSummary[],
  width: number,
  density = 2,
  options?: JustifyOverrides,
) {
  if (width <= 0 || photos.length === 0) return { tiles: [] as Tile[], height: 0 }
  const opts = mergeJustifyOptions(density, options)
  const tiles: Tile[] = []
  let y = 0
  let i = 0
  for (const plan of balancedRows(photos, width, opts)) {
    tiles.push(...emitRow(photos, i, plan, width, opts.gap, y))
    y += plan.rowHeight + opts.gap
    i += plan.count
  }
  return { tiles, height: tiles.length ? y - opts.gap : 0 }
}

/** Preserve committed rows during pagination. Only the final two rows, which
 * meet the loading sentinel, can be regrouped with the newly fetched photos. */
export function appendMasonry(
  previous: ReturnType<typeof masonry>,
  previousPhotos: PhotoSummary[],
  photos: PhotoSummary[],
  width: number,
  density = 2,
  options?: JustifyOverrides,
) {
  if (
    photos.length <= previousPhotos.length ||
    previousPhotos.some(
      (photo, index) =>
        photo.id !== photos[index]?.id ||
        photo.width !== photos[index]?.width ||
        photo.height !== photos[index]?.height,
    )
  )
    return masonry(photos, width, density, options)
  const opts = mergeJustifyOptions(density, options)
  const rows = [...new Set(previous.tiles.map((tile) => tile.y))]
  const from = rows[Math.max(0, rows.length - opts.reflowRows)] ?? 0
  const kept = previous.tiles
    .filter((tile) => tile.y < from)
    .map((tile, index) => ({ ...tile, photo: photos[index] }))
  const tail = masonry(photos.slice(kept.length), width, density, options)
  const offset = kept.length ? kept.at(-1)!.y + kept.at(-1)!.height + opts.gap : 0
  return {
    tiles: [...kept, ...tail.tiles.map((tile) => ({ ...tile, y: tile.y + offset }))],
    height: tail.height + offset,
  }
}

export function sceneTiles(photos: PhotoSummary[], size: Size, pose: Pose, density = 2): Tile[] {
  if (!photos.length || !size.width || !size.height) return []
  const columns = columnCount(size.width, density),
    cell = size.width / columns
  const gap = density === 3 ? SURROUND_OPTIONS.denseGap : SURROUND_OPTIONS.gap,
    width = cell - gap
  const margin = Math.max(
    cell * SURROUND_OPTIONS.overscanColumns,
    size.height * SURROUND_OPTIONS.overscanHeight,
  )
  const left = Math.floor(
    (pose.x - size.width / 2 - cell * SURROUND_OPTIONS.overscanColumns) / cell,
  )
  const right = Math.ceil(
    (pose.x + size.width / 2 + cell * SURROUND_OPTIONS.overscanColumns) / cell,
  )
  const tiles: Tile[] = []
  for (let column = left; column <= right; column++) {
    const pool = photos.map((_, i) => photos[modulo(i + column * 5, photos.length)])
    // Keep tall photos from dominating the surrounding space. Panoramas retain
    // the full column width; narrower photos approach the same visible area.
    const widths = pool.map((photo) =>
      Math.min(
        width,
        Math.sqrt((width * width * SURROUND_OPTIONS.areaFactor * photo.width) / photo.height),
      ),
    )
    const heights = pool.map((photo, index) => (widths[index] * photo.height) / photo.width)
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
            width: widths[row],
            height,
          })
        y += height + gap
      }
    }
  }
  return tiles
}
export function project(x: number, y: number, size: Size) {
  const dimension = Math.max(size.width, size.height)
  const radius = dimension * 1.65
  const theta = Math.max(-0.75, Math.min(0.75, x / radius))
  return {
    x: radius * Math.sin(theta),
    y,
    z: radius * (1 - Math.cos(theta)),
    rotateY: (-theta * 180) / Math.PI,
  }
}
