// Parity check: the TypeScript Intent Engine must make the same decisions as the Python one on the
// same synthetic scenarios.   Run:  npm run test:parity
import { defaultIntentConfig } from '../src/core/config'
import { IntentEngine } from '../src/core/intentEngine'
import { extractFeatures, makeHand } from '../src/core/landmarks'
import type { CommandRequest, IntentEvent } from '../src/core/types'

class Driver {
  t = 100
  i = 0
  events: IntentEvent[] = []
  commands: CommandRequest[] = []
  states: Record<string, string> = {}
  engine = new IntentEngine(defaultIntentConfig(), () => this.states)
  step(g: string, x: number, y: number, hand = true) {
    this.i++
    this.t += 1 / 30
    const inp = hand
      ? (() => {
          const f = extractFeatures(makeHand(g, x + 0.002 * Math.sin(this.i * 1.7), y + 0.002 * Math.cos(this.i * 2.3), 0.22), 'Right', 0.97, 1)
          return { timestamp: this.t, hand_detected: true, x: f.palm_center[0], y: f.palm_center[1], gesture: f.gesture, pinch_distance: f.pinch_distance, tracking_quality: f.tracking_confidence }
        })()
      : { timestamp: this.t, hand_detected: false, x: 0, y: 0, gesture: 'none', pinch_distance: 1, tracking_quality: 0 }
    const r = this.engine.update(inp)
    this.events.push(...r.events)
    for (const e of r.events) if (e.command) this.commands.push(e.command)
  }
  hold(g: string, x: number, y: number, s: number) {
    for (let k = 0; k < Math.floor(s * 30); k++) this.step(g, x, y)
  }
  move(g: string, a: [number, number], b: [number, number], s: number) {
    const n = Math.max(1, Math.floor(s * 30))
    for (let k = 1; k <= n; k++) this.step(g, a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n)
  }
  gone(s: number) {
    for (let k = 0; k < Math.floor(s * 30); k++) this.step('none', 0, 0, false)
  }
  codes = () => this.events.map((e) => e.reason_code)
}

let failed = 0
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`)
  if (!cond) failed++
}

const select = (d: Driver, x: number) => {
  d.hold('open_palm', 0.5, 0.82, 1.1)
  d.move('open_palm', [0.5, 0.82], [x, 0.33], 0.7)
  d.hold('open_palm', x, 0.33, 1.2)
}

{
  const d = new Driver()
  d.hold('open_palm', 0.5, 0.82, 1.1)
  check('open palm activates', d.engine.active)
}
{
  const d = new Driver()
  for (let k = 0; k < 3; k++) {
    d.move('open_palm', [0.1, 0.8], [0.9, 0.8], 0.5)
    d.move('open_palm', [0.9, 0.8], [0.1, 0.8], 0.5)
  }
  check('waving does not activate', !d.engine.active && d.commands.length === 0)
}
{
  const d = new Driver()
  select(d, 0.25)
  check('deliberate approach reaches AWAITING_CONFIRMATION', d.engine.state === 'AWAITING_CONFIRMATION', `${d.engine.state} ${d.engine.reason}`)
  check('selection alone never executes', d.commands.length === 0)
  d.hold('pinch', 0.25, 0.33, 0.5)
  check('pinch confirms -> EXECUTING with 1 command', d.engine.state === 'EXECUTING' && d.commands.length === 1 && d.commands[0].device === 'torch' && d.commands[0].action === 'ON')
  d.engine.notifyCommandResult(true, 'ok', d.t)
  check('result -> COMPLETED', d.engine.state === 'COMPLETED')
  d.hold('open_palm', 0.25, 0.33, 4)
  check('no repeated selection while hand stays in zone', d.commands.length === 1)
}
{
  const d = new Driver()
  d.hold('open_palm', 0.5, 0.82, 1.1)
  d.move('open_palm', [0.02, 0.32], [0.98, 0.32], 0.7)
  d.hold('open_palm', 0.98, 0.32, 0.3)
  check('swipe across zones is rejected as TRANSIT, nothing executed', d.commands.length === 0 && d.codes().includes('TRANSIT'))
}
{
  const d = new Driver()
  d.hold('open_palm', 0.5, 0.82, 1.1)
  d.hold('pinch', 0.5, 0.85, 0.8)
  check('stray pinch ignored + logged', d.commands.length === 0 && d.codes().includes('PINCH_NO_SELECTION'))
}
{
  const d = new Driver()
  d.hold('open_palm', 0.5, 0.82, 1.1)
  d.move('open_palm', [0.5, 0.85], [0.5, 0.2], 0.3)
  d.hold('pinch', 0.5, 0.2, 0.6)
  check('pinch held during entry cannot select+confirm in one gesture', d.commands.length === 0)
}
{
  const d = new Driver()
  select(d, 0.25)
  d.hold('fist', 0.25, 0.33, 0.6)
  d.hold('pinch', 0.25, 0.33, 0.5)
  check('closed fist cancels pending selection', d.codes().includes('CANCELLED_FIST') && d.commands.length === 0)
}
{
  const d = new Driver()
  select(d, 0.25)
  d.hold('open_palm', 0.25, 0.33, 6.5)
  check('confirmation timeout cancels', d.codes().includes('CONFIRM_TIMEOUT') && d.commands.length === 0)
}
{
  const d = new Driver()
  select(d, 0.25)
  d.engine.cfg.min_confidence = 0.999
  d.hold('pinch', 0.25, 0.33, 0.5)
  check('low confidence at confirmation is rejected', d.commands.length === 0 && d.codes().includes('LOW_CONFIDENCE'))
}
{
  const d = new Driver()
  d.hold('open_palm', 0.5, 0.82, 1.1)
  d.gone(3.5)
  check('no-hand timeout deactivates', !d.engine.active && d.codes().includes('NO_HAND_TIMEOUT'))
}
{
  const d = new Driver()
  d.hold('open_palm', 0.5, 0.82, 1.1)
  d.hold('fist', 0.5, 0.85, 1.2)
  check('sustained fist = emergency stop', !d.engine.active && d.codes().includes('EMERGENCY_STOP'))
}
{
  const d = new Driver()
  d.states = { torch: 'ON', screen: 'OFF' }
  select(d, 0.25)
  check('action is toggle of confirmed state (torch ON -> OFF)', d.engine.action === 'OFF')
}

console.log(failed ? `\n${failed} parity check(s) FAILED` : '\nAll parity checks passed')
process.exit(failed ? 1 : 0)
