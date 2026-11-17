import { FOOD_MODE } from './config'
import { ORDERS, ORDER_STATES, RECIPES } from './demoData'
import { toggleTimer } from '../state'
import type { ModeControl, ModeReducer, ModeState } from '../types'

const def = FOOD_MODE

export const foodReducer: ModeReducer = (state: ModeState, control: ModeControl) => {
  switch (control.action) {
    case 'SELECT_RECIPE': {
      const recipeIndex = state.panel === 'recipe' ? (state.recipeIndex + 1) % RECIPES.length : state.recipeIndex
      return { state: { ...state, panel: 'recipe', recipeIndex, stepIndex: 0 }, status: 'confirmed', summary: `Demo recipe selected: ${RECIPES[recipeIndex].name}` }
    }
    case 'SHOW_INGREDIENTS':
      return { state: { ...state, panel: 'quantities' }, status: 'confirmed', summary: `Ingredient quantities shown for ${RECIPES[state.recipeIndex].name} (fictional)` }
    case 'NEXT_STEP': {
      const recipe = RECIPES[state.recipeIndex]
      if (state.panel !== 'recipe') return { state, status: 'not-applicable', summary: 'Open the recipe panel before advancing preparation' }
      if (state.stepIndex >= recipe.steps.length - 1) return { state, status: 'not-applicable', summary: 'Preparation already at its final demo step' }
      const stepIndex = state.stepIndex + 1
      return { state: { ...state, stepIndex }, status: 'confirmed', summary: `Preparation step: “${recipe.steps[stepIndex]}”` }
    }
    case 'TOGGLE_TIMER': {
      const next = toggleTimer(state)
      return { state: next, status: 'confirmed', summary: `Cooking timer ${next.timer.running ? 'started' : 'paused'}` }
    }
    case 'NEXT_QC': {
      if (state.checklistIndex >= def.checklist.length) return { state, status: 'not-applicable', summary: 'QC checklist already complete' }
      const checklistIndex = state.checklistIndex + 1
      return { state: { ...state, checklistIndex }, status: 'confirmed', summary: `QC item complete: “${def.checklist[checklistIndex - 1]}”` }
    }
    case 'ADVANCE_ORDER': {
      const orderStatus = Math.min(state.orderStatus + 1, ORDER_STATES.length - 1)
      if (orderStatus === state.orderStatus) return { state, status: 'not-applicable', summary: 'Demo order already marked ready' }
      return {
        state: { ...state, orderStatus, panel: 'orders' },
        status: 'confirmed',
        summary: `${ORDERS[0].id} moved to ${ORDER_STATES[orderStatus]} (simulated)`,
      }
    }
    case 'REQUEST_ASSIST':
      if (state.assistance.requested) return { state, status: 'not-applicable', summary: 'A simulated assistance request is already open' }
      return { state: { ...state, assistance: { requested: true, at: Date.now() } }, status: 'confirmed', summary: 'Simulated assistance request raised — no kitchen system contacted' }
    default:
      return { state, status: 'not-applicable', summary: 'Physical output handled by the shared device controller' }
  }
}
