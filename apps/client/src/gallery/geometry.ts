/**
 * Application layout adapters for React Bits Masonry / DomeGallery.
 * Flat wall = adaptive justified rows (V2.1: score-based row building, hard/soft
 * width bands, special rows for extreme ratios, next-row preview, last-row slack).
 * Cylinder/sphere = tangent planes on the inside of a virtual surface.
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

// ---------------------------------------------------------------------------
// Justified wall (V2.1)
// ---------------------------------------------------------------------------
// 所有参数集中在 DEFAULT_JUSTIFY_OPTIONS（按密度档），调用方可用
// Partial<JustifyOptions> 覆盖任意字段，方便调试，不散落硬编码。

export interface JustifyBand {
  min: number
  max: number
}
export interface JustifyWeights {
  /** 第 2 优先：rowHeight 接近 target */
  rowHeight: number
  /** 第 3 优先：避免单图过小 / 过大（soft 带外罚分） */
  tileSize: number
  /** 第 4 优先：与上一行高度平滑 */
  flow: number
  /** 第 5 优先：next-row preview 罚分 */
  preview: number
}
export interface JustifyOptions {
  /** 目标行高（像素） */
  targetRowHeight: number
  /** 行内与行间间距（像素） */
  gap: number
  /** soft 单图宽带：带外轻微超限只罚分 */
  soft: JustifyBand
  /** hard 单图宽带（严格档）：带外候选直接 invalid */
  strict: JustifyBand
  /** hard 单图宽带（放宽档）：仅当 strict 档无候选时启用 */
  relaxed: JustifyBand
  /** 行内 maxW/minW 硬上限：超过该极差的候选行直接淘汰（防全景把窄图压到极小） */
  tileDispersion: number
  /** 行内 maxW/minW 软阈值：超过则层 3 罚分 */
  tileDispersionSoft: number
  /** ratio >= 此值视为超宽 extreme */
  extremeWide: number
  /** ratio <= 此值视为超高 extreme */
  extremeTall: number
  /** special row 单图高度上限（超高长图用之，防无限高） */
  specialMaxHeight: number
  /** 每行贪心候选张数上限；剩余照片数不超过它时进入尾部整体规划 */
  maxRowPhotos: number
  /** 中间行行高硬帽（相对 targetRowHeight 的倍数），防偶发巨行 */
  maxRowHeightFactor: number
  /** 尾部整体规划最多拆几行 */
  tailMaxRows: number
  /** 尾部铺满行高上限（相对 targetRowHeight 的倍数），防单张爆屏 */
  tailRowHeightCap: number
  /** next-row preview 最多模拟的张数 */
  previewNext: number
  /** 下一行行高相对 target 的合理区间，超出即极端 */
  previewRange: [number, number]
  /** 评分权重（层级 2..5，第 1 层硬约束为淘汰制不参与加权） */
  weights: JustifyWeights
}
export const DEFAULT_JUSTIFY_OPTIONS: Record<number, JustifyOptions> = {
  1: {
    targetRowHeight: 250,
    gap: 10,
    soft: { min: 140, max: 600 },
    strict: { min: 95, max: 1000 },
    relaxed: { min: 38, max: 1500 },
    tileDispersion: 5,
    tileDispersionSoft: 3.5,
    extremeWide: 3.2,
    extremeTall: 0.45,
    specialMaxHeight: 2000,
    maxRowPhotos: 10,
    maxRowHeightFactor: 6,
    tailMaxRows: 4,
    tailRowHeightCap: 20,
    previewNext: 3,
    previewRange: [0.55, 1.8],
    weights: { rowHeight: 1, tileSize: 0.5, flow: 0.3, preview: 0.2 },
  },
  2: {
    targetRowHeight: 195,
    gap: 10,
    soft: { min: 110, max: 468 },
    strict: { min: 74, max: 780 },
    relaxed: { min: 29, max: 1170 },
    tileDispersion: 5,
    tileDispersionSoft: 3.5,
    extremeWide: 3.2,
    extremeTall: 0.45,
    specialMaxHeight: 1560,
    maxRowPhotos: 10,
    maxRowHeightFactor: 6,
    tailMaxRows: 4,
    tailRowHeightCap: 20,
    previewNext: 3,
    previewRange: [0.55, 1.8],
    weights: { rowHeight: 1, tileSize: 0.5, flow: 0.3, preview: 0.2 },
  },
  3: {
    targetRowHeight: 150,
    gap: 6,
    soft: { min: 84, max: 360 },
    strict: { min: 57, max: 600 },
    relaxed: { min: 23, max: 900 },
    tileDispersion: 5,
    tileDispersionSoft: 3.5,
    extremeWide: 3.2,
    extremeTall: 0.45,
    specialMaxHeight: 1200,
    maxRowPhotos: 10,
    maxRowHeightFactor: 6,
    tailMaxRows: 4,
    tailRowHeightCap: 20,
    previewNext: 3,
    previewRange: [0.55, 1.8],
    weights: { rowHeight: 1, tileSize: 0.5, flow: 0.3, preview: 0.2 },
  },
}
export function mergeJustifyOptions(density: number, options?: Partial<JustifyOptions>): JustifyOptions {
  const base = DEFAULT_JUSTIFY_OPTIONS[density] ?? DEFAULT_JUSTIFY_OPTIONS[2]
  const merged: JustifyOptions = { ...base, ...options }
  if (options?.soft) merged.soft = { ...base.soft, ...options.soft }
  if (options?.strict) merged.strict = { ...base.strict, ...options.strict }
  if (options?.relaxed) merged.relaxed = { ...base.relaxed, ...options.relaxed }
  if (options?.weights) merged.weights = { ...base.weights, ...options.weights }
  return merged
}

