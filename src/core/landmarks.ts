// Landmark processing (TypeScript twin of backend/vision/landmarks.py + synthetic.py).
// Works on normalised x,y. Optional z is MediaPipe's *relative* depth estimate, never a physical distance.

import type { Gesture, HandFeatures } from './types'

const FINGERS: Record<string, [number, number, number, number]> = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
}
const PALM_POINTS = [0, 5, 9, 13, 17]
const EXT_RATIO = 1.15
const THUMB_EXT_RATIO = 1.1
export const PINCH_THRESHOLD = 0.3
const FIST_OPENNESS = 0.45

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function classifyGesture(ext: Record<string, boolean>, pinch: number, openness: number, indexRatio: number): Gesture {
  if (pinch < PINCH_THRESHOLD && indexRatio > 1.2) return 'pinch'
  const n = Object.keys(FINGERS).filter((f) => ext[f]).length
  if (n === 4 && openness > 0.6) return 'open_palm'
  if (n === 0 && openness < FIST_OPENNESS) return 'fist'
  if (ext.index && n === 1) return 'point'
  return 'other'
}

export function extractFeatures(points: number[][], handedness = 'Unknown', handednessScore = 1, presence = 1): HandFeatures {
  if (points.length !== 21) throw new Error('expected 21 landmarks')
  const wrist = points[0]
  const palmCenter = [0, 1].map((k) => PALM_POINTS.reduce((a, i) => a + points[i][k], 0) / PALM_POINTS.length)
  const palmSize = Math.max(dist(wrist, points[9]), 1e-6)

  const ext: Record<string, boolean> = {}
  const ratios: number[] = []
  for (const [name, [, pip, , tip]] of Object.entries(FINGERS)) {
    const tipD = dist(points[tip], wrist)
    const pipD = dist(points[pip], wrist)
    ext[name] = tipD > pipD * EXT_RATIO
    ratios.push(tipD / palmSize)
  }
  ext.thumb = dist(points[4], points[5]) > dist(points[3], points[5]) * THUMB_EXT_RATIO

  const openness = clamp((ratios.reduce((a, b) => a + b, 0) / ratios.length - 1) / 0.9)
  const pinch = dist(points[4], points[8]) / palmSize
  const indexRatio = dist(points[8], wrist) / palmSize
  const vx = points[9][0] - wrist[0]
  const vy = points[9][1] - wrist[1]
  const orientation = (Math.atan2(vx, -vy) * 180) / Math.PI
  const zs = points.map((p) => p[2] ?? 0)
  const depth = [4, 8, 12, 16, 20].reduce((a, i) => a + zs[i] - zs[0], 0) / 5

  return {
    landmarks: points.map((p) => [p[0], p[1]]),
    handedness,
    wrist: [wrist[0], wrist[1]],
    palm_center: palmCenter,
    fingertips: Object.fromEntries(([['thumb', 4], ['index', 8], ['middle', 12], ['ring', 16], ['pinky', 20]] as [string, number][]).map(([n, i]) => [n, [points[i][0], points[i][1]]])),
    fingers_extended: ext,
    palm_size: palmSize,
    pinch_distance: pinch,
    openness,
    orientation_deg: orientation,
    relative_depth_estimate: depth,
    tracking_confidence: clamp(handednessScore * presence),
    gesture: classifyGesture(ext, pinch, openness, indexRatio),
  }
}

export class PositionSmoother {
  private p: [number, number] | null = null
  constructor(public alpha = 0.5) {}
  reset() {
    this.p = null
  }
  update(x: number, y: number): [number, number] {
    this.p = this.p ? [this.p[0] + this.alpha * (x - this.p[0]), this.p[1] + this.alpha * (y - this.p[1])] : [x, y]
    return this.p
  }
}

// ------------------------------------------------------------------ synthetic hands (pointer simulator)
const MCP: Record<string, [number, number]> = { index: [-0.3, 0.95], middle: [0, 1], ring: [0.28, 0.95], pinky: [0.52, 0.85] }
const EXTENDED: [number, number][] = [[0, 0.45], [0, 0.72], [0, 0.94]]
const CURLED: [number, number][] = [[0, 0.35], [0, 0.2], [0, -0.05]]
const THUMB_OPEN: [number, number][] = [[-0.3, 0.2], [-0.5, 0.45], [-0.7, 0.65], [-0.88, 0.82]]
const THUMB_FIST: [number, number][] = [[-0.3, 0.2], [-0.4, 0.4], [-0.3, 0.6], [-0.1, 0.7]]
const THUMB_PINCH: [number, number][] = [[-0.3, 0.2], [-0.5, 0.5], [-0.65, 0.9], [-0.6, 1.4]]
const INDEX_PINCH: [number, number][] = [[-0.33, 1.4], [-0.42, 1.62], [-0.5, 1.55]]

function localHand(g: string): [number, number][] {
  const pts: [number, number][] = [[0, 0]]
  const thumb = g === 'pinch' ? THUMB_PINCH : g === 'fist' || g === 'point' ? THUMB_FIST : THUMB_OPEN
  pts.push(...thumb)
  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    const [mx, my] = MCP[name]
    if (g === 'pinch' && name === 'index') {
      pts.push([mx, my], ...INDEX_PINCH)
      continue
    }
    const extended = g === 'fist' ? false : g === 'point' ? name === 'index' : true
    const offs = extended ? EXTENDED : CURLED
    pts.push([mx, my], ...offs.map(([dx, dy]) => [mx + dx, my + dy] as [number, number]))
  }
  return pts
}

/** 21 landmarks whose palm centre sits at (cx, cy) in image space. */
export function makeHand(g: string, cx: number, cy: number, scale = 0.2, angleDeg = 0): number[][] {
  const local = localHand(g)
  const palm = [0, 5, 9, 13, 17].map((i) => local[i])
  const pcx = palm.reduce((a, p) => a + p[0], 0) / 5
  const pcy = palm.reduce((a, p) => a + p[1], 0) / 5
  const a = (angleDeg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  return local.map(([lx, ly]) => {
    const x = lx - pcx
    const y = ly - pcy
    return [cx + (x * ca + y * sa) * scale, cy - (-x * sa + y * ca) * scale, 0]
  })
}
