// Store-level glue for the mode layer. Pure functions only: no runtime import here, so the
// runtimes can call `applyDigitalCommand` without a circular dependency.

import { pushLog, useConduit } from '../store'
import { getMode, MODE_REDUCERS, controlByDevice, digitalControl } from './registry'
import { initialModeState, withHistory } from './state'
import type { ModeActionEntry, ModeControl, ModeId, ModeState } from './types'

const set = useConduit.setState
const get = useConduit.getState

export function enterModeLocal(id: ModeId) {
  const def = getMode(id)
  if (!def) return
  set((s) => ({
    page: 'workspace',
    activeMode: id,
    zones: def.zones,
    settings: { ...s.settings, workspace_mode: id },
  }))
  pushLog({
    channel: 'system',
    level: 'info',
    title: `${def.shortName} environment loaded`,
    detail: `${def.zones.length} mode controls · same shared Intent Engine · demo state preserved per environment.`,
    code: 'MODE_ENTER',
  })
}

export function updateModeState(id: ModeId, fn: (s: ModeState) => ModeState) {
  set((s) => ({ modeState: { ...s.modeState, [id]: fn(s.modeState[id]) } }))
}

function addEntry(id: ModeId, control: ModeControl, source: ModeActionEntry['source'], status: ModeActionEntry['status'], summary: string) {
  const def = getMode(id)
  if (!def) return
  updateModeState(id, (state) =>
    withHistory(state, def, {
      controlId: control.id,
      device: control.device,
      action: control.action ?? 'TOGGLE',
      label: control.label,
      summary,
      status,
      source,
      kind: control.kind,
    }),
  )
}

/**
 * Called by a runtime after a digital command was authorised by the Intent Engine.
 * Returns true when the device belongs to the active mode's digital control surface.
 */
export function applyDigitalCommand(device: string, action: string, status: 'confirmed' | 'rejected' = 'confirmed'): boolean {
  const active = get().activeMode
  const def = getMode(active)
  if (!def) return false
  const control = digitalControl(def, device)
  if (!control) return false
  if (status === 'rejected' || (control.action && control.action !== action)) {
    addEntry(def.id, control, 'system', 'rejected', `Digital action rejected: ${device}:${action} does not match ${control.action ?? 'the configured action'}`)
    return true
  }
  const current = get().modeState[def.id]
  const reduction = MODE_REDUCERS[def.id](current, control)
  const id = def.id
  updateModeState(id, (state) => {
    const next = { ...reduction.state, demoStep: state.demoStep }
    return withHistory(next, def, {
      controlId: control.id,
      device: control.device,
      action: control.action ?? action,
      label: control.label,
      summary: reduction.summary,
      status: reduction.status,
      source: 'intent',
      kind: 'digital',
    })
  })
  return true
}

/** Physical device outcome, only recorded when the controller reports a final result. */
export function recordPhysicalOutcome(device: string, action: string, confirmed: boolean, detail: string) {
  const active = get().activeMode
  const def = getMode(active)
  if (!def) return
  const control = controlByDevice(def, device)
  if (!control || control.kind !== 'physical') return
  addEntry(def.id, control, 'intent', confirmed ? 'confirmed' : 'rejected', confirmed ? `${control.label} confirmed by node read-back (${action})` : `${control.label} not confirmed — ${detail}`)
}

export function resetModeDemo(id?: ModeId | null) {
  const target = id ?? get().activeMode
  const def = getMode(target)
  if (!def) return
  updateModeState(def.id, () => initialModeState(def))
  pushLog({ channel: 'system', level: 'info', title: 'Demo reset', detail: `${def.shortName} dashboard, timer and interaction history reset.`, code: 'DEMO_RESET' })
  void import('../runtime').then(({ rt }) => rt().cancel().catch(() => undefined))
}

export function markDemoStep(id: ModeId, step: number) {
  const def = getMode(id)
  if (!def) return
  updateModeState(id, (state) => ({ ...state, demoStep: Math.max(0, Math.min(step, def.demo.steps.length)) }))
}
