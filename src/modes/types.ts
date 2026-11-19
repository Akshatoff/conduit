// Mode layer: declarative definitions of operational environments.
//
// A mode NEVER contains its own intent logic. It contributes zone geometry, virtual controls,
// workflow/checklist copy, demo data and a reducer for what an *already authorised* command
// means in that environment. The shared Conduit Core (vision → intent → validation →
// execution) is identical for every mode.

import type { Zone } from '../core/types'

export type ModeId = 'hospital' | 'semiconductor' | 'industrial' | 'food_processing' | 'accessibility'

export type ModeKind = 'digital' | 'physical'

export interface ModeControl {
  /** Zone id in the camera overlay (unique across all modes). */
  id: string
  /** Device id carried by the command. Physical ids are the shared Arduino Uno devices (lighting, access). */
  device: string
  label: string
  /** Short label drawn inside the camera zone. */
  short: string
  kind: ModeKind
  /** Required command action for a digital control. Physical controls omit it (toggle). */
  action?: string
  hint: string
}

export interface WorkflowStep {
  id: string
  title: string
  detail: string
  controlId?: string
}

export interface ModeWorkflow {
  id: string
  title: string
  description: string
  steps: WorkflowStep[]
  /** Optional adapter when the workflow is driven by a different cursor (e.g. process stage). */
  progress?: (state: ModeState) => number
}

export interface DemoStep {
  instruction: string
  expect: string
  controlId?: string
}

export interface ModeDemo {
  title: string
  goal: string
  steps: DemoStep[]
}

export interface ModeTwinDevice {
  id: string
  name: string
  type: 'indicator' | 'actuator' | 'digital'
  source: 'physical' | 'digital'
  description: string
  /** Physical shared device id when source === 'physical'. */
  device?: string
}

export interface ModeDefinition {
  id: ModeId
  name: string
  shortName: string
  tagline: string
  environment: string
  audience: string
  problem: string
  approach: string
  features: string[]
  safety: string[]
  accent: string
  zones: Zone[]
  controls: ModeControl[]
  workflow: ModeWorkflow
  checklistTitle: string
  checklist: string[]
  demo: ModeDemo
  twin: ModeTwinDevice[]
  analytics: string[]
  panels: string[]
  initialPanel: string
  timerLabel: string
  dashboard: ModeId
}

/** Runtime state of one environment (kept per mode so switching back preserves the session). */
export interface ModeState {
  panel: string
  stepIndex: number
  checklistIndex: number
  zoom: number
  stageIndex: number
  defect: number
  patientIndex: number
  recipeIndex: number
  focusIndex: number
  selections: number
  inspections: InspectionRecord[]
  timer: { running: boolean; startedAt: number | null; accumulatedMs: number; label: string }
  assistance: { requested: boolean; at: number | null }
  fault: { reported: boolean; at: number | null }
  quality: { reported: boolean; at: number | null }
  qcDone: number[]
  orderStatus: number
  history: ModeActionEntry[]
  last: ModeActionEntry | null
  demoStep: number
}

export interface InspectionRecord {
  id: string
  at: number
  stage: string
  defect: string
  note: string
}

export interface ModeActionEntry {
  id: number
  at: number
  controlId: string
  device: string
  action: string
  label: string
  summary: string
  status: 'confirmed' | 'not-applicable' | 'rejected'
  source: 'intent' | 'manual' | 'system'
  kind: ModeKind
}

export interface Reduction {
  state: ModeState
  status: 'confirmed' | 'not-applicable'
  summary: string
}

export type ModeReducer = (state: ModeState, control: ModeControl) => Reduction
