// CONDUIT Intent Engine — TypeScript twin of backend/intent/engine.py.
// Deterministic state machine + interpretable scoring. No dependency on vision or I/O: it consumes
// InteractionInput and emits IntentEvents (incl. command requests) with a reason for every decision.

import { toggleAction, zoneContains } from './config'
import { TrajectoryAnalyzer, emptyMetrics, type TrajectoryMetrics } from './trajectory'
import type { CommandRequest, IntentConfig, IntentEvent, IntentSnapshot, IntentStateName, InteractionInput, Zone } from './types'

type S = IntentStateName

const TERMINAL: S[] = ['COMPLETED', 'CANCELLED', 'REJECTED', 'ERROR']
const CANCELLABLE: S[] = ['APPROACHING_CONTROL', 'SELECTING', 'AWAITING_CONFIRMATION', 'CONFIRMING']
const INTENT_LABEL: Record<string, string> = {
  IDLE: 'NONE',
  ACTIVATING: 'ACTIVATE_INTERACTION',
  READY: 'AWAIT_TARGET',
  APPROACHING_CONTROL: 'APPROACH_CONTROL',
  SELECTING: 'SELECT_DEVICE',
  AWAITING_CONFIRMATION: 'SELECT_DEVICE',
  CONFIRMING: 'CONFIRM_ACTION',
  EXECUTING: 'EXECUTE_COMMAND',
  COMPLETED: 'EXECUTE_COMMAND',
  CANCELLED: 'CANCEL',
  REJECTED: 'REJECT_MOVEMENT',
  ERROR: 'EXECUTE_COMMAND',
}
export const IDLE_HINT = 'Show a still open palm to activate interaction mode'
export const READY_HINT = 'Interaction active — move deliberately toward a control'

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const f2 = (n: number) => n.toFixed(2)

export class IntentEngine {
  cfg: IntentConfig
  traj = new TrajectoryAnalyzer()
  state: S = 'IDLE'
  active = false
  target: string | null = null
  action: string | null = null
  confidence = 0
  selectionConfidence = 0
  components: Record<string, number> = {}
  reason = IDLE_HINT
  reasonCode = 'IDLE'
  accepted = false
  metrics: TrajectoryMetrics = emptyMetrics()

  private t = 0
  private events: IntentEvent[] = []
  private holds: Record<string, [number, number]> = {}
  private lastHandT: number | null = null
  private quality = 1
  private cooldownUntil = 0
  private lastExec: Record<string, number> = {}
  private stateT0 = 0
  private actT0 = 0
  private actUnstableSince: number | null = null
  private needsExitZone = false
  private palmRearm = false
  private palmStillT0: number | null = null
  private pinchReported = false
  private approachPeak: Record<string, number> = {}
  private approachCons: Record<string, number> = {}
  private approachLowSince: number | null = null
  private selDir = 0
  private selCons = 0
  private stabEma = 0
  private leftSince: number | null = null
  private confirmDeadline = 0
  private execDeadline = 0
  private lastActivity = 0
  private hovered: string | null = null
  private dwell = 0

  constructor(cfg: IntentConfig, private deviceStates: () => Record<string, string> = () => ({})) {
    this.cfg = cfg
  }

  setConfig(cfg: IntentConfig) {
    this.cfg = cfg
  }

  reset() {
    this.state = 'IDLE'
    this.active = false
    this.target = null
    this.action = null
    this.confidence = this.selectionConfidence = 0
    this.components = {}
    this.reason = IDLE_HINT
    this.reasonCode = 'IDLE'
    this.accepted = false
    this.traj.reset()
    this.metrics = emptyMetrics()
    this.events = []
    this.holds = {}
    this.lastHandT = null
    this.quality = 1
    this.cooldownUntil = 0
    this.lastExec = {}
    this.needsExitZone = false
    this.palmRearm = false
    this.palmStillT0 = null
    this.pinchReported = false
    this.approachPeak = {}
    this.approachCons = {}
    this.hovered = null
    this.dwell = 0
    this.leftSince = null
  }

