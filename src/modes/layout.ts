// Zone geometry helpers. All coordinates are normalised mirrored-camera space (0..1) —
// the exact space the Intent Engine and the camera overlay already use.

import type { Zone } from '../core/types'
import type { ModeControl } from './types'

const AREA = { x0: 0.035, y0: 0.055, x1: 0.965, y1: 0.73 }
const GAP = 0.016

export function zoneRect(row: number, col: number, rows: number, cols: number) {
  const w = (AREA.x1 - AREA.x0 - (cols - 1) * GAP) / cols
  const h = (AREA.y1 - AREA.y0 - (rows - 1) * GAP) / rows
  return {
    x0: +(AREA.x0 + col * (w + GAP)).toFixed(4),
    y0: +(AREA.y0 + row * (h + GAP)).toFixed(4),
    x1: +(AREA.x0 + col * (w + GAP) + w).toFixed(4),
    y1: +(AREA.y0 + row * (h + GAP) + h).toFixed(4),
  }
}

export function gridZones(controls: ModeControl[], rows: number, cols: number): Zone[] {
  return controls.map((c, i) => ({
    id: c.id,
    label: c.label,
    device: c.device,
    ...zoneRect(Math.floor(i / cols), i % cols, rows, cols),
    action: c.kind === 'digital' ? c.action : undefined,
    kind: c.kind,
    hint: c.hint,
  }))
}

/**
 * Two control rails with a clear central approach corridor.
 *
 * A 2-row grid looks tidy but is unusable with an intent engine: reaching a top-row zone
 * means passing through a bottom-row zone first, which is (correctly) treated as transit.
 * Two columns leave a corridor the hand can travel along, then move sideways into any row.
 */
export function railZones(controls: ModeControl[]): Zone[] {
  const rows = Math.ceil(controls.length / 2)
  const left = controls.slice(0, rows)
  const right = controls.slice(rows)
  const top = AREA.y0
  const bottom = AREA.y1
  const gapY = 0.018
  const h = (bottom - top - (rows - 1) * gapY) / rows
  const leftW = 0.39
  const rightW = 0.39
  const leftX = 0.03
  const rightX = 0.58
  const make = (c: ModeControl, x0: number, row: number): Zone => ({
    id: c.id,
    label: c.label,
    device: c.device,
    x0,
    y0: +(top + row * (h + gapY)).toFixed(4),
    x1: +(x0 + leftW).toFixed(4),
    y1: +(top + row * (h + gapY) + h).toFixed(4),
    action: c.kind === 'digital' ? c.action : undefined,
    kind: c.kind,
    hint: c.hint,
  })
  const out: Zone[] = []
  left.forEach((c, i) => out.push(make(c, leftX, i)))
  right.forEach((c, i) => {
    const z = make(c, rightX, i)
    out.push({ ...z, x1: +(rightX + rightW).toFixed(4) })
  })
  return out
}
