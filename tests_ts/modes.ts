// Mode-layer checks: registry integrity + proof that ONE Intent Engine drives every environment.
// Run: npx esbuild tests_ts/modes.ts --bundle --platform=node --outfile=.modes.cjs && node .modes.cjs
import { defaultIntentConfig } from '../src/core/config'
import { IntentEngine } from '../src/core/intentEngine'
import { extractFeatures, makeHand } from '../src/core/landmarks'
import type { CommandRequest, IntentConfig, IntentEvent } from '../src/core/types'
import { MODES, MODE_REDUCERS, getMode } from '../src/modes/registry'
import { initialModeState, withHistory } from '../src/modes/state'
import { computeMetrics, type Trial } from '../src/core/analytics'

let failed = 0
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`)
  if (!cond) failed++
}

// ------------------------------------------------------------------ registry
check('five operational environments', MODES.length === 5)
check('mode ids are unique', new Set(MODES.map((m) => m.id)).size === MODES.length)
check('every mode has a distinct workflow', new Set(MODES.map((m) => m.workflow.id)).size === MODES.length)
check('every mode has a distinct dashboard renderer', new Set(MODES.map((m) => m.dashboard)).size === MODES.length)
check('every mode has a distinct demo script', new Set(MODES.map((m) => m.demo.title)).size === MODES.length)

for (const m of MODES) {
  const prefix = m.id
  check(`${prefix}: has a real-world problem and safety scope`, m.problem.length > 40 && m.safety.length >= 3)
  check(`${prefix}: at least five controls`, m.controls.length >= 5)
  check(`${prefix}: has digital controls`, m.controls.some((c) => c.kind === 'digital'))
  check(`${prefix}: has a demo workflow with steps`, m.demo.steps.length >= 4 && m.workflow.steps.length >= 4)
  check(`${prefix}: zones match controls`, m.zones.length === m.controls.length && m.controls.every((c, i) => m.zones[i].id === c.id && m.zones[i].device === c.device))
  check(`${prefix}: zones inside the interaction surface`, m.zones.every((z) => z.x0 >= 0 && z.y0 >= 0 && z.x1 <= 1 && z.y1 <= 0.8 && z.x1 > z.x0 && z.y1 > z.y0))
  const overlap = m.zones.some((a, i) => m.zones.some((b, j) => i < j && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1))
  check(`${prefix}: zones do not overlap`, !overlap)
  const digital = m.controls.filter((c) => c.kind === 'digital')
  check(`${prefix}: digital controls declare unique actions`, digital.every((c) => !!c.action) && new Set(digital.map((c) => c.action)).size === digital.length)
  check(`${prefix}: all devices are unique`, new Set(m.controls.map((c) => c.device)).size === m.controls.length)
  check(`${prefix}: workflow/demo references resolve`, [...m.workflow.steps, ...m.demo.steps].every((s) => !('controlId' in s) || !s.controlId || m.controls.some((c) => c.id === s.controlId)))
  check(`${prefix}: twin mapping exists`, m.twin.length >= 2 && m.twin.some((t) => t.source === 'physical'))
  check(`${prefix}: has a reducer`, typeof MODE_REDUCERS[m.id] === 'function')
}

check('getMode resolves by id and rejects unknown ids', getMode('hospital')?.id === 'hospital' && getMode('nope') === null)
check('mode states are independent', (() => {
  const a = initialModeState(MODES[0])
  const b = initialModeState(MODES[1])
  return a !== b && a.timer !== b.timer && a.history.length === 0 && b.history.length === 0
})())

// --------------------------------------------------------- reducers & history
for (const m of MODES) {
  const state = initialModeState(m)
  const digital = m.controls.find((c) => c.kind === 'digital')!
  const reduction = MODE_REDUCERS[m.id](state, digital)
  check(`${m.id}: authorised digital action has a defined effect`, reduction.status === 'confirmed' && reduction.summary.length > 8)
  const withEntry = withHistory(reduction.state, m, {
    controlId: digital.id, device: digital.device, action: digital.action ?? '', label: digital.label,
    summary: reduction.summary, status: reduction.status, source: 'intent', kind: 'digital',
  })
  check(`${m.id}: action recorded in mode history`, withEntry.history.length === 1 && withEntry.history[0].source === 'intent')
  const reset = initialModeState(m)
  check(`${m.id}: reset clears history and timers`, reset.history.length === 0 && !reset.timer.running && reset.checklistIndex === 0)
}

// --------------------------------------------- same engine, every environment
class Driver {
  t = 100
  i = 0
  events: IntentEvent[] = []
  commands: CommandRequest[] = []
  states: Record<string, string> = {}
  engine: IntentEngine
  constructor(cfg: IntentConfig) {
    this.engine = new IntentEngine(cfg, () => this.states)
  }
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
  codes = () => this.events.map((e) => e.reason_code)
}

for (const mode of MODES) {
  const cfg = { ...defaultIntentConfig(), zones: mode.zones }
  const targetZone = mode.zones[0]
  const cx = (targetZone.x0 + targetZone.x1) / 2
  const cy = (targetZone.y0 + targetZone.y1) / 2

  const d = new Driver(cfg)
  d.hold('open_palm', 0.5, 0.82, 1.1)
  if (!d.engine.active) {
    check(`${mode.id}: open palm activates shared engine`, false, d.engine.reason)
    continue
  }
  // travel up the central corridor, then sideways into the control
  d.move('open_palm', [0.5, 0.82], [0.5, cy], 0.6)
  d.move('open_palm', [0.5, cy], [cx, cy], 0.5)
  d.hold('open_palm', cx, cy, 1.2)
  const awaiting = d.engine.state === 'AWAITING_CONFIRMATION'
  d.hold('pinch', cx, cy, 0.5)
  const control = mode.controls[0]
  const only = d.commands.length === 1 ? d.commands[0] : null
  const expectedAction = control.kind === 'digital' ? control.action : 'ON'
  check(
    `${mode.id}: deliberate selection → pinch dispatches one authorised command`,
    awaiting && !!only && only.device === targetZone.device && only.action === expectedAction,
    `${d.engine.state} · ${JSON.stringify(d.commands)} · ${d.engine.reason}`,
  )
  check(`${mode.id}: command came from the shared intent source`, !!only && only.source === 'conduit_intent_engine')

  const acc = new Driver(cfg)
  acc.hold('open_palm', 0.5, 0.82, 1.1)
  acc.move('open_palm', [0.02, 0.3], [0.98, 0.3], 0.5)
  acc.hold('open_palm', 0.98, 0.3, 0.3)
  check(`${mode.id}: accidental sweep rejected, nothing executed`, acc.commands.length === 0 && acc.codes().includes('TRANSIT'), JSON.stringify(acc.codes().slice(-5)))
}

// ------------------------------------------------- analytics stay trial-derived
const trial = (over: Partial<Trial>): Trial => ({
  id: 1, session_id: 1, label: 'intended', target: 'lighting', scenario: '', started_at: 100, ended_at: null,
  executed: false, workspace: 'hospital', executed_device: null, executed_action: null, correct: false,
  ack_confirmed: false, commands_sent: 0, commands_acked: 0, confirmation_requested: false, rejections: 0,
  reasons: [], intent_latency_sum_ms: 0, intent_latency_n: 0, e2e_latency_ms: null, ...over,
})
const empty = computeMetrics([])
check('empty analytics never invent rates', empty.attempts === 0 && empty.confirmation_success_rate === null && empty.avg_task_duration_s === null)
const measured = computeMetrics([
  trial({ executed: true, correct: true, ack_confirmed: true, confirmation_requested: true, started_at: 100, ended_at: 106, commands_sent: 1, commands_acked: 1 }),
  trial({ confirmation_requested: true, started_at: 200, ended_at: 202 }),
])
check('confirmation success rate is measured, not assumed', measured.confirmation_success_rate === 0.5)
check('task duration is measured from trial timings', measured.avg_task_duration_s === 4)

const semi = getMode('semiconductor')!
const semiState = { ...initialModeState(semi), stageIndex: 3 }
check('semiconductor workflow follows the process stage cursor', semi.workflow.progress?.(semiState) === 3)

console.log(failed ? `\n${failed} mode check(s) FAILED` : '\nAll mode checks passed')
process.exit(failed ? 1 : 0)