/** 行构建计划：buildRow 产出行成员与行高，emitRow 负责排版输出。 */
interface RowPlan {
  count: number
  rowHeight: number
  /** true = 铺满行（最后一张做浮点修正贴齐容器右缘）；false = 允许行尾留白 */
  fill: boolean
  /** 单张 special 超高行靠容器水平居中 */
  align: 'left' | 'center'
}

const photoRatio = (photo: PhotoSummary) => photo.width / photo.height
const isExtreme = (ratio: number, opts: JustifyOptions) =>
  ratio >= opts.extremeWide || ratio <= opts.extremeTall

/** 铺满行高：容器宽度按归一化宽度摊给候选行成员。 */
function fillRowHeight(photos: PhotoSummary[], start: number, count: number, width: number, gap: number) {
  let total = 0
  for (let j = 0; j < count; j++) total += photoRatio(photos[start + j])
  return (width - (count - 1) * gap) / total
}
/**
 * 最后一行 A 策略：默认按 targetRowHeight 排（允许尾部留白，不放大铺满）。
 * 硬约束只降不升：单图不超过 strict.max、行不超出容器；
 * 软可读抬升（minR 图不至于过细）以上述硬帽为限，冲突时让步硬约束。
 */
function lastRowHeight(photos: PhotoSummary[], start: number, count: number, width: number, opts: JustifyOptions) {
  let maxR = 0
  let minR = Infinity
  let total = 0
  for (let j = 0; j < count; j++) {
    const r = photoRatio(photos[start + j])
    if (r > maxR) maxR = r
    if (r < minR) minR = r
    total += r
  }
  // 硬帽：单图宽度 ≤ strict.max、行总宽 ≤ 容器宽
  const cap = Math.min(opts.strict.max / maxR, (width - (count - 1) * opts.gap) / total)
  let h = Math.min(opts.targetRowHeight, cap)
  if (minR * h < opts.soft.min) h = Math.min(Math.max(h, opts.soft.min / minR), cap)
  return h
}

/** 候选行的每张 tile 宽度是否满足 band 约束（checkMax=false 时只防过细）。 */
function tileWidthsInBand(photos: PhotoSummary[], start: number, count: number, rowHeight: number, band: JustifyBand, checkMax = true) {
  for (let j = 0; j < count; j++) {
    const w = photoRatio(photos[start + j]) * rowHeight
    if (w < band.min || (checkMax && w > band.max)) return false
  }
  return true
}
/** 候选行内每张 tile 的宽度列表。 */
function tileWidths(photos: PhotoSummary[], start: number, count: number, rowHeight: number) {
  const ws: number[] = []
  for (let j = 0; j < count; j++) ws.push(photoRatio(photos[start + j]) * rowHeight)
  return ws
}
/** 行内 maxW / minW。 */
const maxDivMin = (ws: number[]) => {
  let minW = Infinity
  let maxW = 0
  for (const w of ws) {
    if (w < minW) minW = w
    if (w > maxW) maxW = w
  }
  return maxW / minW
}

