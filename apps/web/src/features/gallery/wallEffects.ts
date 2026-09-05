// 无 WebGL 穹顶照片墙：每帧每卡一次 matrix3d（参考 docs/no-gl-grid-skill.md）。
//
// 管线（对每张可见卡片）：
//   1. wrap    — 相机位置回绕进单一坐标场，卡片间距恒为 period（晶格点严格共享）
//   2. warp    — 对卡片 period 盒四角做变形（pincushion + 光标鼓包）
//   3. inset   — 按半间距内收四角（任何曲率下间距恒定）
//   4. solve   — 矩形→四边形单应解成一条 matrix3d
// 新增效果 = 在第 2 步增加一个 term，下游代码不变。

export type WallEffectId = 'grid' | 'dome'

export interface Point {
  x: number
  y: number
}

export interface EffectFrame {
  width: number
  height: number
  period: number
  cursor: Point
  velocity: number
}

export interface WallEffectDefinition {
  id: WallEffectId
  label: string
  description: string
  /** 把晶格点（视口坐标）投影到弯曲后的坐标 */
  project(point: Point, frame: EffectFrame): Point
}

// —— Tunables（对齐 no-gl-grid-skill 的推荐值）——
/** pincushion 强度：边缘放大 1 + DOME_BOW */
const DOME_BOW = 0.15
/** 光标鼓包强度（沿径向推开） */
const DOME_BULGE = 0.25
/** 鼓包半径，单位 period */
const DOME_REACH = 1.5
/** 鼓包的随运动衰减：calm = 1 / (1 + velocity / DOME_CALM)，墙体行进时透镜淡出 */
const DOME_CALM = 40

export const WALL_EFFECTS: Record<WallEffectId, WallEffectDefinition> = {
  grid: {
    id: 'grid',
    label: '经典网格',
    description: '平直、轻量的无限照片墙',
    project: (point) => point,
  },
  dome: {
    id: 'dome',
    label: '穹顶透镜',
    description: '边缘 pincushion 弯曲，光标处径向鼓起',
    project(point, frame) {
      // 以视口中心为原点的坐标
      const halfWidth = frame.width / 2
      const halfHeight = frame.height / 2
      const centeredX = point.x - halfWidth
      const centeredY = point.y - halfHeight

      // 1) pincushion：离中心越远放大越多，四角即四边内容，曲率处处连续
      const normalizedX = centeredX / Math.max(halfWidth, 1)
      const normalizedY = centeredY / Math.max(halfHeight, 1)
      const curve = 1 + DOME_BOW * (normalizedX * normalizedX + normalizedY * normalizedY)
      const curvedX = centeredX * curve
      const curvedY = centeredY * curve

      // 2) 光标鼓包：以光标为中心的高斯径向推挤；墙体快速移动时随 lag 淡出
      const deltaX = curvedX - frame.cursor.x
      const deltaY = curvedY - frame.cursor.y
      const reach = DOME_REACH * frame.period
      const calm = 1 / (1 + frame.velocity / DOME_CALM)
      const push = DOME_BULGE * calm * Math.exp(-(deltaX * deltaX + deltaY * deltaY) / (reach * reach))

      return {
        x: curvedX + deltaX * push + halfWidth,
        y: curvedY + deltaY * push + halfHeight,
      }
    },
  },
}

export const WALL_EFFECT_OPTIONS = Object.values(WALL_EFFECTS)

export function interpolatePoint(from: Point, to: Point, progress: number): Point {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }
}

/** 沿相邻两条边各内收 gap/2 —— 相邻卡片从同一条共享线上内收，间距在任意曲率下恒定 */
export function insetCorner(point: Point, adjacentA: Point, adjacentB: Point, gap: number): Point {
  const offset = gap / 2
  const lengthA = Math.hypot(adjacentA.x - point.x, adjacentA.y - point.y) || 1
  const lengthB = Math.hypot(adjacentB.x - point.x, adjacentB.y - point.y) || 1
  return {
    x: point.x + ((adjacentA.x - point.x) / lengthA + (adjacentB.x - point.x) / lengthB) * offset,
    y: point.y + ((adjacentA.y - point.y) / lengthA + (adjacentB.y - point.y) / lengthB) * offset,
  }
}

/** 矩形 → 任意直边四边形的单应解，翻译进矩阵（transform-origin: top left） */
export function quadMatrix(size: number, topLeft: Point, topRight: Point, bottomLeft: Point, bottomRight: Point) {
  const deltaX1 = topRight.x - bottomRight.x
  const deltaY1 = topRight.y - bottomRight.y
  const deltaX2 = bottomLeft.x - bottomRight.x
  const deltaY2 = bottomLeft.y - bottomRight.y
  const sumX = topLeft.x - topRight.x - bottomLeft.x + bottomRight.x
  const sumY = topLeft.y - topRight.y - bottomLeft.y + bottomRight.y
  const denominator = deltaX1 * deltaY2 - deltaX2 * deltaY1

  if (Math.abs(denominator) < 0.000001) {
    return `translate3d(${topLeft.x}px, ${topLeft.y}px, 0)`
  }

  const projectX = (sumX * deltaY2 - deltaX2 * sumY) / denominator
  const projectY = (deltaX1 * sumY - sumX * deltaY1) / denominator
  const scaleX = topRight.x - topLeft.x + projectX * topRight.x
  const skewX = bottomLeft.x - topLeft.x + projectY * bottomLeft.x
  const skewY = topRight.y - topLeft.y + projectX * topRight.y
  const scaleY = bottomLeft.y - topLeft.y + projectY * bottomLeft.y

  return `matrix3d(${scaleX / size}, ${skewY / size}, 0, ${projectX / size}, ${skewX / size}, ${scaleY / size}, 0, ${projectY / size}, 0, 0, 1, 0, ${topLeft.x}, ${topLeft.y}, 0, 1)`
}