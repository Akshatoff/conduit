// In-browser runtime: the "offline demonstration fallback" (also used when the Python backend is not running).
// Real camera frames are processed locally with MediaPipe (WASM) — nothing is uploaded or recorded.
// Alternative input: a pointer-driven *synthetic* hand (clearly labelled) for demos without a camera.
// Everything downstream (Intent Engine, device controller, twin, analytics) is the same code path as the backend design.

import { LocalAnalytics } from '../core/analytics'
import { BaselineController } from '../core/baseline'
import { DEVICE_SPECS, defaultSettings } from '../core/config'
import { DeviceController } from '../core/devices'
import { IntentEngine } from '../core/intentEngine'
import { PositionSmoother, extractFeatures, makeHand } from '../core/landmarks'
import { TrajectoryAnalyzer } from '../core/trajectory'
import type { AppSettings, CommandRequest, CommandResult, IntentEvent, IntentSnapshot, InteractionInput, SecondHand, VisionFrame, Zone } from '../core/types'
import { idleSnapshot, pushLog, useConduit } from '../store'
import { applyDigitalCommand, recordPhysicalOutcome } from '../modes/actions'
import { digitalControl, getMode } from '../modes/registry'
import type { ModeId } from '../modes/types'
import { logCommandEvent, logIntentEvent } from './logging'
import type { Runtime } from './types'

const SETTINGS_KEY = 'conduit.settings.v1'
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const set = useConduit.setState
const get = useConduit.getState
const now = () => performance.now() / 1000

