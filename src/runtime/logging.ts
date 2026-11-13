import type { IntentEvent } from '../core/types'
import { pushLog } from '../store'

const NOISY = new Set(['RESULT_CLEARED', 'READY', 'DWELLING', 'IDLE'])
const PIPELINE_STATE_CODES = new Set(['ACTIVATING', 'APPROACHING', 'SELECTING', 'CONFIRMING', 'EXECUTING'])

/** Turn an Intent Engine event into a human-readable log line (every decision carries its reason). */
export function logIntentEvent(ev: IntentEvent) {
  if (ev.kind === 'state_changed' && (NOISY.has(ev.reason_code) || !PIPELINE_STATE_CODES.has(ev.reason_code))) return
  const level = ev.kind === 'command_request' || ev.kind === 'completed' || ev.kind === 'activated' ? 'ok' : ev.kind === 'error' ? 'error' : ev.kind === 'rejected' || ev.kind === 'cancelled' ? 'warn' : 'info'
  const titles: Record<string, string> = {
    activated: 'Interaction activated', deactivated: 'Interaction deactivated', device_selected: 'Device selected', confirmation_required: 'Confirmation required',
    command_request: 'Intent validated', rejected: 'Rejected', cancelled: 'Cancelled', completed: 'Completed', error: 'Execution error', state_changed: ev.state.replace(/_/g, ' ').toLowerCase(),
  }
  pushLog({ channel: 'intent', level, title: titles[ev.kind] ?? ev.kind, detail: ev.reason, code: ev.reason_code })
}

export function logCommandEvent(type: string, d: Record<string, unknown>) {
  const dev = String(d.device ?? '')
  const act = String(d.action ?? d.actual_state ?? '')
  const sandbox = d.sandbox ? ' (sandbox)' : ''
  if (type === 'command_sent') pushLog({ channel: 'command', level: 'info', title: `Command sent${sandbox}`, detail: `${dev} ${act} → ${d.executed_on ?? ''} · awaiting acknowledgement`, code: 'SENT' })
  else if (type === 'command_acknowledged') pushLog({ channel: 'command', level: 'info', title: `Acknowledged${sandbox}`, detail: `${dev} reports ${d.actual_state ?? '?'} (${d.ack_latency_ms ?? '?'} ms)`, code: 'ACK' })
  else if (type === 'command_rejected' && d.command_id) pushLog({ channel: 'command', level: 'error', title: `Command ${String(d.status ?? 'rejected').toLowerCase()}${sandbox}`, detail: String(d.detail ?? ''), code: String(d.status ?? '') })
  else if (type === 'device_state_changed' && !d.sandbox && typeof d.reason === 'string' && /confirmed/i.test(d.reason)) pushLog({ channel: 'command', level: 'ok', title: 'State confirmed', detail: d.reason, code: 'CONFIRMED' })
}
