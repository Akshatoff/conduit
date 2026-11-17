import type { ModeActionEntry, ModeDefinition, ModeState } from './types'

export function initialModeState(def: ModeDefinition): ModeState {
  return {
    panel: def.initialPanel,
    stepIndex: 0,
    checklistIndex: 0,
    zoom: 0,
    stageIndex: 0,
    defect: 0,
    patientIndex: 0,
    recipeIndex: 0,
    focusIndex: 0,
    selections: 0,
    inspections: [],
    timer: { running: false, startedAt: null, accumulatedMs: 0, label: def.timerLabel },
    assistance: { requested: false, at: null },
    fault: { reported: false, at: null },
    quality: { reported: false, at: null },
    qcDone: [],
    orderStatus: 0,
    history: [],
    last: null,
    demoStep: 0,
  }
}

let entryId = 0

/** Append one interaction to the mode's history and advance the demo script when relevant. */
export function withHistory(
  state: ModeState,
  def: ModeDefinition,
  entry: Omit<ModeActionEntry, 'id' | 'at'>,
): ModeState {
  const full: ModeActionEntry = { ...entry, id: ++entryId, at: Date.now() }
  const nextStep = def.demo.steps[state.demoStep]
  const advance = entry.status === 'confirmed' && nextStep && nextStep.controlId === entry.controlId
  return {
    ...state,
    last: full,
    history: [full, ...state.history].slice(0, 40),
    demoStep: advance ? Math.min(state.demoStep + 1, def.demo.steps.length) : state.demoStep,
  }
}

export function elapsedMs(timer: ModeState['timer'], now = Date.now()): number {
  return timer.accumulatedMs + (timer.running && timer.startedAt ? Math.max(0, now - timer.startedAt) : 0)
}

export function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function toggleTimer(state: ModeState): ModeState {
  const t = state.timer
  if (t.running && t.startedAt) {
    return { ...state, timer: { ...t, running: false, startedAt: null, accumulatedMs: t.accumulatedMs + Math.max(0, Date.now() - t.startedAt) } }
  }
  return { ...state, timer: { ...t, running: true, startedAt: Date.now() } }
}

export function resetTimer(state: ModeState): ModeState {
  return { ...state, timer: { ...state.timer, running: false, startedAt: null, accumulatedMs: 0 } }
}

export function clearHistory(state: ModeState): ModeState {
  return { ...state, history: [], last: null, demoStep: 0 }
}
