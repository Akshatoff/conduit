// Device controller / hardware abstraction (TypeScript twin of backend/hardware/*).
// One code path for simulation and real hardware:  validate -> SENT -> ACK -> state read-back -> CONFIRMED.
// The twin's confirmed_state changes ONLY after acknowledgement + independent read-back agree.
// In hardware mode an acknowledgement is never fabricated.

import { ACTION_TO_STATE, DEVICE_SPECS } from './config'
import type { CommandResult, CommandStatus, DeviceTwin } from './types'

export interface DeviceCommand {
  command_id: string
  device: string
  action: string
  source: string
  confidence?: number | null
}
interface Ack { command_id: string; device: string; status: string; actual_state?: string | null; detail?: string | null; simulated?: boolean; verified?: boolean }

export class NodeError extends Error {}

export interface DeviceNode {
  name: string
  simulated: boolean
  health(): Promise<void>
  send(cmd: DeviceCommand): Promise<Ack>
  readState(): Promise<Record<string, string>>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const safeStates = () => Object.fromEntries(Object.values(DEVICE_SPECS).map((s) => [s.id, s.safe]))

export class SimulatedNode implements DeviceNode {
  name = 'simulation'
  simulated = true
  online = true
  ackDelayMs = 80
  private state: Record<string, string> = safeStates()
  private seen = new Map<string, Ack>()
  async health() {
    if (!this.online) throw new NodeError('Simulated node offline')
  }
  async send(cmd: DeviceCommand): Promise<Ack> {
    await sleep(this.ackDelayMs)
    if (!this.online) throw new NodeError('Simulated node offline')
    const prev = this.seen.get(cmd.command_id)
    if (prev) return prev
    this.state[cmd.device] = ACTION_TO_STATE[cmd.action]
    const ack: Ack = { command_id: cmd.command_id, device: cmd.device, status: 'ACKNOWLEDGED', actual_state: this.state[cmd.device], simulated: true }
    this.seen.set(cmd.command_id, ack)
    return ack
  }
  async readState() {
    if (!this.online) throw new NodeError('Simulated node offline')
    return { ...this.state }
  }
  failsafe() {
    this.state = safeStates()
  }
}

/**
 * The phone is driven with ADB, which only the Python backend can run.
 * In the browser-only runtime hardware mode is therefore unavailable and every call fails
 * loudly: no acknowledgement is ever fabricated in its place.
 */
export class PhoneAdbUnavailableNode implements DeviceNode {
  name = 'phone-adb'
  simulated = false
  constructor(public adbPath = '', public serial = '', public timeoutS = 8, public pulseMs = 700) {}
  private fail(): never {
    throw new NodeError(
      'Hardware mode needs the Python backend: a browser cannot run adb. Start scripts\\run.bat, connect the phone and reload.',
    )
  }
  async health(): Promise<void> {
    this.fail()
  }
  async send(): Promise<Ack> {
    this.fail()
  }
  async readState(): Promise<Record<string, string>> {
    this.fail()
  }
}

type Emit = (type: string, data: Record<string, unknown>) => void
const HARDWARE_SOURCES = ['conduit_intent_engine', 'manual_test']

export function validateCommand(cmd: DeviceCommand, minConfidence: number): string | null {
  const spec = DEVICE_SPECS[cmd.device]
  if (!spec) return `Unknown device '${cmd.device}'`
  if (!spec.actions.includes(cmd.action)) return `Action '${cmd.action}' is not valid for ${spec.name} (allowed: ${spec.actions.join(', ')})`
  if (!['conduit_intent_engine', 'baseline_gesture', 'manual_test'].includes(cmd.source)) return `Unknown command source '${cmd.source}'`
  if (cmd.source === 'conduit_intent_engine') {
    if (cmd.confidence == null) return 'Intent command carries no confidence value'
    if (cmd.confidence < minConfidence) return `Intent confidence ${cmd.confidence.toFixed(2)} below minimum ${minConfidence.toFixed(2)}`
  }
  return null
}

export class DeviceController {
  sim = new SimulatedNode()
  hw = new PhoneAdbUnavailableNode()
  twin: Record<string, DeviceTwin> = {}
  private results = new Map<string, CommandResult>()
  private chain: Promise<unknown> = Promise.resolve()

  constructor(public mode: 'simulation' | 'hardware', private emit: Emit, public minConfidence = 0) {
    this.resetTwin()
  }

  private resetTwin() {
    const simMode = this.mode === 'simulation'
    for (const s of Object.values(DEVICE_SPECS)) {
      this.twin[s.id] = {
        id: s.id, name: s.name, type: s.type, hardware: s.hardware, actions: s.actions, safe_state: s.safe,
        adb_command: s.adb, readback_note: s.readbackNote,
        confirmed_state: simMode ? s.safe : 'UNKNOWN', state_source: simMode ? 'simulation' : 'none', simulated: simMode,
        verified: simMode,
        connection: simMode ? 'simulated' : 'disconnected', last_command: null, last_ack: null, error: null,
        pending_command_id: null, updated_at: Date.now() / 1000,
      }
    }
  }

