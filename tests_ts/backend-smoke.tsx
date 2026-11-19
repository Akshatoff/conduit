// Frontend <-> FastAPI integration smoke test (needs the backend running on :8000; see README "Testing").
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import { enterModeLocal } from '../src/modes/actions'
import { HOSPITAL_MODE } from '../src/modes/hospital/config'
import { SEMICONDUCTOR_MODE } from '../src/modes/semiconductor/config'
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

async function main() {
  const root = createRoot(document.getElementById('root')!)
  await act(async () => root.render(<App />))
  await act(async () => sleep(1500))
  check('backend detected', S().runtimeKind === 'backend', S().runtimeKind)
  check('websocket open + snapshot loaded', S().link === 'open' && Object.keys(S().devices).length === 2, `${S().link} ${Object.keys(S().devices)}`)
  check('zones + settings loaded from backend', S().zones.length >= 2 && S().settings.intent.min_confidence > 0)

  await act(async () => { await rt().testDevice('lighting', 'ON'); await sleep(500) })
  check('manual test: twin updated via WebSocket after ack + read-back', S().devices.lighting.confirmed_state === 'ON' && S().devices.lighting.last_command?.source === 'manual_test' && S().devices.lighting.simulated === true, JSON.stringify(S().devices.lighting))
  check('command lifecycle logged', S().log.some((l) => l.code === 'SENT') && S().log.some((l) => l.code === 'ACK') && S().log.some((l) => l.code === 'CONFIRMED'), JSON.stringify(S().log.map((l) => l.code)))

  await act(async () => { await rt().simulateFault(true); await sleep(300) })
  check('link failure shown in twin', S().devices.access.connection === 'disconnected' && S().devices.access.confirmed_state === 'UNKNOWN')
  await act(async () => { await rt().testDevice('access', 'UNLOCK'); await sleep(500) })
  check('command during failure -> DISCONNECTED, no ack', S().devices.access.last_ack === null && S().log.some((l) => l.code === 'DISCONNECTED'))
  await act(async () => { await rt().simulateFault(false); await sleep(300) })
  check('link restored', S().devices.access.connection === 'simulated')

  await act(async () => { await rt().startVision(); await sleep(1500) })
  check('camera stack failure surfaces as error state (no crash)', S().camera.state === 'error' && !!S().camera.error, JSON.stringify(S().camera))
  check('system error logged', S().log.some((l) => l.channel === 'system' && l.level === 'error'))

  await act(async () => { await rt().startSession('conduit', 'int'); await rt().startTrial('unintended', null, 'wave'); await rt().endTrial(); await rt().stopSession(); await sleep(300) })
  const a = S().analytics!
  check('analytics from backend DB', a.has_data && a.by_mode.conduit.attempts >= 1 && a.sessions.length >= 1, JSON.stringify(a.by_mode.conduit))
  check('csv export from backend', (await rt().exportCsv()).includes('wave'))

  // ---- operational environment over REST: zones + workspace persist on the backend
  await act(async () => { enterModeLocal('semiconductor'); await rt().setWorkspaceMode('semiconductor', SEMICONDUCTOR_MODE.zones); await sleep(500) })
  const remote = await fetch(`${S().backendUrl}/api/system/status`).then((r) => r.json())
  check('environment zones + workspace stored on backend', remote.workspace_mode === 'semiconductor' && remote.zones.length === SEMICONDUCTOR_MODE.zones.length && S().activeMode === 'semiconductor', `${remote.workspace_mode} zones=${remote.zones.length}`)
  await act(async () => { enterModeLocal('hospital'); await rt().setWorkspaceMode('hospital', HOSPITAL_MODE.zones); await sleep(400) })
  const restored = await fetch(`${S().backendUrl}/api/system/status`).then((r) => r.json())
  check('environment switch restores the hospital surface', restored.workspace_mode === 'hospital' && restored.zones.length === 8 && restored.camera.state === S().camera.state)

  await act(async () => { await rt().activate(); await sleep(300) })
  check('activate over WebSocket -> intent state', S().log.some((l) => l.title === 'Interaction activated'))

  await act(async () => { await rt().setHardwareMode('hardware'); await sleep(300) })
  check('hardware mode without a serial port: disconnected/UNKNOWN', S().hardwareMode === 'hardware' && S().devices.access.connection === 'disconnected' && S().devices.access.confirmed_state === 'UNKNOWN')
  await act(async () => { await rt().setHardwareMode('simulation'); await sleep(300) })
  check('back to simulation', S().hardwareMode === 'simulation')

  console.log(failed ? `\n${failed} backend integration check(s) FAILED` : '\nAll backend integration checks passed')
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
