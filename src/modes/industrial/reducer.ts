import { INDUSTRIAL_MODE } from './config'
import { MANUAL_STEPS } from './demoData'
import { toggleTimer } from '../state'
import type { ModeControl, ModeReducer, ModeState } from '../types'

const def = INDUSTRIAL_MODE

export const industrialReducer: ModeReducer = (state: ModeState, control: ModeControl) => {
  switch (control.action) {
    case 'OPEN_MANUAL':
      return { state: { ...state, panel: 'manual' }, status: 'confirmed', summary: `Maintenance manual opened at step ${state.stepIndex + 1}: ${MANUAL_STEPS[state.stepIndex].title}` }
    case 'NEXT_STEP': {
      if (state.panel !== 'manual') return { state, status: 'not-applicable', summary: 'Open the maintenance manual before advancing a step' }
      if (state.stepIndex >= MANUAL_STEPS.length - 1) return { state, status: 'not-applicable', summary: 'Last demonstration step already reached' }
      const stepIndex = state.stepIndex + 1
      return { state: { ...state, stepIndex }, status: 'confirmed', summary: `Repair step advanced to “${MANUAL_STEPS[stepIndex].title}”` }
    }
    case 'COMPLETE_STEP': {
      if (state.checklistIndex >= def.checklist.length) return { state, status: 'not-applicable', summary: 'Inspection checklist already complete' }
      const checklistIndex = state.checklistIndex + 1
      return { state: { ...state, checklistIndex }, status: 'confirmed', summary: `Inspection step completed: “${def.checklist[checklistIndex - 1]}”` }
    }
    case 'REPORT_FAULT':
      if (state.fault.reported) return { state, status: 'not-applicable', summary: 'A simulated fault report is already open' }
      return {
        state: { ...state, fault: { reported: true, at: Date.now() }, panel: 'history' },
        status: 'confirmed',
        summary: 'Simulated fault report raised — no maintenance system was contacted',
      }
    case 'TOGGLE_TIMER': {
      const next = toggleTimer(state)
      return { state: next, status: 'confirmed', summary: `Maintenance timer ${next.timer.running ? 'started' : 'paused'}` }
    }
    case 'REQUEST_ASSIST':
      if (state.assistance.requested) return { state, status: 'not-applicable', summary: 'A simulated assistance request is already open' }
      return {
        state: { ...state, assistance: { requested: true, at: Date.now() } },
        status: 'confirmed',
        summary: 'Simulated assistance request raised — nobody was contacted',
      }
    default:
      return { state, status: 'not-applicable', summary: 'Physical output handled by the shared device controller' }
  }
}