  get node(): DeviceNode {
    return this.mode === 'simulation' ? this.sim : this.hw
  }
  deviceStates = () => Object.fromEntries(Object.values(this.twin).map((d) => [d.id, d.confirmed_state]))
  list = () => Object.values(this.twin)

  private emitDevice(id: string, reason: string) {
    this.emit('device_state_changed', { ...this.twin[id], reason })
  }

  async setMode(mode: 'simulation' | 'hardware') {
    this.mode = mode
    this.resetTwin()
    if (mode === 'hardware') await this.refresh()
    for (const id of Object.keys(this.twin)) this.emitDevice(id, `Mode switched to ${mode}`)
  }

  configureHardware(adbPath: string, serial: string, timeoutS: number, pulseMs?: number) {
    Object.assign(this.hw, { adbPath, serial, timeoutS })
    if (pulseMs !== undefined) this.hw.pulseMs = Math.max(50, Math.min(5000, Math.round(pulseMs)))
  }

  async refresh(): Promise<boolean> {
    const node = this.node
    try {
      await node.health()
      const states = await node.readState()
      const conn = node.simulated ? 'simulated' : 'connected'
      for (const t of Object.values(this.twin)) {
        const st = states[t.id]
        const changed = (st !== undefined && t.confirmed_state !== st) || t.connection !== conn
        if (st !== undefined) {
          Object.assign(t, { confirmed_state: st, state_source: node.simulated ? 'simulation' : 'device_readback', verified: true })
        } else {
          Object.assign(t, { verified: node.simulated })
        }
        Object.assign(t, { connection: conn, simulated: node.simulated, error: null, updated_at: Date.now() / 1000 })
        if (changed) this.emitDevice(t.id, st !== undefined ? 'State read back from node' : 'Device connected')
      }
      return true
    } catch (e) {
      this.markDisconnected(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  private markDisconnected(why: string) {
    for (const [id, t] of Object.entries(this.twin)) {
      const was = t.connection
      Object.assign(t, { connection: 'disconnected', error: `Phone unreachable: ${why}`, pending_command_id: null, confirmed_state: 'UNKNOWN', state_source: 'none', verified: false, updated_at: Date.now() / 1000 })
      if (was !== 'disconnected') this.emitDevice(id, 'Node disconnected')
    }
  }

  setSimulatedFault(offline: boolean) {
    this.sim.online = !offline
    if (offline) {
      this.sim.failsafe()
      this.markDisconnected('simulated link failure')
    }
  }

  execute(cmd: DeviceCommand): Promise<CommandResult> {
    const cached = this.results.get(cmd.command_id)
    if (cached) return Promise.resolve(cached)
    const p = this.chain.then(() => this.run(cmd))
    this.chain = p.catch(() => undefined)
    return p.then((r) => {
      this.results.set(cmd.command_id, r)
      return r
    })
  }

  private result(cmd: DeviceCommand, status: CommandStatus, detail: string, node: DeviceNode, extra: Partial<CommandResult> = {}): CommandResult {
    return { command_id: cmd.command_id, device: cmd.device, action: cmd.action, source: cmd.source, status, detail, confirmed_state: null, simulated: node.simulated, latency_ms: null, ack_latency_ms: null, acknowledged: false, verified: false, executed_on: node.name, ...extra }
  }

  private async run(cmd: DeviceCommand): Promise<CommandResult> {
    const t0 = performance.now()
    const node: DeviceNode = this.mode === 'simulation' || !HARDWARE_SOURCES.includes(cmd.source) ? this.sim : this.hw
    const sandbox = node !== this.node
    const bad = validateCommand(cmd, this.minConfidence)
    if (bad) {
      const res = this.result(cmd, 'REJECTED', bad, node)
      this.emit('command_rejected', { ...res })
      return res
    }
    const twin = this.twin[cmd.device]
    if (!sandbox && twin) {
      twin.pending_command_id = cmd.command_id
      twin.last_command = { command_id: cmd.command_id, device: cmd.device, action: cmd.action, source: cmd.source, status: 'SENT', at: Date.now() / 1000, confidence: cmd.confidence }
    }
    this.emit('command_sent', { command_id: cmd.command_id, device: cmd.device, action: cmd.action, source: cmd.source, status: 'SENT', executed_on: node.name, simulated: node.simulated, sandbox })
    if (!sandbox && twin) this.emitDevice(cmd.device, 'Command sent — awaiting acknowledgement')

    const tSend = performance.now()
    let ack: Ack
    try {
      ack = await Promise.race([node.send(cmd), sleep(8000).then(() => Promise.reject(new NodeError('timeout waiting for acknowledgement')))])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!sandbox) this.markDisconnected(msg)
      const res = this.result(cmd, 'DISCONNECTED', `No acknowledgement: ${msg}`, node, { latency_ms: performance.now() - t0 })
      this.finalize(cmd, res, sandbox)
      this.emit('command_rejected', { ...res })
      return res
    }
    const ackMs = performance.now() - tSend
    if (ack.command_id !== cmd.command_id || ack.device !== cmd.device) {
      const res = this.result(cmd, 'FAILED', 'Acknowledgement does not match command', node, { ack_latency_ms: ackMs })
      this.finalize(cmd, res, sandbox)
      this.emit('command_rejected', { ...res })
      return res
    }
    if (ack.status !== 'ACKNOWLEDGED') {
      const res = this.result(cmd, 'FAILED', `Node reported ${ack.status}: ${ack.detail ?? ''}`.trim(), node, { ack_latency_ms: ackMs, acknowledged: true })
      this.finalize(cmd, res, sandbox)
      this.emit('command_rejected', { ...res })
      return res
    }
    if (!sandbox && twin) twin.last_ack = { command_id: cmd.command_id, status: ack.status, actual_state: ack.actual_state ?? null, at: Date.now() / 1000, simulated: !!ack.simulated, verified: !!ack.verified }
    this.emit('command_acknowledged', { ...ack, ack_latency_ms: Math.round(ackMs * 100) / 100, executed_on: node.name, sandbox })

    const target = ACTION_TO_STATE[cmd.action]
    let actual: string | undefined
    let readErr: string | null = null
    try {
      actual = (await node.readState())[cmd.device]
    } catch (e) {
      readErr = e instanceof Error ? e.message : String(e)
    }
    const total = performance.now() - t0
    const spec = DEVICE_SPECS[cmd.device]
    let res: CommandResult
    if (readErr) {
      res = this.result(cmd, 'FAILED', `State read-back failed: ${readErr}`, node, { ack_latency_ms: ackMs, acknowledged: true, latency_ms: total })
    } else if (actual === undefined) {
      // No independent read-back on this transport (torch/vibration over ADB). Say so; never
      // dress the acknowledgement up as a confirmed device state.
      if (ack.actual_state !== target) {
        res = this.result(cmd, 'FAILED', `Node reported ${ack.actual_state ?? 'nothing'}, expected ${target}`, node, { ack_latency_ms: ackMs, acknowledged: true, latency_ms: total })
      } else {
        res = this.result(cmd, 'ACKNOWLEDGED', `${spec.name} ${target} acknowledged — ${spec.readbackNote || 'no independent read-back for this output'}`, node, { confirmed_state: target, ack_latency_ms: ackMs, acknowledged: true, verified: false, latency_ms: total })
      }
    } else if (actual === target && ack.actual_state === target) {
      res = this.result(cmd, 'CONFIRMED', `${spec.name} confirmed ${target}${ack.detail ? ` — ${ack.detail}` : ''}`, node, { confirmed_state: target, ack_latency_ms: ackMs, acknowledged: true, verified: true, latency_ms: total })
    } else {
      res = this.result(cmd, 'FAILED', `State mismatch: expected ${target}, device reports ${actual ?? ack.actual_state}`, node, { ack_latency_ms: ackMs, acknowledged: true, latency_ms: total, confirmed_state: actual ?? null })
    }
    this.finalize(cmd, res, sandbox)
    if (res.status !== 'CONFIRMED' && res.status !== 'ACKNOWLEDGED') this.emit('command_rejected', { ...res })
    return res
  }

  private finalize(cmd: DeviceCommand, res: CommandResult, sandbox: boolean) {
    const twin = this.twin[cmd.device]
    if (sandbox || !twin) {
      this.emit('device_state_changed', { id: cmd.device, sandbox: true, confirmed_state: res.confirmed_state, reason: res.detail, simulated: true })
      return
    }
    twin.pending_command_id = null
    if (twin.last_command) twin.last_command = { ...twin.last_command, status: res.status, detail: res.detail }
    if (res.status === 'CONFIRMED' || res.status === 'ACKNOWLEDGED') Object.assign(twin, { confirmed_state: res.confirmed_state, error: null, state_source: res.simulated ? 'simulation' : res.verified ? 'device_readback' : 'node_ack', simulated: res.simulated, verified: res.verified, updated_at: Date.now() / 1000 })
    else if (res.status !== 'DISCONNECTED') Object.assign(twin, { error: res.detail, updated_at: Date.now() / 1000 })
    this.emitDevice(cmd.device, res.detail)
  }
}
