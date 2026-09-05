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
  project(point: Point, frame: EffectFrame): Point
}

const gridEffect: WallEffectDefinition = {
  id: 'grid',
  label: '经典网格',
  description: '平直、轻量的无限照片墙',
  project: (point) => point,
}

const domeEffect: WallEffectDefinition = {
  id: 'dome',
  label: '穹顶透镜',
  description: '边缘弯曲并跟随光标鼓起',
  project(point, frame) {
    const halfWidth = frame.width / 2
    const halfHeight = frame.height / 2
    const centeredX = point.x - halfWidth
    const centeredY = point.y - halfHeight
    const normalizedX = centeredX / Math.max(halfWidth, 1)
    const normalizedY = centeredY / Math.max(halfHeight, 1)
    const bow = 0.105
    const curve = 1 + bow * (normalizedX * normalizedX + normalizedY * normalizedY)
    const curvedX = centeredX * curve
    const curvedY = centeredY * curve
    const deltaX = curvedX - frame.cursor.x
    const deltaY = curvedY - frame.cursor.y
    const reach = 1.55 * frame.period
    const calm = 1 / (1 + frame.velocity / 18)
    const push = 0.2 * calm * Math.exp(-(deltaX * deltaX + deltaY * deltaY) / (reach * reach))

    return {
      x: curvedX + deltaX * push + halfWidth,
      y: curvedY + deltaY * push + halfHeight,
    }
  },
}

export const WALL_EFFECTS: Record<WallEffectId, WallEffectDefinition> = {
  grid: gridEffect,
  dome: domeEffect,
}

export const WALL_EFFECT_OPTIONS = Object.values(WALL_EFFECTS)

export function interpolatePoint(from: Point, to: Point, progress: number): Point {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }
}

export function insetCorner(point: Point, adjacentA: Point, adjacentB: Point, gap: number): Point {
  const offset = gap / 2
  const lengthA = Math.hypot(adjacentA.x - point.x, adjacentA.y - point.y) || 1
  const lengthB = Math.hypot(adjacentB.x - point.x, adjacentB.y - point.y) || 1
  return {
    x: point.x + ((adjacentA.x - point.x) / lengthA + (adjacentB.x - point.x) / lengthB) * offset,
    y: point.y + ((adjacentA.y - point.y) / lengthA + (adjacentB.y - point.y) / lengthB) * offset,
  }
}

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