  // ------------------------------------------------------------------ public API
  update(inp: InteractionInput): { snapshot: IntentSnapshot; events: IntentEvent[] } {
    this.events = []
    const t = inp.timestamp
    this.t = t
    this.tick(t)
    if (inp.hand_detected) {
      this.lastHandT = t
      this.quality += 0.3 * (Math.max(0, Math.min(1, inp.tracking_quality)) - this.quality)
      this.traj.add(t, inp.x, inp.y)
      this.metrics = this.traj.metrics()
      this.updateHolds(t, inp.gesture)
      this.hovered = this.zoneIdAt(inp.x, inp.y)
      this.traj.updateZone(this.hovered, t)
      this.stepHand(inp)
    } else {
      this.stepNoHand(t)
    }
    return { snapshot: this.snapshot(), events: this.events }
  }

  activate(t: number, reason = 'Interaction mode activated manually'): IntentEvent[] {
    this.events = []
    this.t = t
    if (!this.active && (this.state === 'IDLE' || this.state === 'ACTIVATING')) this.doActivate(t, reason, 'MANUAL_ACTIVATE')
    return this.events
  }

  deactivate(t: number, reason = 'Interaction mode deactivated', code = 'DEACTIVATED'): IntentEvent[] {
    this.events = []
    this.t = t
    if (this.state === 'EXECUTING') {
      this.emit('rejected', false, 'Deactivation deferred: command already dispatched', 'EXEC_IN_FLIGHT')
      return this.events
    }
    if (this.active || this.state !== 'IDLE') this.doDeactivate(t, reason, code)
    return this.events
  }

  cancel(t: number, reason = 'Cancelled by operator'): IntentEvent[] {
    this.events = []
    this.t = t
    if (CANCELLABLE.includes(this.state)) this.finish('CANCELLED', t, reason, 'CANCELLED_MANUAL', false)
    else if (this.state === 'EXECUTING') this.emit('rejected', false, 'Cancel ignored: command already dispatched to device', 'EXEC_IN_FLIGHT')
    else if (this.active) this.doDeactivate(t, reason, 'CANCELLED_MANUAL')
    return this.events
  }

  notifyCommandResult(success: boolean, reason: string, t: number): IntentEvent[] {
    this.events = []
    this.t = t
    if (this.state !== 'EXECUTING') return this.events
    this.cooldownUntil = t + this.cfg.cooldown_s
    if (success) this.finish('COMPLETED', t, reason, 'EXEC_CONFIRMED', true, 'completed')
    else this.finish('ERROR', t, reason, 'EXEC_FAILED', false, 'error')
    return this.events
  }

  snapshot(): IntentSnapshot {
    const t = this.t
    const cdRem = Math.max(0, this.cooldownUntil - t)
    const awaiting = this.state === 'AWAITING_CONFIRMATION' || this.state === 'CONFIRMING'
    const zone = this.zoneById(this.target)
    const minDwell = Math.max(this.cfg.min_dwell_s, 1e-6)
    const progAct = this.state === 'ACTIVATING' ? Math.min(1, (t - this.actT0) / Math.max(this.cfg.activation_hold_s, 1e-6)) : this.active ? 1 : 0
    const r3 = (n: number) => Math.round(n * 1000) / 1000
    return {
      state: this.state,
      intent: INTENT_LABEL[this.state],
      active: this.active,
      target: this.target,
      target_label: zone?.label ?? null,
      action: this.action,
      confidence: r3(this.state !== 'CONFIRMING' ? this.selectionConfidence : this.confidence),
      final_confidence: r3(this.confidence),
      components: Object.fromEntries(Object.entries(this.components).map(([k, v]) => [k, r3(v)])),
      accepted: this.accepted,
      reason: this.reason,
      reason_code: this.reasonCode,
      confirmation_required: awaiting,
      hovered_zone: this.hovered,
      in_cooldown: cdRem > 0 && ['READY', 'COMPLETED', 'IDLE'].includes(this.state),
      cooldown_remaining: Math.round(cdRem * 100) / 100,
      progress: {
        activation: r3(progAct),
        dwell: r3(Math.min(1, this.dwell / minDwell)),
        dwell_s: r3(this.dwell),
        confirmation_remaining_s: awaiting ? Math.round(Math.max(0, this.confirmDeadline - t) * 100) / 100 : 0,
        confirmation_timeout_s: this.cfg.confirmation_timeout_s,
      },
      tracking_quality: r3(this.quality),
      timestamp: t,
    }
  }

