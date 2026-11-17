import { create } from 'zustand'
import { defaultSettings } from './core/config'
import type { AnalyticsSummary, AppSettings, CameraState, DeviceTwin, IntentSnapshot, LogEntry, VisionFrame, Zone } from './core/types'
import { initialModeStates } from './modes/registry'
import type { ModeId, ModeState } from './modes/types'

export type Page = 'modes' | 'workspace' | 'live' | 'twin' | 'analytics' | 'settings'
export type PointerGesture = 'open_palm' | 'pinch' | 'fist' | 'point'

export function idleSnapshot(): IntentSnapshot {
  return {
    state: 'IDLE', intent: 'NONE', active: false, target: null, target_label: null, action: null, confidence: 0, final_confidence: 0,
    components: {}, accepted: false, reason: 'Start the camera, then show a still open palm to activate interaction mode', reason_code: 'IDLE',
    confirmation_required: false, hovered_zone: null, in_cooldown: false, cooldown_remaining: 0,
    progress: { activation: 0, dwell: 0, dwell_s: 0, confirmation_remaining_s: 0, confirmation_timeout_s: 6 }, tracking_quality: 0, timestamp: 0,
  }
}

export interface ConduitState {
  page: Page
  /** Active operational environment. `null` until the operator enters a mode. */
  activeMode: ModeId | null
  /** Per-mode dashboard/workflow state, preserved when switching environments. */
  modeState: Record<ModeId, ModeState>
  runtimeKind: 'probing' | 'backend' | 'browser'
  backendUrl: string
  link: 'connecting' | 'open' | 'closed'
  inputSource: 'camera' | 'pointer'
  stream: MediaStream | null
  camera: CameraState
  cameras: { id: string; label: string }[]
  frame: VisionFrame | null
  trail: number[][]
  traj: { speed: number; stability: number; consistency: number }
  intent: IntentSnapshot
  interactionMode: 'conduit' | 'baseline'
  hardwareMode: 'simulation' | 'hardware'
  hardwareInfo: { host: string; port: number; timeout_s: number }
  devices: Record<string, DeviceTwin>
  zones: Zone[]
  log: LogEntry[]
  settings: AppSettings
  analytics: AnalyticsSummary | null
  pointer: { gesture: PointerGesture; visible: boolean }
  notice: string | null
}

export const useConduit = create<ConduitState>(() => ({
  page: 'modes',
  activeMode: null,
  modeState: initialModeStates(),
  runtimeKind: 'probing',
  backendUrl: '',
  link: 'connecting',
  inputSource: 'camera',
  stream: null,
  camera: { state: 'stopped', active: false, fps: 0, error: null, available: null, camera_index: 0 },
  cameras: [],
  frame: null,
  trail: [],
  traj: { speed: 0, stability: 0, consistency: 1 },
  intent: idleSnapshot(),
  interactionMode: 'conduit',
  hardwareMode: 'simulation',
  hardwareInfo: { host: '', port: 80, timeout_s: 2 },
  devices: {},
  zones: defaultSettings().intent.zones,
  log: [],
  settings: defaultSettings(),
  analytics: null,
  pointer: { gesture: 'open_palm', visible: false },
  notice: null,
}))

let logId = 0
export function pushLog(e: Omit<LogEntry, 'id' | 'at'>) {
  const entry: LogEntry = { ...e, id: ++logId, at: Date.now() }
  useConduit.setState((s) => ({ log: [entry, ...s.log].slice(0, 200) }))
}
