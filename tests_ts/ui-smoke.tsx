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
import type { SecondHand, VisionFrame } from '../src/core/types'

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
  const liveText = () => document.querySelector('[data-signature-live]')?.textContent ?? ''
  check('environment selection renders first', S().page === 'modes' && /Choose your environment/.test(text()) && /Hospital/.test(text()) && /Semiconductor/.test(text()))
  check('all five environments are offered', (text().match(/Enter mode/g) ?? []).length === 5)

  for (const [page, needle] of [['twin', 'Confirmed state'], ['hardware', 'Bench rules'], ['analytics', 'No test results yet'], ['settings', 'Intent thresholds'], ['live', 'What the system believes']] as const) {
    await act(async () => { useConduit.setState({ page }); await sleep(150) })
    check(`page "${page}" renders`, text().includes(needle), text().slice(0, 200))
  }
  await act(async () => { useConduit.setState({ page: 'hardware' }); await sleep(150) })
  check('hardware bench exposes exactly the LED and the servo', /LED · D3/.test(text()) && /Servo · D9/.test(text()) && !/Ventilation/.test(text()), text().slice(0, 300))
  check('hardware bench has one control per output action', (text().match(/LED ON/g) ?? []).length === 1 && (text().match(/Rotate to 90/g) ?? []).length === 1)
  const benchBtn = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label)
  await act(async () => { benchBtn('LED ON')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(600) })
  check('bench LED ON confirmed via manual_test + read-back', S().devices.lighting.confirmed_state === 'ON' && S().devices.lighting.last_command?.source === 'manual_test', JSON.stringify(S().devices.lighting))
  await act(async () => { benchBtn('LED OFF')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(600) })
  check('bench LED OFF confirmed', S().devices.lighting.confirmed_state === 'OFF')
  await act(async () => { benchBtn('Rotate to 90°')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(600) })
  check('bench servo rotates to 90° (UNLOCKED)', S().devices.access.confirmed_state === 'UNLOCKED' && S().devices.access.last_ack?.status === 'ACKNOWLEDGED', JSON.stringify(S().devices.access))
  await act(async () => { benchBtn('Rotate to 0°')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(600) })
  check('bench servo returns to 0° (LOCKED)', S().devices.access.confirmed_state === 'LOCKED')
  await act(async () => { useConduit.setState({ page: 'settings' }); await sleep(150) })
  check('settings owns the object-camera index selector', !!document.querySelector('select[aria-label="Object camera index"]'))
  check('analytics shows empty state (no fabricated data)', S().analytics?.has_data === false)
  check('devices start in safe simulated state', S().devices.lighting?.confirmed_state === 'OFF' && S().devices.access?.confirmed_state === 'LOCKED' && S().devices.lighting?.simulated === true)

  // ---- drive the pipeline with the pointer simulator
  await act(async () => { useConduit.setState({ inputSource: 'pointer' }); await rt().startVision() })
  check('simulator running', S().camera.state === 'running')
  await hold(0.5, 0.82, 1.2)
  check('open palm activates interaction', S().intent.active, S().intent.reason)
  await move([0.5, 0.82], [0.25, 0.33], 0.7)
  await hold(0.25, 0.33, 1.3)
  check('deliberate approach -> AWAITING_CONFIRMATION', S().intent.state === 'AWAITING_CONFIRMATION', `${S().intent.state}: ${S().intent.reason}`)
  check('twin NOT updated by selection alone', S().devices.lighting.confirmed_state === 'OFF')
  await hold(0.25, 0.33, 0.6, true)
  await sleep(500)
  check('LED confirmed ON only after ack + read-back', S().devices.lighting.confirmed_state === 'ON', JSON.stringify(S().devices.lighting))
  check('twin records ack + command', S().devices.lighting.last_ack?.status === 'ACKNOWLEDGED' && S().devices.lighting.last_command?.status === 'CONFIRMED')
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
  const physicalBefore = JSON.stringify({ lighting: S().devices.lighting.confirmed_state + S().devices.lighting.last_command?.command_id, access: S().devices.access.confirmed_state + S().devices.access.last_command?.command_id })
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
  check('digital action never changes the physical twin', JSON.stringify({ lighting: S().devices.lighting.confirmed_state + S().devices.lighting.last_command?.command_id, access: S().devices.access.confirmed_state + S().devices.access.last_command?.command_id }) === physicalBefore)
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
  check('hardware mode w/o serial port never fakes an ack', S().devices.lighting.confirmed_state === 'UNKNOWN' && S().devices.lighting.last_ack === null, JSON.stringify(S().devices.lighting))
  await act(async () => { await rt().stopVision() })

  // ---- per-mode signature gesture screens (view/navigation only; injected frames, no engine run)
  let ts = 1000
  const frameAt = (x: number, y: number, gesture = 'open_palm', orientation = 0, second: SecondHand | null = null): VisionFrame => ({
    timestamp: ts,
    hand_detected: true,
    handedness: 'Right',
    position: { x, y },
    gesture,
    pinch_distance: gesture === 'pinch' ? 0.04 : 0.7,
    velocity: 0.1,
    stability: 0.95,
    fps: 30,
    tracking_quality: 0.95,
    features: { orientation_deg: orientation },
    second_hand: second,
  })
  const secondAt = (x: number, y: number): SecondHand => ({
    hand_detected: true,
    handedness: 'Left',
    position: { x, y },
    gesture: 'open_palm',
    pinch_distance: 0.7,
    orientation_deg: 0,
    features: null,
  })
  const push = async (f: VisionFrame) => {
    ts += 0.05
    await act(async () => {
      useConduit.setState({ frame: { ...f, timestamp: ts } })
      await sleep(40)
    })
  }
  const neutral = async () => {
    await act(async () => {
      useConduit.setState({ intent: { ...S().intent, state: 'READY', active: true, target: null, target_label: null, action: null } })
      await sleep(60)
    })
  }
  const gotoMode = async (id: ModeId) => {
    await act(async () => {
      enterModeLocal(id)
      await rt().setWorkspaceMode(id, getMode(id)!.zones)
      useConduit.setState({ page: 'workspace' })
      await sleep(200)
    })
    await neutral()
  }
  const openSignature = async () => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (el) => /Signature screen/.test(el.textContent ?? '') && el.getAttribute('aria-pressed') !== 'true',
    )
    if (b) await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(200) })
    return !!b
  }
  const closeSignature = async () => {
    const b = document.querySelector('button[aria-label="Close signature screen"]')
    if (b) await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(150) })
  }

  await gotoMode('hospital')
  check('signature screen opens from the camera workspace', await openSignature())
  check('signature mode marks the camera view as transformed', S().signatureView.active === true, JSON.stringify(S().signatureView))
  await push(frameAt(0.5, 0.45))
  check('hospital signature view is visible', /Imaging · gesture view/.test(text()))
  const logBefore = S().log.length
  const devicesBefore = JSON.stringify(S().devices)
  for (let i = 0; i < 5; i++) await push(frameAt(0.5, 0.45, 'pinch'))
  check('pinch zooms the hospital image in', /PINCH · ZOOM IN/.test(text()), text().slice(0, 240))
  await push(frameAt(0.3, 0.45))
  for (let i = 1; i <= 6; i++) await push(frameAt(0.3 + i * 0.09, 0.45))
  check('horizontal swipe changes the hospital image', /image 2\/3/.test(text()), text().slice(0, 300))
  await push(frameAt(0.5, 0.45, 'point'))
  await push(frameAt(0.6, 0.52, 'point'))
  check('point-drag pans without issuing a command', /POINT-DRAG · PAN/.test(text()) && S().log.length === logBefore && JSON.stringify(S().devices) === devicesBefore)

  await gotoMode('semiconductor')
  await openSignature()
  check('signature view separates gesture camera from object camera', /CAM 1 · gesture/i.test(liveText()) && /CAM 2 · object/i.test(liveText()) && /Object camera/.test(liveText()), liveText().slice(0, 260))
  check('object camera index selection moved to Settings', /camera index in settings/i.test(liveText()) && !!document.querySelector('[data-signature-live]'), liveText().slice(0, 320))
  for (let i = 0; i < 5; i++) await push(frameAt(0.45, 0.45, 'pinch'))
  check('semiconductor pinch zooms the live camera', /PINCH · ZOOM IN/.test(liveText()) && /Only CAM 2 — the object camera — is zoomed and panned/.test(liveText()), liveText().slice(0, 300))
  const feed = document.querySelector('[data-signature-live] div[style*="scale("]') as HTMLElement | null
  const scale = Number(/(?:^|\s)scale\(([\d.]+)\)/.exec(feed?.style.transform ?? '')?.[1] ?? '1')
  check('camera video layer carries the gesture transform', !!feed && scale > 1, feed?.style.transform)
  await push(frameAt(0.3, 0.45, 'point'))
  await push(frameAt(0.42, 0.55, 'point'))
  check('semiconductor point-drag pans', /POINT-DRAG · PAN/.test(liveText()), liveText().slice(0, 240))

  await gotoMode('industrial')
  await openSignature()
  await push(frameAt(0.5, 0.5, 'fist', 0))
  await push(frameAt(0.5, 0.5, 'fist', 28))
  check('rotating a fist turns the live camera', /FIST ROTATE · LIVE CAMERA/.test(liveText()) && /CAM 2 · object/i.test(liveText()), liveText().slice(0, 320))
  await push(frameAt(0.3, 0.6))
  for (let i = 1; i <= 6; i++) await push(frameAt(0.3 + i * 0.09, 0.6))
  check('horizontal swipe pages the repair steps', /2\/5/.test(liveText()) && /SWIPE → NEXT STEP/.test(liveText()), liveText().slice(0, 320))
  await push(frameAt(0.5, 0.5, 'point'))
  await push(frameAt(0.62, 0.56, 'point'))
  check('point-drag pans the live camera', /POINT-DRAG · PAN/.test(liveText()), liveText().slice(0, 320))

  // Pose zoom: pinch in, release to open must NOT reverse, fist re-arms open-hand zoom-out.
  const liveScale = () =>
    Number(/(?:^|\s)scale\(([\d.]+)\)/.exec(
      (document.querySelector('[data-signature-live] div[style*="scale("]') as HTMLElement | null)?.style.transform ?? '',
    )?.[1] ?? '1')
  for (let i = 0; i < 8; i++) await push(frameAt(0.5, 0.45, 'pinch'))
  const zoomedIn = liveScale()
  check('pinch zooms the industrial camera in', /PINCH · ZOOM IN/.test(liveText()) && zoomedIn > 1.01, `${liveScale()} · ${liveText().slice(0, 220)}`)
  for (let i = 0; i < 6; i++) await push(frameAt(0.5, 0.45, 'open_palm'))
  const afterRelease = liveScale()
  check('releasing a pinch to an open hand does not undo the zoom', /FIST OR POINT · RE-ARM ZOOM OUT/.test(liveText()) && afterRelease <= zoomedIn + 0.005, `${zoomedIn} → ${afterRelease} · ${liveText().slice(0, 220)}`)
  for (let i = 0; i < 4; i++) await push(frameAt(0.5, 0.45, 'fist'))
  for (let i = 0; i < 8; i++) await push(frameAt(0.5, 0.45, 'open_palm'))
  const zoomedOut = liveScale()
  check('fist reset then open hand zooms the industrial camera out', /OPEN HAND · ZOOM OUT/.test(liveText()) && zoomedOut < afterRelease, `${afterRelease} → ${zoomedOut} · ${liveText().slice(0, 300)}`)
  await act(async () => {
    useConduit.setState({ intent: { ...S().intent, state: 'READY', active: true, target: 'T-01', target_label: 'test' } })
    await sleep(40)
  })
  for (let i = 0; i < 5; i++) await push(frameAt(0.5, 0.45, 'pinch'))
  check('workspace hover does not pause signature zoom', /PINCH · ZOOM IN/.test(liveText()), liveText().slice(0, 220))
  await neutral()

  await gotoMode('food_processing')
  await openSignature()
  await push(frameAt(0.7, 0.34))
  const angles = [30, 60, 90, 120]
  for (const a of angles) await push(frameAt(0.5 + 0.2 * Math.cos((a * Math.PI) / 180), 0.34 + 0.2 * Math.sin((a * Math.PI) / 180)))
  check('circular hand motion adjusts the food timer', /CLOCKWISE · ADD TIME/.test(text()) && !/TARGET 03:00/.test(text()), text().slice(0, 300))
  await push(frameAt(0.3, 0.8))
  for (let i = 1; i <= 6; i++) await push(frameAt(0.3 + i * 0.09, 0.8))
  check('lower-edge swipe pages preparation steps', /SWIPE → NEXT PREP STEP/.test(text()) && /2\/5 ·/.test(text()), text().slice(0, 300))
  await push(frameAt(0.5, 0.34, 'pinch'))
  check('pinch starts the simulated preparation timer', /PINCH · TIMER CONFIRMED/.test(text()) && /counting down/.test(text()), text().slice(0, 300))

  await gotoMode('accessibility')
  await openSignature()
  await push(frameAt(0.3, 0.35))
  check('accessibility signature screen magnifies the live camera', /CAM 2 · object/i.test(liveText()) && /live magnification/.test(liveText()), liveText().slice(0, 320))
  for (let i = 0; i < 5; i++) await push(frameAt(0.3, 0.35, 'pinch'))
  check('adaptive pinch magnify keeps large alternatives visible', /PINCH · MAGNIFY/.test(liveText()) && !!document.querySelector('[data-signature-live] button[aria-label="Zoom in"]') && !!document.querySelector('[data-signature-live] button[aria-label="Zoom out"]'), liveText().slice(0, 360))

  await closeSignature()
  check('signature screen closes without disturbing the workspace', !/Signature screen/.test(document.querySelector('button[aria-pressed="true"]')?.textContent ?? '') && !!document.querySelector('[data-camera-fill="true"]'))
  check('closing signature resets the live camera transform', S().signatureView.active === false && S().signatureView.zoom === 1 && !document.querySelector('[data-signature-live]'), JSON.stringify(S().signatureView))
  console.log(failed ? `\n${failed} UI smoke check(s) FAILED` : '\nAll UI smoke checks passed')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