  // ------------------------------------------------------------------ internals
  private zoneById(id: string | null): Zone | undefined {
    return this.cfg.zones.find((z) => z.id === id)
  }

  private emit(kind: string, accepted: boolean, reason: string, code: string, command: CommandRequest | null = null) {
    this.reason = reason
    this.reasonCode = code
    this.accepted = accepted
    this.events.push({
      kind,
      intent: INTENT_LABEL[this.state],
      target: this.target,
      confidence: this.confidence,
      state: this.state,
      accepted,
      reason,
      reason_code: code,
      timestamp: this.t,
      action: this.action,
      command,
      components: { ...this.components },
    })
  }

  private updateHolds(t: number, g: string) {
    const h = this.holds[g]
    if (!h || t - h[1] > this.cfg.gesture_grace_s) this.holds[g] = [t, t]
    else h[1] = t
  }

  private hold(g: string): number {
    const h = this.holds[g]
    if (!h || this.t - h[1] > this.cfg.gesture_grace_s) return 0
    return this.t - h[0]
  }

  private zoneIdAt(x: number, y: number): string | null {
    const tz = this.zoneById(this.target)
    if (tz && ['SELECTING', 'AWAITING_CONFIRMATION', 'CONFIRMING'].includes(this.state) && zoneContains(tz, x, y, this.cfg.zone_margin)) return tz.id
    for (const z of this.cfg.zones) if (zoneContains(z, x, y)) return z.id
    return null
  }

  zoneAt(x: number, y: number): string | null {
    for (const z of this.cfg.zones) if (zoneContains(z, x, y)) return z.id
    return null
  }

  private score(withGesture: boolean, pinch = 1): [number, Record<string, number>] {
    const w = this.cfg.weights
    const comps: Record<string, number> = {
      consistency: this.selCons,
      direction: Math.min(1, this.selDir / Math.max(this.cfg.approach_full_score, 1e-6)),
      stability: this.stabEma,
      dwell: Math.min(1, this.dwell / Math.max(this.cfg.min_dwell_s, 1e-6)),
      tracking: this.quality,
      activation: this.active ? 1 : 0,
    }
    if (withGesture) comps.gesture = Math.max(0, Math.min(1, (0.45 - pinch) / 0.2))
    let total = 0
    let sum = 0
    for (const [k, v] of Object.entries(comps)) {
      total += w[k] ?? 0
      sum += (w[k] ?? 0) * v
    }
    return [total > 0 ? Math.max(0, Math.min(1, sum / total)) : 0, comps]
  }

  private setStateRaw(s: S) {
    this.state = s
    this.stateT0 = this.t
  }

  private doActivate(t: number, reason: string, code: string) {
    this.active = true
    this.palmRearm = false
    this.palmStillT0 = null
    this.lastActivity = t
    this.needsExitZone = this.hovered !== null
    this.target = null
    this.action = null
    this.confidence = this.selectionConfidence = 0
    this.components = {}
    this.dwell = 0
    this.setStateRaw('READY')
    this.emit('activated', true, reason, code)
    this.emit('state_changed', true, READY_HINT, code)
    this.reason = READY_HINT
  }

  private doDeactivate(t: number, reason: string, code: string) {
    const was = this.active
    this.active = false
    this.target = null
    this.action = null
    this.dwell = 0
    this.confidence = this.selectionConfidence = 0
    this.components = {}
    this.setStateRaw('IDLE')
    this.stateT0 = t
    this.emit(was ? 'deactivated' : 'state_changed', false, reason, code)
  }

