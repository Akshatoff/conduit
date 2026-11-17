import { ACCESSIBILITY_MODE } from './accessibility/config'
import { accessibilityReducer } from './accessibility/reducer'
import { FOOD_MODE } from './food/config'
import { foodReducer } from './food/reducer'
import { HOSPITAL_MODE } from './hospital/config'
import { hospitalReducer } from './hospital/reducer'
import { INDUSTRIAL_MODE } from './industrial/config'
import { industrialReducer } from './industrial/reducer'
import { SEMICONDUCTOR_MODE } from './semiconductor/config'
import { semiconductorReducer } from './semiconductor/reducer'
import { initialModeState } from './state'
import type { ModeControl, ModeDefinition, ModeId, ModeReducer, ModeState } from './types'

/** Presentation order on the environment-selection screen. */
export const MODES: ModeDefinition[] = [HOSPITAL_MODE, SEMICONDUCTOR_MODE, INDUSTRIAL_MODE, FOOD_MODE, ACCESSIBILITY_MODE]

export const MODE_REDUCERS: Record<ModeId, ModeReducer> = {
  hospital: hospitalReducer,
  semiconductor: semiconductorReducer,
  industrial: industrialReducer,
  food_processing: foodReducer,
  accessibility: accessibilityReducer,
}

export const MODE_IDS = MODES.map((m) => m.id)

export function getMode(id: string | null | undefined): ModeDefinition | null {
  if (!id) return null
  return MODES.find((m) => m.id === id) ?? null
}

export function initialModeStates(): Record<ModeId, ModeState> {
  return Object.fromEntries(MODES.map((m) => [m.id, initialModeState(m)])) as Record<ModeId, ModeState>
}

export function controlByDevice(mode: ModeDefinition, device: string): ModeControl | undefined {
  return mode.controls.find((c) => c.device === device)
}

export function digitalControl(mode: ModeDefinition, device: string): ModeControl | undefined {
  return mode.controls.find((c) => c.kind === 'digital' && c.device === device)
}