/** 轻量 next-row preview：对下一行模拟最多 previewNext 张，全部极端才罚分。 */
function nextRowPreviewScore(photos: PhotoSummary[], next: number, count: number, width: number, opts: JustifyOptions) {
  const start = next + count
  if (start >= photos.length) return 1
  const n = Math.min(opts.previewNext, photos.length - start)
  const [lo, hi] = opts.previewRange
  let leastDeviation = Infinity
  for (let k = 1; k <= n; k++) {
    let total = 0
    for (let j = 0; j < k; j++) total += photoRatio(photos[start + j])
    const rel = ((width - (k - 1) * opts.gap) / total) / opts.targetRowHeight
    if (rel >= lo && rel <= hi) return 1 // 至少存在一种不极端的下一行 → 不罚
    leastDeviation = Math.min(leastDeviation, rel < lo ? (lo - rel) / lo : (rel - hi) / hi)
  }
  return Math.max(0, 1 - leastDeviation)
}

/** 分层评分（层级 2..5；层级 1 硬约束已在候选筛选中淘汰），归一化到 [0,1]。 */
function scoreCandidate(photos: PhotoSummary[], start: number, plan: RowPlan, width: number, opts: JustifyOptions, previousRowHeight: number) {
  let minW = Infinity
  let maxW = 0
  for (let j = 0; j < plan.count; j++) {
    const w = photoRatio(photos[start + j]) * plan.rowHeight
    if (w < minW) minW = w
    if (w > maxW) maxW = w
  }
  // 层级 2：行高接近 target
  const sRowHeight = 1 - Math.min(Math.abs(plan.rowHeight - opts.targetRowHeight) / opts.targetRowHeight, 1)
  // 层级 3：soft 带外轻微超限（过小/过大）+ 行内极差超软阈值的线性罚分（带内为 0）
  const under = opts.soft.min - minW
  const over = maxW - opts.soft.max
  const dispersion = maxW / minW > opts.tileDispersionSoft ? (maxW / minW - opts.tileDispersionSoft) / (opts.tileDispersion - opts.tileDispersionSoft) : 0
  const violation = Math.max(
    under > 0 ? under / (opts.soft.min - opts.strict.min) : 0,
    over > 0 ? over / (opts.strict.max - opts.soft.max) : 0,
    dispersion,
  )
  const sTileSize = 1 - Math.min(violation, 1)
  // 层级 4：与上一行高度平滑
  const denom = Math.max(plan.rowHeight, previousRowHeight, 1)
  const sFlow = 1 - Math.min(Math.abs(plan.rowHeight - previousRowHeight) / denom, 1)
  // 层级 5：next-row preview
  const sPreview = nextRowPreviewScore(photos, start, plan.count, width, opts)
  const { rowHeight: w2, tileSize: w3, flow: w4, preview: w5 } = opts.weights
  return (w2 * sRowHeight + w3 * sTileSize + w4 * sFlow + w5 * sPreview) / (w2 + w3 + w4 + w5)
}

/**
 * extreme 照片的 special row：不强制铺满容器。
 * 超宽全景 → 宽度受限（≤ strict.max），自然高度，靠左；
 * 超高长图 → 高度受限（≤ specialMaxHeight），宽度 = 高度×比例，居中。
 */
function specialRow(photo: PhotoSummary, width: number, opts: JustifyOptions): RowPlan {
  const ratio = photoRatio(photo)
  if (ratio >= opts.extremeWide)
    return { count: 1, rowHeight: Math.min(width, opts.strict.max) / ratio, fill: false, align: 'left' }
  return { count: 1, rowHeight: opts.specialMaxHeight, fill: false, align: 'center' }
}

