// UI + browser-runtime smoke test (run in jsdom, see README "Testing"). Drives the pointer simulator in
// real time through: activate -> deliberate select -> pinch confirm -> ack -> confirmed twin -> analytics.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import { rt } from '../src/runtime'
import { useConduit } from '../src/store'
import { enterModeLocal } from '../src/modes/actions'
import { getMode } from '../src/modes/registry'
import type { ModeId } from '../src/modes/types'

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
  check('environment selection renders first', S().page === 'modes' && /Choose your environment/.test(text()) && /Hospital/.test(text()) && /Semiconductor/.test(text()))
  check('all five environments are offered', (text().match(/Enter mode/g) ?? []).length === 5)

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
  // neutral (non-activation) pose outside the zones: wait out the result hold without deactivating
  useConduit.setState({ pointer: { ...S().pointer, gesture: 'point' } })
  await hold(0.5, 0.85, 2.6)
  const before = S().devices.lighting.confirmed_state + S().devices.access.confirmed_state
  await move([0.02, 0.3], [0.98, 0.3], 0.5)
  await hold(0.98, 0.3, 0.3)
  useConduit.setState({ pointer: { ...S().pointer, gesture: 'open_palm' } })
  check('swipe across zones executes nothing', S().devices.lighting.confirmed_state + S().devices.access.confirmed_state === before)
  check('rejection logged with reason', S().log.some((l) => l.code === 'TRANSIT'))

  // ---- analytics session
  await act(async () => { await rt().startSession('conduit', 'smoke') })
  await act(async () => { await rt().startTrial('unintended', null, 'swipe') })
  useConduit.setState({ pointer: { ...S().pointer, gesture: 'point' } })
  await hold(0.5, 0.85, 1.0)
  await move([0.02, 0.3], [0.98, 0.3], 0.5)
  await hold(0.98, 0.3, 0.3)
  useConduit.setState({ pointer: { ...S().pointer, gesture: 'open_palm' } })
  await act(async () => { await rt().endTrial() })
  await act(async () => { await rt().stopSession() })
  const m = S().analytics!.by_mode.conduit
  check('analytics reflect the recorded trial', S().analytics!.has_data && m.attempts === 1 && m.unintended_trials === 1 && m.false_activation_rate === 0 && m.accidental_rejection_rate === 1, JSON.stringify(m))
  check('intent latency measured', (m.avg_intent_latency_ms ?? -1) >= 0)
  const csv = await rt().exportCsv()
  check('CSV export has header + 1 trial', csv.trim().split('\n').length === 2 && csv.startsWith('session_id,mode'))

  // ---- multi-mode: enter hospital via the environment screen, then drive a digital control
  await act(async () => { useConduit.setState({ page: 'modes' }); await sleep(150) })
  const enterBtn = Array.from(document.querySelectorAll('button')).find((b) => /Enter mode/.test(b.textContent ?? ''))
  check('environment card has an Enter mode action', !!enterBtn)
  await act(async () => { enterBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(250) })
  check('entering hospital loads its controls + zones', S().activeMode === 'hospital' && S().zones.length === 8, `${S().activeMode} zones=${S().zones.length}`)
  check('camera pipeline was not reset by entering a mode', S().camera.state === 'running')
  check('mode workspace keeps the large camera stage', document.querySelector('[data-camera-fill="true"]') !== null)
  check('mode workspace is decluttered by default', !/Why this environment/.test(text()) && !/Analytics categories/.test(text()) && !/Demonstration script/.test(text()))
  const dashboardBtn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === 'Dashboard')
  check('mode workspace offers a collapsed dashboard', !!dashboardBtn)
  await act(async () => { dashboardBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(200) })
  check('hospital dashboard opens on demand with its fictional-data banner', /FICTIONAL DEMONSTRATION DATA/.test(text()) && /Patient information/.test(text()))
  const timerZone = S().zones.find((z) => z.id === 'hospital.timer')!
  const timerX = (timerZone.x0 + timerZone.x1) / 2
  const timerY = (timerZone.y0 + timerZone.y1) / 2
  await rt().setPointerPinch(false)
  await hold(0.5, 0.82, 1.2)
  await move([0.5, 0.82], [0.5, timerY], 0.6)
  await move([0.5, timerY], [timerX, timerY], 0.5)
  await hold(timerX, timerY, 1.3)
  check('hospital digital control reaches AWAITING_CONFIRMATION', S().intent.state === 'AWAITING_CONFIRMATION', `${S().intent.state}: ${S().intent.reason}`)
  await hold(timerX, timerY, 0.6, true)
  await sleep(500)
  check('digital action confirmed in the mode layer (timer runs)', S().modeState.hospital.timer.running && S().modeState.hospital.history.some((h) => h.source === 'intent' && h.status === 'confirmed'), JSON.stringify(S().modeState.hospital.history.slice(0, 1)))
  check('digital action never changes the physical twin', S().devices.lighting.last_command === null || S().devices.lighting.last_command?.source !== 'conduit_intent_engine' || S().devices.lighting.confirmed_state === 'OFF')
  await act(async () => { useConduit.setState({ page: 'workspace' }); await sleep(200) })
  check('workspace dashboard still renders after the gesture', /Patient information/.test(text()) && /Task checklist/.test(text()))

  // ---- every environment dashboard renders from its own config
  for (const [id, needle] of [
    ['semiconductor', 'Simulated cleanroom workstation'],
    ['industrial', 'Demo circulation pump'],
    ['food_processing', 'Ingredient quantities'],
    ['accessibility', 'Adaptive interaction surface'],
  ] as [ModeId, string][]) {
    await act(async () => {
      enterModeLocal(id)
      await rt().setWorkspaceMode(id, getMode(id)!.zones)
      await sleep(200)
    })
    check(`${id} workspace renders its dashboard`, text().includes(needle) && S().activeMode === id && S().zones.length === getMode(id)!.zones.length, text().slice(0, 160))
  }
  check('mode switching kept one camera pipeline alive', S().camera.state === 'running')

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
