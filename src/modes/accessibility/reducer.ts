import { CONTENT_ITEMS } from './demoData'
import type { ModeControl, ModeReducer, ModeState } from '../types'

export const accessibilityReducer: ModeReducer = (state: ModeState, control: ModeControl) => {
  switch (control.action) {
    case 'NEXT_ITEM': {
      const focusIndex = (state.focusIndex + 1) % CONTENT_ITEMS.length
      return { state: { ...state, focusIndex, panel: 'grid' }, status: 'confirmed', summary: `Focus moved to ${CONTENT_ITEMS[focusIndex].title}` }
    }
    case 'SELECT_ITEM':
      return {
        state: { ...state, selections: state.selections + 1, panel: 'grid' },
        status: 'confirmed',
        summary: `${CONTENT_ITEMS[state.focusIndex].title} selected deliberately (selection ${state.selections + 1})`,
      }
    case 'READ_ITEM':
      return { state: { ...state, panel: 'reading' }, status: 'confirmed', summary: `Reading view opened for ${CONTENT_ITEMS[state.focusIndex].title}` }
    case 'BACK':
      return { state: { ...state, panel: 'grid' }, status: 'confirmed', summary: 'Returned to the large panel grid' }
    default:
      return { state, status: 'not-applicable', summary: 'Physical output handled by the shared device controller' }
  }
}