/**
 * 尾部整体规划（矩形化）：剩余照片（≤ maxRowPhotos）一次拆成 1..tailMaxRows 个铺满行，
 * 枚举所有连续划分，选行高最贴近 target 且相邻平滑的合法方案。
 * 任何划分都被硬帽（cap）或 hard band 挡下时返回 null，由调用方回退到逐行 buildRow。
 */
function planTail(photos: PhotoSummary[], start: number, width: number, opts: JustifyOptions, previousRowHeight: number): RowPlan[] | null {
  const left = photos.length - start
  if (left <= 0) return []
  const cap = opts.targetRowHeight * opts.tailRowHeightCap
  const maxRows = Math.min(opts.tailMaxRows, left)
  let best: RowPlan[] | null = null
  let bestScore = Infinity
  const tryPartition = (sizes: number[]) => {
    let pos = start
    const rows: RowPlan[] = []
    let ok = true
    for (const size of sizes) {
      const h = fillRowHeight(photos, pos, size, width, opts.gap)
      // 尾部为收官段：只防"单图过细（< soft.min）"、"行内极差过大"与"行高爆掉（> cap）"，
      // max 不做硬挡 —— 行总宽恒等于容器宽，尽力铺满不留空缺
      let minW = Infinity
      let maxW = 0
      for (let j = 0; j < size; j++) {
        const w = photoRatio(photos[pos + j]) * h
        if (w < minW) minW = w
        if (w > maxW) maxW = w
      }
      if (h > cap || minW < opts.soft.min || maxW / minW > opts.tileDispersion) {
        ok = false
        break
      }
      rows.push({ count: size, rowHeight: h, fill: true, align: 'left' })
      pos += size
    }
    if (!ok) return
    let score = 0
    for (const row of rows) score += Math.abs(row.rowHeight - opts.targetRowHeight) / opts.targetRowHeight
    score /= rows.length
    for (let i = 1; i < rows.length; i++)
      score += 0.35 * (Math.abs(rows[i].rowHeight - rows[i - 1].rowHeight) / Math.max(rows[i].rowHeight, rows[i - 1].rowHeight))
    if (previousRowHeight > 0)
      score += 0.35 * (Math.abs(rows[0].rowHeight - previousRowHeight) / Math.max(rows[0].rowHeight, previousRowHeight))
    if (score < bestScore) {
      bestScore = score
      best = rows
    }
  }
  // 枚举连续划分：sizes 各段 ≥1，总和 = left，段数 ≤ maxRows
  const gen = (from: number, rowsLeft: number, sizes: number[]) => {
    const remain = left - from
    if (rowsLeft === 1) {
      tryPartition([...sizes, remain])
      return
    }
    for (let s = 1; s <= remain - (rowsLeft - 1); s++) gen(from + s, rowsLeft - 1, [...sizes, s])
  }
  for (let r = 1; r <= maxRows; r++) gen(0, r, [])
  return best
}

/** 贪心构建一行（借鉴 Justified-Gallery 的行填充语义）：
 * 先按"加到下一张行高会跌破 target"的规则锚定张数 k*（行内张数钉在 target 行高附近，
 * 避免评分漂移把窄图压小），再在 k*±1 邻域内做 band / 极差 / 行高帽过滤 + 分层评分选优。
 * 邻域无解时退化为全枚举（极端比例库仍找得到 legal 行）；仍无解则 extreme 走 special、
 * 正常照片以单张 A 策略兜底 —— 保证全部照片按原始顺序落位、永不丢图。
 */
