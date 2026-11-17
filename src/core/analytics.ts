// Comparative analytics (TypeScript twin of backend/services/analytics.py) for the in-browser runtime.
// Every number derives from trials an operator ran under the documented protocol (docs/TEST_PROTOCOL.md).
// Nothing is pre-filled. Metric definitions are identical to the backend.

import type { AnalyticsSummary, CommandResult, IntentEvent, Metrics, SessionSummary, TrialStatus } from './types'

export const METRIC_DEFINITIONS: Record<string, string> = {
  attempts: 'Number of trials (one deliberate or accidental interaction attempt each).',
  accepted: 'Trials in which at least one command was dispatched to a device.',
  rejected: 'Trials in which no command was dispatched.',
  successful_deliberate: 'Intended trials whose command reached the intended device and was CONFIRMED.',
  accidental_rejection_rate: 'Unintended trials with no command dispatched / unintended trials.',
  false_activation_rate: 'Unintended trials with a command dispatched / unintended trials.',
  deliberate_success_rate: 'Successful deliberate trials / intended trials.',
  avg_intent_latency_ms: 'Mean duration of one Intent Engine update() call.',
  avg_e2e_latency_ms: 'Mean time from validated command to CONFIRMED device state.',
  device_ack_rate: 'Commands acknowledged by the device / commands sent.',
  confirmation_request_rate: 'Trials with an explicit confirmation request / attempts.',
  confirmation_success_rate: 'Trials with a confirmation request that ended in an executed command / trials with a confirmation request.',
  avg_task_duration_s: 'Mean trial duration from Start trial to End trial (operator-declared task completion time).',
}

export interface Trial {
  id: number
  session_id: number
  label: 'intended' | 'unintended'
  target: string | null
  scenario: string
  started_at: number
  ended_at: number | null
  executed: boolean
  workspace?: string
  executed_device: string | null
  executed_action: string | null
  correct: boolean
  ack_confirmed: boolean
  commands_sent: number
  commands_acked: number
  confirmation_requested: boolean
  rejections: number
  reasons: string[]
  intent_latency_sum_ms: number
  intent_latency_n: number
  e2e_latency_ms: number | null
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d)

export function computeMetrics(trials: Trial[]): Metrics {
  const intended = trials.filter((t) => t.label === 'intended')
  const unintended = trials.filter((t) => t.label === 'unintended')
  const accepted = trials.filter((t) => t.executed)
  const successful = intended.filter((t) => t.executed && t.correct && t.ack_confirmed)
  const falseAct = unintended.filter((t) => t.executed)
  const rejUnint = unintended.filter((t) => !t.executed)
  const latN = trials.reduce((a, t) => a + t.intent_latency_n, 0)
  const latSum = trials.reduce((a, t) => a + t.intent_latency_sum_ms, 0)
  const e2e = trials.filter((t) => t.e2e_latency_ms != null).map((t) => t.e2e_latency_ms as number)
  const sent = trials.reduce((a, t) => a + t.commands_sent, 0)
  const acked = trials.reduce((a, t) => a + t.commands_acked, 0)
  const confTrials = trials.filter((t) => t.confirmation_requested)
  const confSuccess = confTrials.filter((t) => t.executed).length
  const durations = trials.filter((t) => t.ended_at != null && t.started_at != null).map((t) => (t.ended_at as number) - t.started_at)
  return {
    attempts: trials.length,
    intended_trials: intended.length,
    unintended_trials: unintended.length,
    accepted: accepted.length,
    rejected: trials.length - accepted.length,
    successful_deliberate: successful.length,
    false_activations: falseAct.length,
    accidental_rejected: rejUnint.length,
    accidental_rejection_rate: ratio(rejUnint.length, unintended.length),
    false_activation_rate: ratio(falseAct.length, unintended.length),
    deliberate_success_rate: ratio(successful.length, intended.length),
    avg_intent_latency_ms: ratio(latSum, latN),
    avg_e2e_latency_ms: e2e.length ? e2e.reduce((a, b) => a + b, 0) / e2e.length : null,
    commands_sent: sent,
    commands_acked: acked,
    device_ack_rate: ratio(acked, sent),
    confirmation_requests: confTrials.length,
    confirmation_request_rate: ratio(confTrials.length, trials.length),
    confirmation_success_rate: ratio(confSuccess, confTrials.length),
    avg_task_duration_s: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
  }
}

