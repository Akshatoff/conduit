import { HOSPITAL_MODE } from './config'
import { PATIENTS } from './demoData'
import { toggleTimer } from '../state'
import type { ModeControl, ModeReducer, ModeState } from '../types'

const def = HOSPITAL_MODE

export const hospitalReducer: ModeReducer = (state: ModeState, control: ModeControl) => {
  switch (control.action) {
    case 'OPEN_OVERVIEW': {
      const cycling = state.panel === 'overview'
      const patientIndex = cycling ? (state.patientIndex + 1) % PATIENTS.length : state.patientIndex
      return {
        state: { ...state, panel: 'overview', patientIndex },
        status: 'confirmed',
        summary: cycling
          ? `Overview already open — switched to fictional record ${PATIENTS[patientIndex].id}`
          : `Opened fictional patient overview ${PATIENTS[patientIndex].id}`,
      }
    }
    case 'OPEN_RECORDS':
      return { state: { ...state, panel: 'records' }, status: 'confirmed', summary: `Opened the fictional record list for ${PATIENTS[state.patientIndex].id}` }
    case 'CYCLE_IMAGING': {
      if (state.panel !== 'imaging') return { state: { ...state, panel: 'imaging' }, status: 'confirmed', summary: 'Opened the local X-ray panel' }
      const zoom = (state.zoom + 1) % 3
      return { state: { ...state, zoom }, status: 'confirmed', summary: `Local X-ray zoom ${zoom === 0 ? 'reset' : `set to ${zoom + 1}×`}` }
    }
    case 'ADVANCE_CHECKLIST': {
      if (state.checklistIndex >= def.checklist.length) {
        return { state, status: 'not-applicable', summary: 'Checklist already complete — no task to advance' }
      }
      const checklistIndex = state.checklistIndex + 1
      return { state: { ...state, checklistIndex }, status: 'confirmed', summary: `Checklist task completed: “${def.checklist[checklistIndex - 1]}”` }
    }
    case 'NEXT_PROCEDURE': {
      if (state.stepIndex >= def.workflow.steps.length - 1) {
        return { state, status: 'not-applicable', summary: 'Procedure already at its final demonstration step' }
      }
      const stepIndex = state.stepIndex + 1
      return { state: { ...state, stepIndex }, status: 'confirmed', summary: `Procedure advanced to “${def.workflow.steps[stepIndex].title}”` }
    }
    case 'TOGGLE_TIMER': {
      const next = toggleTimer(state)
      return { state: next, status: 'confirmed', summary: `Workstation timer ${next.timer.running ? 'started' : 'paused'}` }
    }
    case 'REQUEST_ASSIST':
      if (state.assistance.requested) return { state, status: 'not-applicable', summary: 'A simulated assistance request is already open' }
      return {
        state: { ...state, assistance: { requested: true, at: Date.now() } },
        status: 'confirmed',
        summary: 'Simulated assistance request raised — no hospital system was contacted',
      }
    default:
      return { state, status: 'not-applicable', summary: 'Control has no digital effect' }
  }
}
