// UI + browser-runtime smoke test (run in jsdom, see README "Testing"). Drives the pointer simulator in
// real time through: activate -> deliberate select -> pinch confirm -> ack -> confirmed twin -> analytics.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import { rt } from '../src/runtime'
import { useConduit } from '../src/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`)
  if (!ok) failed++
}
const S = () => useConduit.getState()

async function hold(x: number, y: number, secs: number, pinch = false) {
  rt().setPointerPinch(pinch)
  const end = Date.now() + secs * 1000
  while (Date.now() < end) {
    rt().setPointer(x, y, true)
    await sleep(16)
  }
}
async function move(a: [number, number], b: [number, number], secs: number) {
  const start = Date.now()
  while (Date.now() - start < secs * 1000) {
    const k = (Date.now() - start) / (secs * 1000)
    rt().setPointer(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, true)
    await sleep(16)
  }
}

async function main() {
  const root = createRoot(document.getElementById('root')!)
  await act(async () => root.render(<App />))
  await act(async () => sleep(800))
  check('browser runtime selected when backend absent', S().runtimeKind === 'browser')
  const text = () => document.body.textContent ?? ''
  check('Live Interaction renders', /Intent Engine/.test(text()) && /CONDUIT/.test(text()))

  for (const [page, needle] of [['twin', 'Confirmed state'], ['analytics', 'No test results yet'], ['settings', 'Intent thresholds'], ['live', 'What the system believes']] as const) {
    await act(async () => { useConduit.setState({ page }); await sleep(150) })
    check(`page "${page}" renders`, text().includes(needle), text().slice(0, 200))
  }
  check('analytics shows empty state (no fabricated data)', S().analytics?.has_data === false)
  check('devices start in safe simulated state', S().devices.lighting?.confirmed_state === 'OFF' && S().devices.access?.confirmed_state === 'LOCKED' && S().devices.lighting?.simulated === true)

  // ---- drive the pipeline with the pointer simulator
  await act(async () => { useConduit.setState({ inputSource: 'pointer' }); await rt().startVision() })
  check('simulator running', S().camera.state === 'running')
  await hold(0.5, 0.82, 1.2)
  check('open palm activates interaction', S().intent.active, S().intent.reason)
  await move([0.5, 0.82], [0.5, 0.33], 0.7)
  await hold(0.5, 0.33, 1.3)
  check('deliberate approach -> AWAITING_CONFIRMATION', S().intent.state === 'AWAITING_CONFIRMATION', `${S().intent.state}: ${S().intent.reason}`)
  check('twin NOT updated by selection alone', S().devices.ventilation.confirmed_state === 'OFF')
  await hold(0.5, 0.33, 0.6, true)
  await sleep(500)
  check('ventilation confirmed ON only after ack + read-back', S().devices.ventilation.confirmed_state === 'ON', JSON.stringify(S().devices.ventilation))
  check('twin records ack + command', S().devices.ventilation.last_ack?.status === 'ACKNOWLEDGED' && S().devices.ventilation.last_command?.status === 'CONFIRMED')
  check('event log has intent + command entries with reasons', S().log.some((l) => l.channel === 'command' && l.code === 'CONFIRMED') && S().log.some((l) => l.channel === 'intent' && l.reason !== undefined || l.detail.length > 0))

  // ---- accidental swipe through zones must not execute anything
  await rt().setPointerPinch(false)
  await hold(0.5, 0.85, 3.2) // leave zone, wait out cooldown / result hold
  const before = S().devices.lighting.confirmed_state + S().devices.access.confirmed_state
  await move([0.02, 0.3], [0.98, 0.3], 0.5)
  await hold(0.98, 0.3, 0.3)
  check('swipe across zones executes nothing', S().devices.lighting.confirmed_state + S().devices.access.confirmed_state === before)
  check('rejection logged with reason', S().log.some((l) => l.code === 'TRANSIT'))

  // ---- analytics session
  await act(async () => { await rt().startSession('conduit', 'smoke') })
  await act(async () => { await rt().startTrial('unintended', null, 'swipe') })
  await hold(0.5, 0.85, 1.0)
  await move([0.02, 0.3], [0.98, 0.3], 0.5)
  await hold(0.98, 0.3, 0.3)
  await act(async () => { await rt().endTrial() })
  await act(async () => { await rt().stopSession() })
  const m = S().analytics!.by_mode.conduit
  check('analytics reflect the recorded trial', S().analytics!.has_data && m.attempts === 1 && m.unintended_trials === 1 && m.false_activation_rate === 0 && m.accidental_rejection_rate === 1, JSON.stringify(m))
  check('intent latency measured', (m.avg_intent_latency_ms ?? -1) >= 0)
  const csv = await rt().exportCsv()
  check('CSV export has header + 1 trial', csv.trim().split('\n').length === 2 && csv.startsWith('session_id,mode'))

  // ---- baseline comparison + simulated link failure
  await act(async () => { await rt().simulateFault(true) })
  check('simulated link failure -> UNKNOWN + disconnected', S().devices.lighting.connection === 'disconnected' && S().devices.lighting.confirmed_state === 'UNKNOWN')
  await act(async () => { await rt().simulateFault(false) })
  check('link restored -> safe states read back', S().devices.lighting.connection === 'simulated' && S().devices.lighting.confirmed_state === 'OFF')
  await act(async () => { await rt().setHardwareMode('hardware') })
  await act(async () => { await rt().testDevice('lighting', 'ON') })
  check('hardware mode w/o ESP32 never fakes an ack', S().devices.lighting.confirmed_state === 'UNKNOWN' && S().devices.lighting.last_ack === null, JSON.stringify(S().devices.lighting))
  await act(async () => { await rt().stopVision() })
  console.log(failed ? `\n${failed} UI smoke check(s) FAILED` : '\nAll UI smoke checks passed')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