function loadSettings(): AppSettings {
  const d = defaultSettings()
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return d
    const s = JSON.parse(raw)
    return { ...d, ...s, esp32: { ...d.esp32, ...s.esp32 }, camera: { ...d.camera, ...s.camera }, privacy: { ...d.privacy, ...s.privacy, store_video: false }, intent: { ...d.intent, ...s.intent, weights: { ...d.intent.weights, ...s.intent?.weights }, gestures: { ...d.intent.gestures, ...s.intent?.gestures } } }
  } catch {
    return d
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Landmarker = { detectForVideo: (v: HTMLVideoElement, t: number) => any; close: () => void }

export class LocalRuntime implements Runtime {
  kind = 'browser' as const
  private settings = loadSettings()
  private controller: DeviceController
  private engine: IntentEngine
  private baseline: BaselineController
  private analytics = new LocalAnalytics()
  private smoother = new PositionSmoother(0.5)
  private secondSmoother = new PositionSmoother(0.5)
  private view = new TrajectoryAnalyzer()
  private trail: number[][] = []
  private lastGesture = 'none'
  private lastPrimary: { x: number; y: number } | null = null
  private missed = 0

  private video: HTMLVideoElement
  private holder: HTMLDivElement
  private landmarker: Landmarker | null = null
  private raf = 0
  private pointerTimer: number | null = null
  private running = false
  private lastVideoTime = -1
  private lastFrameAt = 0
  private fps = 0
  private deviceId: string | null = null
  private ptr = { x: 0.5, y: 0.8, visible: false, pinch: false }

  constructor() {
    this.controller = new DeviceController(this.settings.hardware_mode, (t, d) => this.onDeviceEvent(t, d), this.settings.intent.min_confidence)
    this.controller.configureHardware(this.settings.esp32.host, this.settings.esp32.port, this.settings.esp32.timeout_s)
    this.engine = new IntentEngine(this.settings.intent, this.controller.deviceStates)
    this.baseline = new BaselineController(this.controller.deviceStates)
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.autoplay = true
    this.video.style.cssText = 'width:100%;height:100%;object-fit:fill;transform:scaleX(-1);display:block'
    this.holder = document.createElement('div')
    this.holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:160px;height:120px;overflow:hidden;pointer-events:none'
    this.holder.appendChild(this.video)
    document.body.appendChild(this.holder)
  }

  async init() {
    set({
      // The operator must explicitly enter an environment: persisted zone geometry alone does not
      // mean a mode dashboard is loaded (the app opens on the environment-selection screen).
      activeMode: null,
      settings: this.settings, zones: this.settings.intent.zones, interactionMode: this.settings.interaction_mode, hardwareMode: this.settings.hardware_mode,
      hardwareInfo: this.settings.esp32, devices: { ...this.controller.twin }, analytics: this.analytics.summary(), link: 'open',
    })
    window.setInterval(() => {
      if (this.controller.mode === 'hardware' && this.controller.hw.host) void this.controller.refresh()
    }, 2000)
    void this.listCameras()
    pushLog({ channel: 'system', level: 'info', title: 'Browser runtime ready', detail: 'Python backend not detected — running the engine, simulation and analytics locally in this tab.' })
  }

  // ---------------------------------------------------------------- devices events
  private onDeviceEvent(type: string, d: Record<string, unknown>) {
    logCommandEvent(type, d)
    if (type === 'device_state_changed' && !d.sandbox && typeof d.id === 'string') {
      const { reason, ...twin } = d
      void reason
      set((s) => ({ devices: { ...s.devices, [d.id as string]: twin as never } }))
    }
  }

  private async listCameras() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cams = all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i}` }))
      set({ cameras: cams })
    } catch {
      /* no media devices API */
    }
  }

  // ------------------------------------------------------------------- vision
  setInputSource(src: 'camera' | 'pointer') {
    if (get().camera.state === 'running' || get().camera.state === 'starting') void this.stopVision()
    set({ inputSource: src })
  }

  selectCamera(id: string) {
    this.deviceId = id
    if (get().camera.state === 'running') {
      void this.stopVision().then(() => this.startVision())
    }
  }

  attachVideo(host: HTMLElement | null) {
    if (host) host.appendChild(this.video)
    else this.holder.appendChild(this.video)
  }

  async startVision() {
    if (get().camera.state === 'running' || get().camera.state === 'starting') return
    this.engine.reset()
    this.baseline.reset()
    this.running = true
    if (get().inputSource === 'pointer') {
      set({ camera: { state: 'running', active: false, fps: 30, error: null, available: true, camera_index: 0, tracker: 'pointer-simulator (synthetic hand)' } })
      this.pointerTimer = window.setInterval(() => this.pointerTick(), 33)
      return
    }
    set({ camera: { ...get().camera, state: 'starting', active: false, error: null, tracker: 'loading model…' } })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: this.deviceId ? { exact: this.deviceId } : undefined, width: { ideal: this.settings.camera.width }, height: { ideal: this.settings.camera.height } },
        audio: false,
      })
      this.video.srcObject = stream
      await this.video.play().catch(() => undefined)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => this.cameraLost('Camera disconnected (unplugged or taken by another app)'))
      set({ stream })
      void this.listCameras()
    } catch (e) {
      this.running = false
      const msg = e instanceof Error ? e.message : String(e)
      set({ camera: { state: 'error', active: false, fps: 0, error: `Camera unavailable: ${msg}`, available: false, camera_index: 0 } })
      return
    }
    try {
      if (!this.landmarker) this.landmarker = await this.createLandmarker()
    } catch (e) {
      this.releaseStream()
      this.running = false
      const msg = e instanceof Error ? e.message : String(e)
      set({ camera: { state: 'error', active: false, fps: 0, error: `Hand model could not be loaded (${msg}). It is fetched once from a CDN — check connectivity, or use the pointer simulator / Python backend.`, available: false, camera_index: 0 } })
      return
    }
    this.smoother = new PositionSmoother(this.settings.camera.smoothing_alpha)
    this.lastVideoTime = -1
    set({ camera: { state: 'running', active: true, fps: 0, error: null, available: true, camera_index: 0, tracker: 'mediapipe-tasks (WASM, local)' } })
    this.raf = requestAnimationFrame(this.cameraLoop)
  }

  private async createLandmarker(): Promise<Landmarker> {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    const mk = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 })
    try {
      return (await mk('GPU')) as unknown as Landmarker
    } catch {
      return (await mk('CPU')) as unknown as Landmarker
    }
  }

  private releaseStream() {
    const s = get().stream
    s?.getTracks().forEach((t) => t.stop())
    this.video.srcObject = null
    set({ stream: null })
  }

  private cameraLost(msg: string) {
    this.stopLoops()
    this.releaseStream()
    this.engine.reset()
    set({ camera: { state: 'disconnected', active: false, fps: 0, error: msg, available: false, camera_index: 0 }, frame: null, trail: [], intent: idleSnapshot() })
    pushLog({ channel: 'system', level: 'error', title: 'Camera disconnected', detail: msg })
  }

  private stopLoops() {
    this.running = false
    cancelAnimationFrame(this.raf)
    if (this.pointerTimer) window.clearInterval(this.pointerTimer)
    this.pointerTimer = null
  }

  async stopVision() {
    this.stopLoops()
    this.releaseStream()
    this.engine.reset()
    this.baseline.reset()
    this.trail = []
    this.view.reset()
    set({ camera: { ...get().camera, state: 'stopped', active: false, fps: 0, error: null }, frame: null, trail: [], intent: idleSnapshot() })
  }

  // --------------------------------------------------------------- frame sources
  private cameraLoop = () => {
    if (!this.running) return
    const v = this.video
    if (this.landmarker && v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime
      const t = performance.now()
      try {
        const res = this.landmarker.detectForVideo(v, t)
        const hands = res.landmarks as { x: number; y: number; z: number }[][] | undefined
        // Keep the same physical hand as primary while two hands are visible. The Intent Engine
        // must not see a left/right identity swap just because detection order changed.
        let pi = 0
        if (hands && hands.length > 1 && this.lastPrimary) {
          const dist = (h: { x: number; y: number }[]) => {
            const p = h[9]
            return (1 - p.x - this.lastPrimary!.x) ** 2 + (p.y - this.lastPrimary!.y) ** 2
          }
          pi = dist(hands[0]) <= dist(hands[1]) ? 0 : 1
        }
        const lm = hands?.[pi]
        const lm2 = hands?.length === 2 ? hands[pi === 0 ? 1 : 0] : undefined
        const cat = res.handedness?.[pi]?.[0]
        const cat2 = res.handedness?.[hands?.length === 2 ? (pi === 0 ? 1 : 0) : 1]?.[0]
        // mirror x so everything is in selfie (mirrored) space, matching the displayed video
        const pts = lm ? lm.map((p) => [1 - p.x, p.y, p.z]) : null
        const pts2 = lm2 ? lm2.map((p) => [1 - p.x, p.y, p.z]) : null
        this.processDetection(pts, cat?.categoryName ?? 'Unknown', cat?.score ?? 1, t / 1000, pts2, cat2?.categoryName ?? 'Unknown', cat2?.score ?? 1)
      } catch (e) {
        pushLog({ channel: 'system', level: 'error', title: 'Tracking error', detail: String(e) })
      }
    }
    this.raf = requestAnimationFrame(this.cameraLoop)
  }

  private processDetection(points: number[][] | null, handedness: string, score: number, t: number, secondPoints: number[][] | null = null, secondHandedness = 'Unknown', secondScore = 1) {
    const dt = this.lastFrameAt ? t - this.lastFrameAt : 0.033
    this.lastFrameAt = t
    this.fps += 0.1 * (1 / Math.max(dt, 1e-3) - this.fps)
    let frame: VisionFrame
    if (!points) {
      this.smoother.reset()
      this.secondSmoother.reset()
      this.lastPrimary = null
      this.view.reset()
      this.missed = Math.min(1, this.missed + 0.2)
      frame = { timestamp: t, hand_detected: false, handedness: null, position: null, gesture: 'none', pinch_distance: null, velocity: 0, stability: 0, fps: this.fps, tracking_quality: 0, features: null, second_hand: null }
    } else {
      this.missed = Math.max(0, this.missed - 0.1)
      const f = extractFeatures(points, handedness, score, 1 - this.missed)
      this.lastPrimary = { x: f.palm_center[0], y: f.palm_center[1] }
      const [sx, sy] = this.smoother.update(f.palm_center[0], f.palm_center[1])
      this.view.add(t, sx, sy)
      const m = this.view.metrics()
      let second: SecondHand | null = null
      if (secondPoints) {
        const f2 = extractFeatures(secondPoints, secondHandedness, secondScore, 1 - this.missed)
        const [s2x, s2y] = this.secondSmoother.update(f2.palm_center[0], f2.palm_center[1])
        second = {
          hand_detected: true, handedness: secondHandedness, position: { x: s2x, y: s2y }, gesture: f2.gesture,
          pinch_distance: f2.pinch_distance, orientation_deg: f2.orientation_deg, features: f2,
        }
      } else {
        this.secondSmoother.reset()
      }
      frame = { timestamp: t, hand_detected: true, handedness, position: { x: sx, y: sy }, gesture: f.gesture, pinch_distance: f.pinch_distance, velocity: m.speed, stability: m.stability, fps: this.fps, tracking_quality: f.tracking_confidence, features: f, second_hand: second }
    }
    this.ingest(frame)
  }

  setPointer(x: number, y: number, visible: boolean) {
    this.ptr.x = x
    this.ptr.y = y
    this.ptr.visible = visible
    if (get().pointer.visible !== visible) set((s) => ({ pointer: { ...s.pointer, visible } }))
  }
  setPointerPinch(down: boolean) {
    this.ptr.pinch = down
  }

  private pointerTick() {
    const t = now()
    if (!this.ptr.visible) return this.processDetection(null, 'Unknown', 1, t)
    const g = this.ptr.pinch ? 'pinch' : get().pointer.gesture
    // synthetic 21-point hand, then the SAME landmark feature extraction as the camera path
    this.processDetection(makeHand(g, this.ptr.x, this.ptr.y, 0.2), 'Right', 0.99, t)
  }

  // ------------------------------------------------------------------- pipeline
  private ingest(frame: VisionFrame) {
    const inp: InteractionInput = {
      timestamp: frame.timestamp, hand_detected: frame.hand_detected, x: frame.position?.x ?? 0, y: frame.position?.y ?? 0,
      gesture: frame.gesture, pinch_distance: frame.pinch_distance ?? 1, tracking_quality: frame.tracking_quality,
    }
    if (frame.hand_detected) {
      this.trail.push([inp.x, inp.y])
      if (this.trail.length > 30) this.trail.shift()
    } else this.trail = []

    const t0 = performance.now()
    let snapshot: IntentSnapshot
    let events: IntentEvent[]
    if (get().interactionMode === 'conduit') {
      ;({ snapshot, events } = this.engine.update(inp))
    } else {
      events = this.baseline.update(inp).map((req) => ({
        kind: 'command_request', intent: 'BASELINE_GESTURE', target: req.device, confidence: 1, state: 'BASELINE', accepted: true,
        reason: `Gesture '${inp.gesture}' mapped directly to ${req.device}:${req.action} — no intent evaluation`, reason_code: 'BASELINE_DIRECT',
        timestamp: inp.timestamp, action: req.action, command: req,
      }))
      snapshot = {
        ...idleSnapshot(), state: 'BASELINE', intent: 'BASELINE_GESTURE', active: true, confidence: inp.hand_detected ? 1 : 0, final_confidence: 1, accepted: true,
        reason: events[0]?.reason ?? get().intent.reason, reason_code: 'BASELINE', hovered_zone: inp.hand_detected ? this.engine.zoneAt(inp.x, inp.y) : null, tracking_quality: inp.tracking_quality, timestamp: inp.timestamp,
      }
      if (!events.length && get().intent.state === 'BASELINE') snapshot.reason = get().intent.reason
    }
    this.analytics.recordEngineLatency(performance.now() - t0)

    if (frame.gesture !== this.lastGesture) this.lastGesture = frame.gesture
    const m = this.engine.metrics
    set({
      frame, trail: [...this.trail], traj: { speed: m.speed, stability: m.stability, consistency: m.consistency }, intent: snapshot,
      camera: { ...get().camera, fps: Math.round(this.fps * 10) / 10 },
    })
    for (const ev of events) this.handleEvent(ev)
  }

  private handleEvent(ev: IntentEvent) {
    logIntentEvent(ev)
    this.analytics.recordIntentEvent(ev)
    if (ev.command) void this.dispatch(ev.command)
    if (ev.kind === 'rejected' || ev.kind === 'cancelled' || ev.kind === 'completed' || ev.kind === 'command_request') this.pushAnalytics()
  }

  private async dispatch(req: CommandRequest) {
    // Digital controls belong to the active mode's UI. They are authorised by the same Intent
    // Engine, but they never touch the device controller and are labelled as digital.
    if (!DEVICE_SPECS[req.device]) {
      await this.dispatchDigital(req)
      return
    }
    const res = await this.controller.execute({ command_id: req.command_id, device: req.device, action: req.action, source: req.source, confidence: req.confidence })
    this.analytics.recordCommand(res)
    if (req.source === 'conduit_intent_engine') recordPhysicalOutcome(req.device, req.action, res.status === 'CONFIRMED', res.detail)
    this.pushAnalytics()
    if (req.source === 'conduit_intent_engine' && get().interactionMode === 'conduit') {
      for (const ev of this.engine.notifyCommandResult(res.status === 'CONFIRMED', res.detail, now())) this.handleEvent(ev)
    }
  }

  private async dispatchDigital(req: CommandRequest) {
    const t0 = performance.now()
    const def = getMode(get().activeMode)
    const control = def ? digitalControl(def, req.device) : undefined
    const valid = !!control && (!control.action || control.action === req.action)
    await new Promise((r) => setTimeout(r, 40))
    const latency = performance.now() - t0
    const res: CommandResult = {
      command_id: req.command_id, device: req.device, action: req.action, source: req.source,
      status: valid ? 'CONFIRMED' : 'REJECTED',
      detail: valid
        ? `Digital control '${control!.label}' executed in the mode layer (no physical device)`
        : `Action '${req.action}' is not part of the active mode`,
      confirmed_state: valid ? req.action : null, simulated: true, latency_ms: latency, ack_latency_ms: latency,
      acknowledged: valid, executed_on: 'mode_ui', digital: true,
    }
    logCommandEvent('command_sent', { ...res, status: 'SENT', sandbox: true } as unknown as Record<string, unknown>)
    if (valid) {
      logCommandEvent('command_acknowledged', { ...res, actual_state: req.action, ack_latency_ms: latency, sandbox: true } as unknown as Record<string, unknown>)
      applyDigitalCommand(req.device, req.action, 'confirmed')
    } else {
      logCommandEvent('command_rejected', res as unknown as Record<string, unknown>)
      applyDigitalCommand(req.device, req.action, 'rejected')
    }
    this.analytics.recordCommand(res)
    this.pushAnalytics()
    if (req.source === 'conduit_intent_engine' && get().interactionMode === 'conduit') {
      for (const ev of this.engine.notifyCommandResult(res.status === 'CONFIRMED', res.detail, now())) this.handleEvent(ev)
    }
  }

  private pushAnalytics() {
    if (this.analytics.active) set({ analytics: this.analytics.summary() })
  }

  // ------------------------------------------------------------------ operator actions
  private run(events: IntentEvent[]) {
    events.forEach((e) => this.handleEvent(e))
    set({ intent: this.engine.snapshot() })
  }
  async activate() {
    this.run(this.engine.activate(now()))
  }
  async deactivate() {
    this.run(this.engine.deactivate(now(), 'Deactivated by operator', 'MANUAL_DEACTIVATE'))
  }
  async cancel() {
    this.run(this.engine.cancel(now(), 'Cancelled by operator (emergency cancel)'))
  }

  async setInteractionMode(m: 'conduit' | 'baseline') {
    if (this.analytics.active && m !== get().interactionMode) {
      set({ notice: 'Stop the running test session before switching interaction mode.' })
      return
    }
    this.engine.reset()
    this.baseline.reset()
    this.settings = { ...this.settings, interaction_mode: m }
    this.persist()
    set({ interactionMode: m, settings: this.settings, intent: m === 'baseline' ? { ...idleSnapshot(), state: 'BASELINE', active: true, reason: 'Baseline mode: gestures map directly to commands (no intent evaluation)' } : idleSnapshot() })
  }

  async setWorkspaceMode(mode: string, zones: Zone[]) {
    const next = { ...this.settings, workspace_mode: mode, intent: { ...this.settings.intent, zones } }
    this.settings = next
    this.persist()
    this.engine.setConfig(next.intent)
    this.engine.reset()
    this.baseline.reset()
    set({ settings: next, zones, activeMode: (getMode(mode)?.id ?? null) as ModeId | null })
  }

  async testDevice(id: string, action: string) {
    pushLog({ channel: 'command', level: 'info', title: 'Manual test', detail: `Operator-initiated ${id}:${action} — bypasses gesture intent by design` })
    await this.controller.execute({ command_id: crypto.randomUUID(), device: id, action, source: 'manual_test', confidence: null })
  }

  async setHardwareMode(m: 'simulation' | 'hardware') {
    this.settings = { ...this.settings, hardware_mode: m }
    this.persist()
    await this.controller.setMode(m)
    set({ hardwareMode: m, settings: this.settings, devices: { ...this.controller.twin } })
    if (m === 'hardware' && !this.settings.esp32.host) set({ notice: 'Enter the ESP32 IP address in Settings → Hardware, then press “Test connection”.' })
  }

  async connectHardware() {
    const ok = await this.controller.refresh()
    set({ devices: { ...this.controller.twin }, notice: ok ? 'Node reachable — device states read back.' : 'Node not reachable. In hardware mode no acknowledgement is ever simulated.' })
  }

  async simulateFault(offline: boolean) {
    if (this.controller.mode !== 'simulation') return
    this.controller.setSimulatedFault(offline)
    if (!offline) await this.controller.refresh()
    set({ devices: { ...this.controller.twin } })
    pushLog({ channel: 'system', level: offline ? 'warn' : 'info', title: offline ? 'Simulated link failure' : 'Simulated link restored', detail: offline ? 'Node unreachable; simulated firmware failsafe returns outputs to safe state.' : 'Node reachable again; states read back.' })
  }

  async applySettings(s: AppSettings) {
    s.privacy.store_video = false
    const modeChanged = s.hardware_mode !== this.controller.mode
    this.settings = s
    this.persist()
    this.engine.setConfig(s.intent)
    this.controller.minConfidence = s.intent.min_confidence
    this.controller.configureHardware(s.esp32.host, s.esp32.port, s.esp32.timeout_s)
    this.smoother.alpha = s.camera.smoothing_alpha
    if (modeChanged) await this.controller.setMode(s.hardware_mode)
    else if (s.hardware_mode === 'hardware') await this.controller.refresh()
    if (s.interaction_mode !== get().interactionMode) await this.setInteractionMode(s.interaction_mode)
    set({ settings: s, zones: s.intent.zones, hardwareMode: s.hardware_mode, hardwareInfo: s.esp32, devices: { ...this.controller.twin }, notice: 'Settings saved.' })
  }

  private persist() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ analytics
  private guard(fn: () => void) {
    try {
      fn()
    } catch (e) {
      set({ notice: e instanceof Error ? e.message : String(e) })
    }
    set({ analytics: this.analytics.summary() })
  }
  async refreshAnalytics() {
    set({ analytics: this.analytics.summary() })
  }
  async startSession(mode: 'baseline' | 'conduit', note: string) {
    if (get().interactionMode !== mode) await this.setInteractionMode(mode)
    // Prefer the entered environment; otherwise the last environment whose zones are loaded.
    const workspace = get().activeMode ?? getMode(get().settings.workspace_mode)?.id ?? 'hospital'
    this.guard(() => this.analytics.startSession(mode, note, workspace))
  }
  async stopSession() {
    this.guard(() => this.analytics.stopSession())
  }
  async startTrial(label: 'intended' | 'unintended', target: string | null, scenario: string) {
    this.guard(() => this.analytics.startTrial(label, target, scenario))
  }
  async endTrial() {
    this.guard(() => this.analytics.endTrial())
  }
  async exportCsv() {
    return this.analytics.exportCsv()
  }
  clearLocalAnalytics() {
    this.analytics.clearAll()
    set({ analytics: this.analytics.summary() })
  }
}