  private finish(next: S, t: number, reason: string, code: string, accepted: boolean, kind?: string) {
    this.state = next
    this.stateT0 = t
    const k = kind ?? (next === 'CANCELLED' ? 'cancelled' : next === 'REJECTED' ? 'rejected' : 'state_changed')
    this.emit(k, accepted, reason, code)
    this.needsExitZone = this.hovered !== null || this.needsExitZone
    this.pinchReported = true
    this.leftSince = null
  }

  private reject(t: number, reason: string, code: string) {
    this.finish('REJECTED', t, reason, code, false)
  }

  private tick(t: number) {
    const cfg = this.cfg
    if (TERMINAL.includes(this.state) && t - this.stateT0 >= cfg.result_hold_s) {
      this.target = null
      this.action = null
      this.dwell = 0
      this.approachPeak = {}
      this.approachCons = {}
      this.state = this.active ? 'READY' : 'IDLE'
      this.stateT0 = t
      this.lastActivity = t
      this.emit('state_changed', false, this.active ? READY_HINT : IDLE_HINT, 'RESULT_CLEARED')
    } else if (this.state === 'EXECUTING' && t >= this.execDeadline) {
      this.cooldownUntil = t + cfg.cooldown_s
      this.finish('ERROR', t, 'No device result before timeout — command state unknown', 'EXEC_TIMEOUT', false, 'error')
    } else if (this.state === 'AWAITING_CONFIRMATION' && t >= this.confirmDeadline) {
      this.finish('CANCELLED', t, `Confirmation timeout (${cfg.confirmation_timeout_s.toFixed(0)}s) — nothing executed`, 'CONFIRM_TIMEOUT', false)
    } else if (this.active && this.state === 'READY' && t - this.lastActivity >= cfg.interaction_timeout_s) {
      this.doDeactivate(t, `Interaction timeout (${cfg.interaction_timeout_s.toFixed(0)}s without activity)`, 'INTERACTION_TIMEOUT')
    }
  }

  private stepNoHand(t: number) {
    const gap = this.lastHandT !== null ? t - this.lastHandT : 0
    if (gap > 0.3) {
      this.traj.reset()
      this.traj.updateZone(null, t)
      this.metrics = emptyMetrics()
      this.holds = {}
      this.hovered = null
      this.pinchReported = false
      this.palmStillT0 = null
    }
    if (this.state === 'ACTIVATING' && gap > 0.3) this.abortActivation(t, 'Hand lost during activation', 'ACTIVATION_ABORTED')
    else if ((this.state === 'APPROACHING_CONTROL' || this.state === 'SELECTING') && gap > 0.5) this.reject(t, 'Tracking lost while selecting — selection discarded', 'TRACKING_LOST')
    else if (this.state === 'AWAITING_CONFIRMATION' && gap > this.cfg.no_hand_timeout_s) this.finish('CANCELLED', t, 'Hand lost — confirmation cancelled', 'NO_HAND_TIMEOUT', false)
    else if (this.active && this.state === 'READY' && gap > this.cfg.no_hand_timeout_s)
      this.doDeactivate(t, `No hand detected for ${this.cfg.no_hand_timeout_s.toFixed(0)}s — interaction deactivated`, 'NO_HAND_TIMEOUT')
  }

  private abortActivation(t: number, reason: string, code: string) {
    const elapsed = t - this.actT0
    this.state = 'IDLE'
    this.stateT0 = t
    this.emit('state_changed', false, reason, code)
    if (elapsed >= 0.25) this.emit('rejected', false, reason, code)
    this.reason = IDLE_HINT
  }

  private stepHand(inp: InteractionInput) {
    const t = inp.timestamp
    const cfg = this.cfg
    const gm = cfg.gestures
    const st = this.state
    if (this.needsExitZone && this.hovered === null) this.needsExitZone = false
    if (this.hold(gm.confirm) === 0 && inp.gesture !== gm.confirm) this.pinchReported = false
    if (CANCELLABLE.includes(st) && this.hold(gm.cancel) >= cfg.cancel_hold_s) {
      this.finish('CANCELLED', t, 'Closed fist — interaction cancelled', 'CANCELLED_FIST', false)
      return
    }
    if (st === 'IDLE') this.stepIdle(inp)
    else if (st === 'ACTIVATING') this.stepActivating(inp)
    else if (st === 'READY') this.stepReady(inp)
    else if (st === 'APPROACHING_CONTROL') this.stepApproaching(inp)
    else if (st === 'SELECTING') this.stepSelecting(inp)
    else if (st === 'AWAITING_CONFIRMATION') this.stepAwaiting(inp)
  }