const KEY_TRIALS = 'conduit.trials.v1'
const KEY_SESSIONS = 'conduit.sessions.v1'

type StoredSession = Omit<SessionSummary, 'metrics'>

export class LocalAnalytics {
  private sessionId: number | null = null
  private sessionMode: 'baseline' | 'conduit' | null = null
  private sessionWorkspace: string = 'hospital'
  private trial: Trial | null = null

  private load<T>(key: string): T[] {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]') as T[]
    } catch {
      return []
    }
  }
  private save(key: string, v: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* storage full / disabled: analytics for this session stay in memory only */
    }
  }

  get active() {
    return this.sessionId !== null
  }
  get mode() {
    return this.sessionMode
  }
  get workspace() {
    return this.sessionWorkspace
  }

  status(): TrialStatus {
    const t = this.trial
    return {
      session_active: this.active,
      session_id: this.sessionId,
      mode: this.sessionMode,
      workspace: this.sessionWorkspace,
      trial_active: !!t,
      trial: t ? { label: t.label, target: t.target, scenario: t.scenario, started_at: t.started_at, executed: t.executed, rejections: t.rejections, confirmation_requested: t.confirmation_requested, commands_sent: t.commands_sent } : null,
    }
  }

  startSession(mode: 'baseline' | 'conduit', note = '', workspace = 'hospital'): number {
    if (this.active) throw new Error('A test session is already running')
    const sessions = this.load<StoredSession>(KEY_SESSIONS)
    const id = (sessions.reduce((a, s) => Math.max(a, s.id), 0) || 0) + 1
    sessions.push({ id, mode, workspace, note, start_time: Date.now() / 1000, end_time: null, attempts: 0, successes: 0, unintended: 0 })
    this.save(KEY_SESSIONS, sessions)
    this.sessionId = id
    this.sessionMode = mode
    this.sessionWorkspace = workspace
    return id
  }

  stopSession(): void {
    if (!this.active) throw new Error('No test session is running')
    if (this.trial) this.endTrial()
    const sessions = this.load<StoredSession>(KEY_SESSIONS)
    const trials = this.load<Trial>(KEY_TRIALS).filter((t) => t.session_id === this.sessionId)
    const m = computeMetrics(trials)
    const s = sessions.find((x) => x.id === this.sessionId)
    if (s) Object.assign(s, { end_time: Date.now() / 1000, attempts: m.attempts, successes: m.successful_deliberate, unintended: m.unintended_trials })
    this.save(KEY_SESSIONS, sessions)
    this.sessionId = null
    this.sessionMode = null
  }

  startTrial(label: 'intended' | 'unintended', target: string | null, scenario = '') {
    if (!this.active) throw new Error('Start a test session first')
    if (label === 'intended' && !target) throw new Error('An intended trial needs a target device')
    if (this.trial) this.endTrial()
    this.trial = { id: 0, session_id: this.sessionId!, label, workspace: this.sessionWorkspace, target, scenario, started_at: Date.now() / 1000, ended_at: null, executed: false, executed_device: null, executed_action: null, correct: false, ack_confirmed: false, commands_sent: 0, commands_acked: 0, confirmation_requested: false, rejections: 0, reasons: [], intent_latency_sum_ms: 0, intent_latency_n: 0, e2e_latency_ms: null }
  }

  endTrial() {
    if (!this.trial) throw new Error('No trial is running')
    const trials = this.load<Trial>(KEY_TRIALS)
    const t = { ...this.trial, ended_at: Date.now() / 1000, id: (trials.reduce((a, x) => Math.max(a, x.id), 0) || 0) + 1, reasons: this.trial.reasons.slice(-20) }
    trials.push(t)
    this.save(KEY_TRIALS, trials)
    this.trial = null
  }

  recordEngineLatency(ms: number) {
    if (this.trial) {
      this.trial.intent_latency_sum_ms += ms
      this.trial.intent_latency_n += 1
    }
  }

  recordIntentEvent(ev: IntentEvent) {
    const t = this.trial
    if (!t) return
    if (ev.kind === 'confirmation_required') t.confirmation_requested = true
    if (ev.kind === 'rejected' || ev.kind === 'cancelled' || ev.kind === 'error') {
      t.rejections += 1
      t.reasons.push(ev.reason_code)
    }
  }

  recordCommand(res: CommandResult) {
    const t = this.trial
    if (!t) return
    if (res.status === 'REJECTED') {
      t.rejections += 1
      t.reasons.push('COMMAND_VALIDATION')
      return
    }
    t.commands_sent += 1
    if (res.acknowledged) t.commands_acked += 1
    if (!t.executed) {
      t.executed = true
      t.executed_device = res.device
      t.executed_action = res.action
    }
    const confirmed = res.status === 'CONFIRMED'
    if (confirmed) {
      t.ack_confirmed = true
      if (res.latency_ms != null) t.e2e_latency_ms = t.e2e_latency_ms == null ? res.latency_ms : (t.e2e_latency_ms + res.latency_ms) / 2
      if (t.label === 'intended' && res.device === t.target) t.correct = true
    }
  }

  summary(): AnalyticsSummary {
    const sessions = this.load<StoredSession>(KEY_SESSIONS)
    const trials = this.load<Trial>(KEY_TRIALS)
    const out: SessionSummary[] = sessions
      .slice()
      .reverse()
      .map((s) => ({ ...s, metrics: computeMetrics(trials.filter((t) => t.session_id === s.id)) }))
    const byMode = (mode: 'baseline' | 'conduit') => {
      const ids = new Set(sessions.filter((s) => s.mode === mode).map((s) => s.id))
      return computeMetrics(trials.filter((t) => ids.has(t.session_id)))
    }
    const byWorkspace: Record<string, Metrics> = {}
    for (const w of Array.from(new Set(sessions.map((s) => s.workspace || 'hospital')))) {
      const ids = new Set(sessions.filter((s) => (s.workspace || 'hospital') === w).map((s) => s.id))
      byWorkspace[w] = computeMetrics(trials.filter((t) => ids.has(t.session_id)))
    }
    return { has_data: trials.length > 0, total_trials: trials.length, sessions: out, by_mode: { baseline: byMode('baseline'), conduit: byMode('conduit') }, by_workspace: byWorkspace, status: this.status(), definitions: METRIC_DEFINITIONS }
  }

  exportCsv(): string {
    const sessions = this.load<StoredSession>(KEY_SESSIONS)
    const modes = new Map(sessions.map((s) => [s.id, s.mode]))
    const workspaces = new Map(sessions.map((s) => [s.id, s.workspace || 'hospital']))
    const cols = ['session_id', 'mode', 'workspace', 'trial_id', 'label', 'target', 'scenario', 'started_at', 'ended_at', 'executed', 'executed_device', 'executed_action', 'correct', 'ack_confirmed', 'commands_sent', 'commands_acked', 'confirmation_requested', 'rejections', 'reasons', 'intent_latency_ms_avg', 'e2e_latency_ms']
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = this.load<Trial>(KEY_TRIALS).map((t) =>
      [t.session_id, modes.get(t.session_id) ?? '', workspaces.get(t.session_id) ?? t.workspace ?? '', t.id, t.label, t.target ?? '', t.scenario, t.started_at, t.ended_at ?? '', +t.executed, t.executed_device ?? '', t.executed_action ?? '', +t.correct, +t.ack_confirmed, t.commands_sent, t.commands_acked, +t.confirmation_requested, t.rejections, JSON.stringify(t.reasons), t.intent_latency_n ? t.intent_latency_sum_ms / t.intent_latency_n : '', t.e2e_latency_ms ?? ''].map(esc).join(','),
    )
    return [cols.join(','), ...rows].join('\n') + '\n'
  }

  clearAll() {
    localStorage.removeItem(KEY_TRIALS)
    localStorage.removeItem(KEY_SESSIONS)
  }
}
