// Mode A — conventional gesture control (experimental baseline). Gesture detected -> command issued.
// No activation, no trajectory analysis, no dwell, no confirmation. Commands carry source
// "baseline_gesture" and are never routed to physical hardware.
import { toggleAction } from './config'
import type { CommandRequest, InteractionInput } from './types'

export const BASELINE_MAPPING: Record<string, string> = { open_palm: 'torch', fist: 'vibration' }

export class BaselineController {
  private prev = 'none'
  private lastFire = -1e9
  constructor(
    private deviceStates: () => Record<string, string>,
    private mapping: Record<string, string> = BASELINE_MAPPING,
    private minIntervalS = 1.0,
  ) {}

  reset() {
    this.prev = 'none'
    this.lastFire = -1e9
  }

  update(inp: InteractionInput): CommandRequest[] {
    const g = inp.hand_detected ? inp.gesture : 'none'
    const out: CommandRequest[] = []
    if (g !== this.prev && this.mapping[g] && inp.timestamp - this.lastFire >= this.minIntervalS) {
      const device = this.mapping[g]
      out.push({
        command_id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
        device,
        action: toggleAction(device, this.deviceStates()[device]),
        confidence: 1,
        timestamp: inp.timestamp,
        source: 'baseline_gesture',
      })
      this.lastFire = inp.timestamp
    }
    this.prev = g
    return out
  }
}
