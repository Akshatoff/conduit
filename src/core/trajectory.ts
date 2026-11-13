// Trajectory analysis over a rolling window (TypeScript twin of backend/intent/trajectory.py).
// No vision dependency: consumes (t, x, y) samples from any input modality.

type Sample = [number, number, number]

export interface TrajectoryMetrics {
  n: number
  duration: number
  path_length: number
  displacement: number
  consistency: number
  speed: number
  direction: [number, number]
  stability: number
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

export function emptyMetrics(n = 0): TrajectoryMetrics {
  return { n, duration: 0, path_length: 0, displacement: 0, consistency: 1, speed: 0, direction: [0, 0], stability: 0 }
}

export class TrajectoryAnalyzer {
  samples: Sample[] = []
  private zone: string | null = null
  private zoneSince = 0
  constructor(
    private windowS = 1.5,
    private stabilityWindowS = 0.4,
    private velocityWindowS = 0.25,
    private approachWindowS = 0.8,
    private jitterRef = 0.03,
  ) {}

  add(t: number, x: number, y: number) {
    const last = this.samples[this.samples.length - 1]
    if (last && t <= last[0]) return
    this.samples.push([t, x, y])
    while (this.samples.length && t - this.samples[0][0] > this.windowS) this.samples.shift()
  }

  reset() {
    this.samples = []
    this.zone = null
  }

  private since(seconds: number): Sample[] {
    if (!this.samples.length) return []
    const tEnd = this.samples[this.samples.length - 1][0]
    return this.samples.filter((s) => tEnd - s[0] <= seconds)
  }

  private static pathOf(pts: Sample[]): number {
    let p = 0
    for (let i = 1; i < pts.length; i++) p += Math.hypot(pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])
    return p
  }

  metrics(): TrajectoryMetrics {
    const pts = this.samples
    if (pts.length < 2) return emptyMetrics(pts.length)
    const path = TrajectoryAnalyzer.pathOf(pts)
    const first = pts[0]
    const last = pts[pts.length - 1]
    const disp = Math.hypot(last[1] - first[1], last[2] - first[2])
    const consistency = path < 0.02 ? 1 : clamp(disp / path)

    const vw = this.since(this.velocityWindowS)
    let speed = 0
    if (vw.length >= 2 && vw[vw.length - 1][0] > vw[0][0]) speed = TrajectoryAnalyzer.pathOf(vw) / (vw[vw.length - 1][0] - vw[0][0])

    const dw = this.since(0.4)
    let direction: [number, number] = [0, 0]
    if (dw.length >= 2) {
      const dx = dw[dw.length - 1][1] - dw[0][1]
      const dy = dw[dw.length - 1][2] - dw[0][2]
      const m = Math.hypot(dx, dy)
      if (m > 0.01) direction = [dx / m, dy / m]
    }

    const sw = this.since(this.stabilityWindowS)
    let stability = 0
    if (sw.length >= 3) {
      const mx = sw.reduce((a, s) => a + s[1], 0) / sw.length
      const my = sw.reduce((a, s) => a + s[2], 0) / sw.length
      const rms = Math.sqrt(sw.reduce((a, s) => a + (s[1] - mx) ** 2 + (s[2] - my) ** 2, 0) / sw.length)
      stability = clamp(1 - rms / this.jitterRef)
    }
    return { n: pts.length, duration: last[0] - first[0], path_length: path, displacement: disp, consistency, speed, direction, stability }
  }

  approachScore(target: [number, number], minMove = 0.04): number {
    const w = this.since(this.approachWindowS)
    if (w.length < 3) return 0
    const first = w[0]
    const last = w[w.length - 1]
    const dx = last[1] - first[1]
    const dy = last[2] - first[2]
    const move = Math.hypot(dx, dy)
    if (move < minMove) return 0
    const vx = target[0] - first[1]
    const vy = target[1] - first[2]
    const vm = Math.hypot(vx, vy)
    if (vm < 1e-6) return 0
    const cos = (dx * vx + dy * vy) / (move * vm)
    const closing = vm - Math.hypot(target[0] - last[1], target[1] - last[2])
    if (closing <= 0) return 0
    const path = TrajectoryAnalyzer.pathOf(w)
    const straight = path > 1e-6 ? clamp(move / path) : 1
    return clamp(Math.max(0, cos) * straight)
  }

  updateZone(zoneId: string | null, t: number) {
    if (zoneId !== this.zone) {
      this.zone = zoneId
      this.zoneSince = t
    }
  }

  dwell(zoneId: string, t: number): number {
    return this.zone === zoneId ? Math.max(0, t - this.zoneSince) : 0
  }
}