  private stepIdle(inp: InteractionInput) {
    if (inp.gesture === this.cfg.gestures.activate && this.metrics.stability >= this.cfg.activation_stability) {
      this.actT0 = inp.timestamp
      this.actUnstableSince = null
      this.state = 'ACTIVATING'
      this.stateT0 = inp.timestamp
      this.emit('state_changed', false, 'Open palm detected — hold still to activate', 'ACTIVATING')
    }
  }

  private stepActivating(inp: InteractionInput) {
    const t = inp.timestamp
    const gm = this.cfg.gestures
    if (inp.gesture !== gm.activate && this.hold(gm.activate) === 0) return this.abortActivation(t, 'Activation gesture not held', 'ACTIVATION_ABORTED')
    if (this.metrics.stability < this.cfg.activation_stability) {
      if (this.actUnstableSince === null) this.actUnstableSince = t
      else if (t - this.actUnstableSince > 0.35) return this.abortActivation(t, `Hand moving during activation (stability ${f2(this.metrics.stability)})`, 'ACTIVATION_UNSTABLE')
    } else this.actUnstableSince = null
    if (t - this.actT0 >= this.cfg.activation_hold_s) this.doActivate(t, 'Interaction mode activated by open palm', 'ACTIVATED')
  }

  private stepReady(inp: InteractionInput) {
    const t = inp.timestamp
    const cfg = this.cfg
    const gm = cfg.gestures
    const m = this.metrics
    if (this.hold(gm.cancel) >= cfg.emergency_hold_s) return this.doDeactivate(t, 'Closed fist held — interaction deactivated (emergency stop)', 'EMERGENCY_STOP')

    if (inp.gesture !== gm.activate || m.speed > 0.15) this.palmRearm = true
    if (inp.gesture === gm.activate && m.stability >= 0.85 && this.hovered === null && this.palmRearm) {
      if (this.palmStillT0 === null) this.palmStillT0 = t
      else if (t - this.palmStillT0 >= cfg.deactivation_hold_s) return this.doDeactivate(t, 'Still open palm held — interaction deactivated', 'PALM_DEACTIVATE')
    } else this.palmStillT0 = null

    this.maybeReportStrayPinch(inp, 'Pinch ignored: no device selected')
    const inCooldown = t < this.cooldownUntil
    if (inCooldown || this.needsExitZone) {
      this.reason = inCooldown ? `Cooldown (${(this.cooldownUntil - t).toFixed(1)}s) — selections blocked` : 'Move out of the control zone to re-arm selection'
      this.reasonCode = inCooldown ? 'COOLDOWN' : 'REARM'
      return
    }
    this.reason = READY_HINT
    this.reasonCode = 'READY'
    if (this.hovered) return this.beginSelection(this.zoneById(this.hovered)!, t)

    let bestId: string | null = null
    let best = 0
    for (const z of cfg.zones) {
      const s = this.traj.approachScore([(z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2])
      if (s > best) {
        bestId = z.id
        best = s
      }
    }
    if (bestId && best >= cfg.approach_threshold) {
      this.target = bestId
      this.approachPeak = { [bestId]: best }
      this.approachCons = { [bestId]: m.consistency }
      this.approachLowSince = null
      this.lastActivity = t
      this.state = 'APPROACHING_CONTROL'
      this.stateT0 = t
      this.emit('state_changed', false, `Deliberate movement toward ${this.zoneById(bestId)!.label} (approach ${f2(best)})`, 'APPROACHING')
    }
  }

  private stepApproaching(inp: InteractionInput) {
    const t = inp.timestamp
    const cfg = this.cfg
    this.lastActivity = t
    this.maybeReportStrayPinch(inp, 'Pinch ignored: no device selected yet')
    if (this.hovered) return this.beginSelection(this.zoneById(this.hovered)!, t)
    const z = this.zoneById(this.target)!
    const s = this.traj.approachScore([(z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2])
    if (s > (this.approachPeak[z.id] ?? 0)) {
      this.approachPeak[z.id] = s
      this.approachCons[z.id] = this.metrics.consistency
    }
    if (s < cfg.approach_threshold * 0.6) {
      if (this.approachLowSince === null) this.approachLowSince = t
      else if (t - this.approachLowSince > 0.5) {
        this.target = null
        this.state = 'READY'
        this.stateT0 = t
        this.emit('state_changed', false, 'Approach abandoned — movement no longer directed at a control', 'APPROACH_LOST')
      }
    } else this.approachLowSince = null
  }

  private beginSelection(zone: Zone, t: number) {
    this.target = zone.id
    const center: [number, number] = [(zone.x0 + zone.x1) / 2, (zone.y0 + zone.y1) / 2]
    const direction = Math.max(this.approachPeak[zone.id] ?? 0, this.traj.approachScore(center))
    this.selDir = direction
    if (direction > 0) this.selCons = Math.max(this.approachCons[zone.id] ?? 0, this.metrics.consistency)
    else this.selCons = this.metrics.speed > 0.15 ? 0 : this.metrics.consistency
    this.stabEma = this.metrics.stability
    this.dwell = 0
    this.lastActivity = t
    this.state = 'SELECTING'
    this.stateT0 = t
    this.action = toggleAction(zone.device, this.deviceStates()[zone.device])
    ;[this.confidence, this.components] = this.score(false)
    this.selectionConfidence = this.confidence
    this.emit('state_changed', false, `Hand entered ${zone.label} zone — evaluating dwell and stability`, 'SELECTING')
  }

  private stepSelecting(inp: InteractionInput) {
    const t = inp.timestamp
    const cfg = this.cfg
    const zone = this.zoneById(this.target)!
    this.lastActivity = t
    this.maybeReportStrayPinch(inp, 'Pinch ignored: selection not yet established')
    if (this.hovered !== this.target) {
      if (this.dwell < cfg.min_dwell_s) this.reject(t, `Passed through ${zone.label} without dwelling (${f2(this.dwell)}s < ${f2(cfg.min_dwell_s)}s) — treated as transit movement`, 'TRANSIT')
      else this.reject(t, `Left ${zone.label} before selection was established (confidence ${f2(this.selectionConfidence)})`, 'LEFT_ZONE')
      return
    }
    this.dwell = this.traj.dwell(zone.id, t)
    this.stabEma += 0.25 * (this.metrics.stability - this.stabEma)
    ;[this.selectionConfidence, this.components] = this.score(false)
    this.confidence = this.selectionConfidence
    this.action = toggleAction(zone.device, this.deviceStates()[zone.device])

    if (this.dwell >= cfg.min_dwell_s) {
      if (this.metrics.stability < cfg.stability_threshold) {
        this.reason = `Hand not stable enough (${f2(this.metrics.stability)} < ${f2(cfg.stability_threshold)})`
        this.reasonCode = 'UNSTABLE'
      } else if (this.selectionConfidence < cfg.min_confidence) {
        this.reason = `Confidence ${f2(this.selectionConfidence)} below minimum ${f2(cfg.min_confidence)}`
        this.reasonCode = 'LOW_CONFIDENCE'
      } else {
        this.state = 'AWAITING_CONFIRMATION'
        this.stateT0 = t
        this.confirmDeadline = t + cfg.confirmation_timeout_s
        this.leftSince = null
        this.emit('device_selected', false, `${zone.label} selected`, 'SELECTED')
        this.emit('confirmation_required', false, `${zone.label}: pinch to confirm ${this.action} (confidence ${f2(this.selectionConfidence)})`, 'AWAITING_CONFIRMATION')
        this.emit('state_changed', false, `Awaiting deliberate confirmation: pinch to ${this.action}`, 'AWAITING_CONFIRMATION')
        return
      }
      if (this.dwell >= cfg.min_dwell_s + cfg.ambiguity_window_s) this.reject(t, `Selection ambiguous: ${this.reason}`, this.reasonCode)
    } else {
      this.reason = `Dwelling in ${zone.label}: ${this.dwell.toFixed(1)}s / ${cfg.min_dwell_s.toFixed(1)}s`
      this.reasonCode = 'DWELLING'
    }
  }

  private stepAwaiting(inp: InteractionInput) {
    const t = inp.timestamp
    const cfg = this.cfg
    const gm = cfg.gestures
    const zone = this.zoneById(this.target)!
    this.lastActivity = t
    if (this.hovered === this.target) this.dwell = this.traj.dwell(zone.id, t)
    this.stabEma += 0.1 * (this.metrics.stability - this.stabEma)
    this.action = toggleAction(zone.device, this.deviceStates()[zone.device])

    if (this.hovered !== this.target) {
      if (this.leftSince === null) this.leftSince = t
      else if (t - this.leftSince > cfg.leave_grace_s) return this.finish('CANCELLED', t, `Selection abandoned — hand left ${zone.label} zone`, 'SELECTION_ABANDONED', false)
    } else this.leftSince = null

    const h = this.holds[gm.confirm]
    const pinching = !!h && this.hold(gm.confirm) >= cfg.confirm_pinch_hold_s && h[0] >= this.stateT0
    ;[this.selectionConfidence, this.components] = this.score(false)
    if (!pinching) {
      this.confidence = this.selectionConfidence
      return
    }
    if (this.hovered !== this.target) {
      if (!this.pinchReported) {
        this.pinchReported = true
        this.emit('rejected', false, `Pinch ignored: hand is outside ${zone.label} zone`, 'PINCH_OUTSIDE_ZONE')
      }
      return
    }
    ;[this.confidence, this.components] = this.score(true, inp.pinch_distance)
    this.state = 'CONFIRMING'
    this.stateT0 = t
    this.emit('state_changed', false, 'Pinch detected — validating command', 'CONFIRMING')
    this.validateAndDispatch(t, zone)
  }

  private validateAndDispatch(t: number, zone: Zone) {
    const cfg = this.cfg
    if (!this.active) return this.reject(t, 'Interaction mode is not active', 'NOT_ACTIVE')
    if (this.confidence < cfg.min_confidence) return this.reject(t, `Confirmation confidence ${f2(this.confidence)} below minimum ${f2(cfg.min_confidence)}`, 'LOW_CONFIDENCE')
    if (t < this.cooldownUntil) return this.reject(t, `Cooldown active (${(this.cooldownUntil - t).toFixed(1)}s remaining)`, 'COOLDOWN')
    const key = `${zone.device}:${this.action}`
    const last = this.lastExec[key]
    if (last !== undefined && t - last < cfg.duplicate_window_s) return this.reject(t, `Duplicate command ${key} within ${cfg.duplicate_window_s.toFixed(0)}s`, 'DUPLICATE')
    const cmd: CommandRequest = {
      command_id: uuid(),
      device: zone.device,
      action: this.action ?? '',
      confidence: Math.round(this.confidence * 10000) / 10000,
      timestamp: t,
      source: 'conduit_intent_engine',
    }
    this.lastExec[key] = t
    this.execDeadline = t + cfg.execution_timeout_s
    this.state = 'EXECUTING'
    this.stateT0 = t
    this.accepted = true
    this.emit('command_request', true, `Intent validated (confidence ${f2(this.confidence)}) — dispatching ${zone.device}:${this.action}`, 'VALIDATED', cmd)
    this.emit('state_changed', true, 'Awaiting device acknowledgement', 'EXECUTING')
  }

  private maybeReportStrayPinch(inp: InteractionInput, reason: string) {
    const gm = this.cfg.gestures
    if (inp.gesture === gm.confirm && this.hold(gm.confirm) >= this.cfg.confirm_pinch_hold_s && !this.pinchReported) {
      this.pinchReported = true
      this.emit('rejected', false, reason, 'PINCH_NO_SELECTION')
    }
  }
}
