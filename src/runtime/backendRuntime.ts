// Client for the Python/FastAPI backend: REST for control, WebSocket for structured real-time events.
// Camera capture, MediaPipe tracking, intent processing and device control all happen in Python.

import type { AnalyticsSummary, AppSettings, CameraState, DeviceTwin, IntentEvent, IntentSnapshot, VisionFrame, Zone } from '../core/types'
import { applyDigitalCommand, recordPhysicalOutcome } from '../modes/actions'
import { getMode } from '../modes/registry'
import type { ModeId } from '../modes/types'
import { idleSnapshot, pushLog, useConduit } from '../store'
import { logCommandEvent, logIntentEvent } from './logging'
import type { Runtime } from './types'

const set = useConduit.setState
const get = useConduit.getState

interface Envelope { type: string; timestamp: number; data: Record<string, unknown> }

export async function probeBackend(base: string, timeoutMs = 1500): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(`${base}/api/health`, { signal: ctl.signal })
    if (!r.ok) return false
    const j = await r.json()
    return j?.service === 'conduit-backend'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export class BackendRuntime implements Runtime {
  kind = 'backend' as const
  private ws: WebSocket | null = null
  private retry = 0
  private closed = false
  constructor(private base: string) {}

  // ---------------------------------------------------------------- http
  private async api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const r = await fetch(`${this.base}${path}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined })
    if (!r.ok) {
      let detail = r.statusText
      try {
        detail = (await r.json()).detail ?? detail
      } catch {
        /* ignore */
      }
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
    }
    return (r.headers.get('content-type')?.includes('json') ? r.json() : r.text()) as Promise<T>
  }
  private async safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (e) {
      set({ notice: e instanceof Error ? e.message : String(e) })
      return undefined
    }
  }

  streamUrl() {
    return `${this.base}/api/vision/stream`
  }

  // ----------------------------------------------------------------- init
  async init() {
    set({ link: 'connecting' })
    await this.loadSettings()
    await this.refreshAnalytics()
    this.connect()
    void this.loadCameras()
  }

  private async loadSettings() {
    const s = await this.safe(() => this.api<AppSettings>('/api/settings'))
    if (s) set({ settings: s, zones: s.intent.zones, interactionMode: s.interaction_mode, hardwareMode: s.hardware_mode, hardwareInfo: s.arduino })
  }

  private async loadCameras() {
    try {
      const r = await this.api<{ cameras: { index: number; label: string }[] }>('/api/vision/cameras')
      set({ cameras: r.cameras.map((c) => ({ id: String(c.index), label: c.label })) })
    } catch {
      /* optional */
    }
  }

  private connect() {
    if (this.closed) return
    const url = this.base.replace(/^http/, 'ws') + '/ws'
    const ws = new WebSocket(url)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      set({ link: 'open' })
    }
    ws.onmessage = (m) => {
      try {
        this.handle(JSON.parse(m.data) as Envelope)
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = () => {
      set({ link: 'closed' })
      if (this.closed) return
      this.retry = Math.min(this.retry + 1, 6)
      setTimeout(() => this.connect(), 500 * this.retry)
    }
    ws.onerror = () => ws.close()
  }

  private send(type: string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type }))
  }

  // -------------------------------------------------------------- events
  private handle(env: Envelope) {
    const d = env.data
    switch (env.type) {
      case 'snapshot': {
        const dev = d.devices as { mode: 'simulation' | 'hardware'; devices: DeviceTwin[]; hardware: { port: string; baud: number; timeout_s: number } }
        const workspace = typeof d.workspace_mode === 'string' ? d.workspace_mode : get().settings.workspace_mode
        set({
          camera: d.camera as CameraState,
          settings: { ...get().settings, workspace_mode: workspace },
          interactionMode: d.interaction_mode as 'conduit' | 'baseline',
          hardwareMode: dev.mode,
          hardwareInfo: dev.hardware,
          devices: Object.fromEntries(dev.devices.map((x) => [x.id, x])),
          zones: (d.zones as never) ?? get().zones,
          intent: (d.intent as IntentSnapshot | null) ?? get().intent,
        })
        break
      }
      case 'camera_status': {
        const cam = d as unknown as CameraState
        set({ camera: { ...get().camera, ...cam } })
        if (cam.state === 'error' || cam.state === 'disconnected') pushLog({ channel: 'system', level: 'error', title: `Camera ${cam.state}`, detail: cam.error ?? '' })
        if (cam.state === 'stopped' || cam.state === 'error' || cam.state === 'disconnected') set({ frame: null, trail: [], intent: idleSnapshot() })
        break
      }
      case 'hand_landmarks':
        set({ frame: d as unknown as VisionFrame })
        break
      case 'trajectory_update':
        set({
          trail: d.trail as number[][],
          traj: { speed: d.speed as number, stability: d.stability as number, consistency: d.consistency as number },
          intent: d.intent as IntentSnapshot,
          interactionMode: d.interaction_mode as 'conduit' | 'baseline',
        })
        break
      case 'intent_state_changed':
        logIntentEvent(d as unknown as IntentEvent)
        break
      case 'command_sent':
      case 'command_acknowledged':
      case 'command_rejected':
        logCommandEvent(env.type, d)
        break
      case 'device_state_changed': {
        logCommandEvent(env.type, d)
        if (!d.sandbox && typeof d.id === 'string') {
          const { reason, ...twin } = d
          set((s) => ({ devices: { ...s.devices, [d.id as string]: twin as unknown as DeviceTwin } }))
          const last = (twin as unknown as DeviceTwin).last_command
          if (typeof reason === 'string' && /confirmed/i.test(reason) && last?.source === 'conduit_intent_engine') {
            recordPhysicalOutcome(d.id, last.action, true, reason)
          }
        }
        break
      }
      case 'mode_action': {
        const device = String(d.device ?? '')
        const action = String(d.action ?? '')
        const valid = d.status === 'CONFIRMED'
        if (applyDigitalCommand(device, action, valid ? 'confirmed' : 'rejected')) {
          pushLog({ channel: 'command', level: valid ? 'ok' : 'warn', title: `Mode control ${valid ? 'executed' : 'rejected'}`, detail: String(d.detail ?? `${device} ${action}`), code: 'MODE_ACTION' })
        }
        break
      }
      case 'workspace_changed':
        void this.loadSettings()
        break
      case 'analytics_updated':
        void this.refreshAnalytics()
        break
      case 'settings_changed':
        void this.loadSettings()
        break
      case 'system_error':
        pushLog({ channel: 'system', level: 'error', title: `System error (${String(d.where ?? '')})`, detail: String(d.message ?? '') })
        break
      default:
        break
    }
  }

  // ------------------------------------------------------------ Runtime API
  async startVision() {
    const idx = get().settings.camera.index
    await this.safe(() => this.api('/api/vision/start', 'POST', { camera_index: idx }))
  }
  async stopVision() {
    await this.safe(() => this.api('/api/vision/stop', 'POST'))
  }
  setInputSource() {
    /* backend always uses the physical camera */
  }
  selectCamera(id: string) {
    const settings = { ...get().settings, camera: { ...get().settings.camera, index: Number(id) } }
    set({ settings })
    void this.safe(() => this.api('/api/settings', 'PUT', settings))
  }
  attachVideo() {}
  setPointer() {}
  setPointerPinch() {}
  async activate() {
    this.send('activate')
  }
  async deactivate() {
    this.send('deactivate')
  }
  async cancel() {
    this.send('cancel')
  }
  async setWorkspaceMode(mode: string, zones: Zone[]) {
    const settings: AppSettings = { ...get().settings, workspace_mode: mode, intent: { ...get().settings.intent, zones } }
    set({ activeMode: (getMode(mode)?.id ?? null) as ModeId | null, zones, settings })
    const r = await this.safe(() => this.api<AppSettings>('/api/settings', 'PUT', settings))
    if (r) set({ settings: r, zones: r.intent.zones })
  }

  async setInteractionMode(m: 'conduit' | 'baseline') {
    const r = await this.safe(() => this.api('/api/interaction/mode', 'POST', { mode: m }))
    if (r) set({ interactionMode: m })
  }
  async testDevice(id: string, action: string) {
    await this.safe(() => this.api(`/api/devices/${id}/test`, 'POST', { action }))
  }
  async setHardwareMode(m: 'simulation' | 'hardware') {
    await this.safe(() => this.api('/api/hardware/mode', 'POST', { mode: m }))
    await this.loadSettings()
  }
  async connectHardware() {
    const r = await this.safe(() => this.api<{ connected: boolean }>('/api/hardware/connect', 'POST'))
    if (r) set({ notice: r.connected ? 'Arduino reachable — device states read back.' : 'Arduino not reachable. In hardware mode no acknowledgement is ever simulated.' })
  }

  async listSerialPorts(): Promise<{ device: string; description: string }[]> {
    const r = await this.safe(() => this.api<{ ports: { device: string; description: string }[] }>('/api/hardware/ports'))
    return r?.ports ?? []
  }
  async simulateFault(offline: boolean) {
    await this.safe(() => this.api('/api/hardware/simulate_fault', 'POST', { offline }))
  }
  async applySettings(s: AppSettings) {
    const r = await this.safe(() => this.api<AppSettings>('/api/settings', 'PUT', s))
    if (r) set({ settings: r, zones: r.intent.zones, hardwareMode: r.hardware_mode, interactionMode: r.interaction_mode, hardwareInfo: r.arduino, notice: 'Settings saved.' })
  }
  async refreshAnalytics() {
    const s = await this.safe(() => this.api<AnalyticsSummary>('/api/analytics/summary'))
    if (s) set({ analytics: s })
  }
  async startSession(mode: 'baseline' | 'conduit', note: string) {
    await this.safe(() => this.api('/api/analytics/session/start', 'POST', { mode, note, workspace: get().activeMode ?? undefined }))
    await this.refreshAnalytics()
  }
  async stopSession() {
    await this.safe(() => this.api('/api/analytics/session/stop', 'POST'))
    await this.refreshAnalytics()
  }
  async startTrial(label: 'intended' | 'unintended', target: string | null, scenario: string) {
    await this.safe(() => this.api('/api/analytics/trial/start', 'POST', { label, target, scenario }))
    await this.refreshAnalytics()
  }
  async endTrial() {
    await this.safe(() => this.api('/api/analytics/trial/end', 'POST'))
    await this.refreshAnalytics()
  }
  async exportCsv() {
    return (await this.safe(() => this.api<string>('/api/analytics/export'))) ?? ''
  }
}
