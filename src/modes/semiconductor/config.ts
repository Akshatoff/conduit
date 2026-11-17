import { railZones } from '../layout'
import type { ModeControl, ModeDefinition, ModeState } from '../types'
import { CHECKLIST, DEFECT_CATEGORIES, PROCESS_STAGES } from './demoData'

const controls: ModeControl[] = [
  { id: 'semi.stage', device: 'semi.stage', label: 'Process stage', short: 'NEXT STAGE', kind: 'digital', action: 'ADVANCE_STAGE', hint: 'Advance the simulated wafer-processing sequence.' },
  { id: 'semi.inspect', device: 'semi.inspect', label: 'Wafer inspection', short: 'INSPECT', kind: 'digital', action: 'INSPECT', hint: 'Open the fictional wafer map; select again to cycle zoom.' },
  { id: 'semi.defect', device: 'semi.defect', label: 'Defect category', short: 'DEFECT', kind: 'digital', action: 'CYCLE_DEFECT', hint: 'Cycle the fictional sample defect categories.' },
  { id: 'semi.record', device: 'semi.record', label: 'Confirm inspection', short: 'CONFIRM', kind: 'digital', action: 'CONFIRM_INSPECTION', hint: 'Append a simulated inspection record.' },
  { id: 'semi.checklist', device: 'semi.checklist', label: 'Manufacturing checklist', short: 'CHECKLIST', kind: 'digital', action: 'NEXT_CHECK', hint: 'Move to the next manufacturing checklist item.' },
  { id: 'semi.equipment', device: 'lighting', label: 'Equipment status LED', short: 'EQUIP LED', kind: 'physical', hint: 'Shared low-voltage LED representing equipment status.' },
  { id: 'semi.ventilation', device: 'ventilation', label: 'Ventilation indicator', short: 'VENT FAN', kind: 'physical', hint: 'Small DC fan representing a ventilation indicator.' },
  { id: 'semi.access', device: 'access', label: 'Model access latch', short: 'ACCESS', kind: 'physical', hint: 'SG90 servo driving a model access mechanism.' },
]

export const SEMICONDUCTOR_MODE: ModeDefinition = {
  id: 'semiconductor',
  name: 'Semiconductor / Cleanroom Workstation',
  shortName: 'Semiconductor',
  tagline: 'Navigate process instructions and inspection data with gloved hands.',
  environment: 'Simulated cleanroom workstation · controlled manufacturing area',
  audience: 'Process technicians, equipment operators, inspection staff',
  problem:
    'In controlled manufacturing areas, staff wear protective clothing and gloves and often carry tools. Reaching for a keyboard or touchscreen can interrupt a documented procedure and add friction to an environment where surfaces are controlled.',
  approach:
    'Conduit turns a workstation display into an intent-aware control surface: a technician activates interaction, moves toward the next process card, and pinches to open the inspection view or confirm a simulated record. The shared Intent Engine evaluates trajectory, stability, dwell and confidence before any action is authorised.',
  features: [
    'Simulated wafer-processing workflow across five stages',
    'Process-stage navigation without touching the screen',
    'Fictional wafer inspection map with zoom',
    'Sample defect-category selection',
    'Manufacturing checklist and process history',
    'Equipment status dashboard with simulated readings',
    'LED equipment indicator, ventilation fan and servo access mechanism',
    'Explicit simulated-vs-physical labelling throughout',
  ],
  safety: [
    'No connection to semiconductor manufacturing equipment, MES, or safety systems.',
    'No cleanroom certification, contamination-prevention claim or process validation is made.',
    'Wafer map, defect categories and equipment readings are fictional demonstration data.',
    'Hardware driver: low-voltage LED, small DC fan and an SG90 model latch only.',
  ],
  accent: '#42d6c5',
  controls,
  zones: railZones(controls),
  workflow: {
    id: 'wafer-inspection',
    title: 'Simulated wafer inspection round',
    description: 'Advance through the fictional process stages, inspect the sample wafer, select a defect category and confirm a simulated inspection record.',
    steps: PROCESS_STAGES.map((s, i) => ({
      id: s.id,
      title: `${i + 1}. ${s.name}`,
      detail: s.detail,
      controlId: i === 0 ? 'semi.stage' : undefined,
    })),
    progress: (state: ModeState) => state.stageIndex,
  },
  checklistTitle: 'Manufacturing checklist (simulated)',
  checklist: CHECKLIST,
  demo: {
    title: 'Process stage → inspection → record',
    goal: 'Demonstrate the complete intended workflow, then show that a careless sweep is rejected.',
    steps: [
      { instruction: 'Activate with a still open palm.', expect: 'The same shared Intent Engine used by every mode becomes active.' },
      { instruction: 'Select NEXT STAGE and pinch.', expect: 'The process rail advances one stage (digital ACK, no equipment command).' },
      { instruction: 'Select INSPECT and pinch.', expect: 'The fictional wafer map opens in the workstation dashboard.' },
      { instruction: 'Select INSPECT again to cycle zoom.', expect: 'Selection alone does nothing; a fresh pinch is required each time.' },
      { instruction: `Select DEFECT and pinch (${DEFECT_CATEGORIES.length} sample categories).`, expect: 'The highlighted fictional category changes.' },
      { instruction: 'Select CONFIRM and pinch.', expect: 'A simulated inspection record is appended with the current stage and category.' },
      { instruction: 'Select EQUIP LED or VENT FAN.', expect: 'The physical node is commanded; the twin only shows ON after ACK + read-back.' },
      { instruction: 'Sweep across the control row without dwelling.', expect: 'Nothing executes — TRANSIT rejection in the interaction history.' },
    ],
  },
  twin: [
    { id: 'semi.stage', name: 'Process stage', type: 'digital', source: 'digital', description: 'Current simulated process stage. Digital UI state.' },
    { id: 'semi.inspection', name: 'Inspection record layer', type: 'digital', source: 'digital', description: 'Simulated records appended in this session (no MES connection).' },
    { id: 'semi.equipment', name: 'Equipment status LED', type: 'actuator', source: 'physical', device: 'lighting', description: 'Low-voltage LED. Confirmed only after the node ACK and state read-back.' },
    { id: 'semi.ventilation', name: 'Ventilation indicator', type: 'actuator', source: 'physical', device: 'ventilation', description: 'Small DC fan representing ventilation state; not a real airflow control.' },
    { id: 'semi.access', name: 'Model access latch', type: 'actuator', source: 'physical', device: 'access', description: 'SG90 servo on a model latch; not a door or interlock.' },
  ],
  analytics: ['Stages advanced', 'Inspection images opened', 'Defect categories selected', 'Simulated records confirmed', 'Physical ACK rate'],
  panels: ['process', 'inspection', 'equipment'],
  initialPanel: 'process',
  timerLabel: 'Inspection timer',
  dashboard: 'semiconductor',
}