function buildRow(photos: PhotoSummary[], start: number, width: number, opts: JustifyOptions, previousRowHeight: number): RowPlan {
  const remaining = photos.length - start
  const maxCount = Math.min(opts.maxRowPhotos, remaining)
  const maxRowHeight = opts.targetRowHeight * opts.maxRowHeightFactor
  const cumulativeAr = (n: number) => {
    let s = 0
    for (let j = 0; j < n; j++) s += photoRatio(photos[start + j])
    return s
  }
  const fillHeight = (k: number) => (width - (k - 1) * opts.gap) / cumulativeAr(k)
  // 锚点 k*：行高保持 ≥ target 的最大张数（再加入一张行高跌破 target）
  let kStar = maxCount
  for (let k = 1; k <= maxCount; k++)
    if (fillHeight(k) < opts.targetRowHeight) {
      kStar = k - 1
      break
    }
  if (kStar < 1) kStar = 1
  const kernels =
    kStar === maxCount
      ? kStar > 1
        ? [kStar - 1, kStar]
        : [kStar]
      : kStar > 1
        ? [kStar - 1, kStar, kStar + 1]
        : [kStar, kStar + 1]
  const legal = (k: number, band: JustifyBand): RowPlan | null => {
    if (k < 1 || k > maxCount) return null
    const isLastRow = start + k === photos.length
    const rowHeight = isLastRow ? lastRowHeight(photos, start, k, width, opts) : fillHeight(k)
    if (!isLastRow && rowHeight > maxRowHeight) return null
    const plan: RowPlan = { count: k, rowHeight, fill: !isLastRow, align: 'left' }
    const ws = tileWidths(photos, start, k, rowHeight)
    if (ws.some((w) => w < band.min || w > band.max)) return null
    if (maxDivMin(ws) > opts.tileDispersion) return null
    return plan
  }
  const collect = (ks: number[]) => {
    const out: RowPlan[] = []
    for (const band of [opts.strict, opts.relaxed])
      for (const k of ks) {
        const plan = legal(k, band)
        if (plan) out.push(plan)
      }
    return out
  }
  let candidates = collect(kernels)
  if (!candidates.length) {
    // 锚点邻域无解：极端比例库退化到全枚举
    const allKs: number[] = []
    for (let k = 1; k <= maxCount; k++) allKs.push(k)
    candidates = collect(allKs)
  }
  if (candidates.length) {
    let best = candidates[0]
    let bestScore = -Infinity
    for (const candidate of candidates) {
      const score = scoreCandidate(photos, start, candidate, width, opts, previousRowHeight)
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
    return best
  }
  if (isExtreme(photoRatio(photos[start]), opts)) return specialRow(photos[start], width, opts)
  // 孤立窄图兜底：单张 A 策略行，水平居中（画廊单图观感），避免贴左孤条 + 大片留白
  return { count: 1, rowHeight: lastRowHeight(photos, start, 1, width, opts), fill: false, align: 'center' }
}

/** 输出一行 tiles。铺满行的最后一张用 width - x 精确保贴容器右缘，消除浮点累计误差。 */
function emitRow(photos: PhotoSummary[], start: number, plan: RowPlan, width: number, gap: number, y: number): Tile[] {
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
 * Adaptive justified rows：逐行贪心 + 分层评分，保持照片原始顺序。
 * 返回 { tiles, height } 供 absolute positioning 渲染；签名与旧最短列实现兼容。
 */
export function masonry(photos: PhotoSummary[], width: number, density = 2, options?: Partial<JustifyOptions>) {
  if (width <= 0 || photos.length === 0) return { tiles: [] as Tile[], height: 0 }
  const opts = mergeJustifyOptions(density, options)
  const tiles: Tile[] = []
  let y = 0
  let previousRowHeight = 0 // 独立维护上一行实际行高，与纵向坐标 y 分离
  let i = 0
  while (i < photos.length) {
    // 剩余不足一行有余量：尾部整体规划成 1..tailMaxRows 个铺满行 → 底部平齐、整体矩形
    if (photos.length - i <= opts.maxRowPhotos) {
      const tail = planTail(photos, i, width, opts, previousRowHeight)
      if (tail) {
        for (const row of tail) {
          tiles.push(...emitRow(photos, i, row, width, opts.gap, y))
          y += row.rowHeight + opts.gap
          previousRowHeight = row.rowHeight
          i += row.count
        }
        break
      }
      // planTail 无解（极端比例无法健康铺满）→ 回退逐行 buildRow（special row / 单张兜底）
    }
    const plan = buildRow(photos, i, width, opts, previousRowHeight)
    tiles.push(...emitRow(photos, i, plan, width, opts.gap, y))
    y += plan.rowHeight + opts.gap
    previousRowHeight = plan.rowHeight
    i += plan.count
  }
  return { tiles, height: tiles.length ? y - opts.gap : 0 }
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