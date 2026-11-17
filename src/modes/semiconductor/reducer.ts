import { SEMICONDUCTOR_MODE } from './config'
import { DEFECT_CATEGORIES, PROCESS_STAGES } from './demoData'
import type { ModeReducer, ModeState, ModeControl } from '../types'

const def = SEMICONDUCTOR_MODE

export const semiconductorReducer: ModeReducer = (state: ModeState, control: ModeControl) => {
  switch (control.action) {
    case 'ADVANCE_STAGE': {
      if (state.stageIndex >= PROCESS_STAGES.length - 1) {
        return { state, status: 'not-applicable', summary: 'Final simulated stage already reached — no next stage' }
      }
      const stageIndex = state.stageIndex + 1
      return { state: { ...state, stageIndex, panel: 'process' }, status: 'confirmed', summary: `Process stage advanced to ${PROCESS_STAGES[stageIndex].name} (${PROCESS_STAGES[stageIndex].code})` }
    }
    case 'INSPECT': {
      if (state.panel !== 'inspection') {
        return { state: { ...state, panel: 'inspection' }, status: 'confirmed', summary: 'Opened the fictional wafer inspection map' }
      }
      const zoom = (state.zoom + 1) % 3
      return { state: { ...state, zoom }, status: 'confirmed', summary: `Wafer map zoom ${zoom === 0 ? 'reset' : `set to ${zoom + 1}×`}` }
    }
    case 'CYCLE_DEFECT': {
      const defect = (state.defect + 1) % DEFECT_CATEGORIES.length
      return {
        state: { ...state, defect, panel: 'inspection' },
        status: 'confirmed',
        summary: `Fictional defect category selected: ${DEFECT_CATEGORIES[defect].label}`,
      }
    }
    case 'CONFIRM_INSPECTION': {
      if (state.panel !== 'inspection') {
        return { state, status: 'not-applicable', summary: 'Open the wafer inspection view before confirming a record' }
      }
      const stage = PROCESS_STAGES[state.stageIndex].name
      const defect = DEFECT_CATEGORIES[state.defect].label
      const record = {
        id: `SIM-${String(state.inspections.length + 1).padStart(3, '0')}`,
        at: Date.now(),
        stage,
        defect,
        note: 'Simulated inspection record — fictional data',
      }
      return {
        state: { ...state, inspections: [record, ...state.inspections].slice(0, 12), panel: 'inspection' },
        status: 'confirmed',
        summary: `Simulated inspection record ${record.id} confirmed (${stage} · ${defect})`,
      }
    }
    case 'NEXT_CHECK': {
      if (state.checklistIndex >= def.checklist.length) {
        return { state, status: 'not-applicable', summary: 'Manufacturing checklist already complete' }
      }
      const checklistIndex = state.checklistIndex + 1
      return { state: { ...state, checklistIndex }, status: 'confirmed', summary: `Checklist item complete: “${def.checklist[checklistIndex - 1]}”` }
    }
    default:
      return { state, status: 'not-applicable', summary: 'Physical output is handled by the shared device controller' }
  }
}
