import { railZones } from '../layout'
import type { ModeControl, ModeDefinition } from '../types'
import { INSPECTION_STEPS, MANUAL_STEPS } from './demoData'

const controls: ModeControl[] = [
  { id: 'industrial.manual', device: 'industrial.manual', label: 'Maintenance manual', short: 'MANUAL', kind: 'digital', action: 'OPEN_MANUAL', hint: 'Open the digital maintenance manual panel.' },
  { id: 'industrial.step', device: 'industrial.step', label: 'Next repair step', short: 'NEXT STEP', kind: 'digital', action: 'NEXT_STEP', hint: 'Advance the repair procedure.' },
  { id: 'industrial.complete', device: 'industrial.complete', label: 'Mark step complete', short: 'COMPLETE', kind: 'digital', action: 'COMPLETE_STEP', hint: 'Complete the current simulated inspection step.' },
  { id: 'industrial.fault', device: 'industrial.fault', label: 'Report fault', short: 'FAULT', kind: 'digital', action: 'REPORT_FAULT', hint: 'Raise a simulated fault report (no CMMS contact).' },
  { id: 'industrial.timer', device: 'industrial.timer', label: 'Maintenance timer', short: 'TIMER', kind: 'digital', action: 'TOGGLE_TIMER', hint: 'Start or pause the maintenance timer.' },
  { id: 'industrial.assist', device: 'industrial.assist', label: 'Request assistance', short: 'ASSIST', kind: 'digital', action: 'REQUEST_ASSIST', hint: 'Send a simulated assistance request.' },
  { id: 'industrial.torch', device: 'torch', label: 'Equipment torch', short: 'EQUIP TORCH', kind: 'physical', hint: 'Phone torch representing operating state.' },
  { id: 'industrial.buzz', device: 'vibration', label: 'Service access buzz', short: 'ACCESS BUZZ', kind: 'physical', hint: 'Phone vibration motor as the demonstration access alert.' },
]

export const INDUSTRIAL_MODE: ModeDefinition = {
  id: 'industrial',
  name: 'Industrial Maintenance / Field Operations',
  shortName: 'Industrial',
  tagline: 'Follow procedures while your hands are on the equipment.',
  environment: 'Equipment service bay · field maintenance',
  audience: 'Maintenance technicians, field service engineers, inspectors',
  problem:
    'Technicians frequently need instructions, readings or a checklist while holding tools, wearing gloves, or standing at a machine. Touching a laptop or panel mid-task costs time and attention.',
  approach:
    'Conduit keeps the maintenance manual, readings and checklist available as an intent-aware surface. The technician approaches a control deliberately and pinches to confirm; a passing hand movement never changes a step.',
  features: [
    'Simulated equipment monitoring dashboard',
    'Digital maintenance manual and repair-step navigation',
    'Inspection checklist completion',
    'Maintenance timer and simulated fault report',
    'Simulated assistance request',
    'Phone torch indicator and vibration access alert',
    'Maintenance history derived from actual attempts',
  ],
  safety: [
    'No connection to real industrial machinery, PLCs, interlocks or safety systems.',
    'Readings and fault reports are fictional demonstration values.',
    'Isolation and lock-off steps in the demo text are placeholders, not instructions.',
    'Only the phone torch and vibration motor are actuated.',
  ],
  accent: '#f5b942',
  controls,
  zones: railZones(controls),
  workflow: {
    id: 'maintenance-inspection',
    title: 'Simulated maintenance inspection',
    description: 'Work through a representative field-maintenance sequence using only contactless intent.',
    steps: MANUAL_STEPS.map((s, i) => ({ id: s.id, title: `${i + 1}. ${s.title}`, detail: s.detail, controlId: i === 0 ? 'industrial.manual' : undefined })),
  },
  checklistTitle: 'Inspection checklist (simulated)',
  checklist: INSPECTION_STEPS,
  demo: {
    title: 'Inspect → report → request support',
    goal: 'Demonstrate procedure navigation while hands are occupied, and a rejected careless movement.',
    steps: [
      { instruction: 'Activate with a still open palm.', expect: 'Shared Intent Engine active — no mode-specific shortcuts.' },
      { instruction: 'Select MANUAL and pinch.', expect: 'The maintenance manual panel opens with the current step highlighted.' },
      { instruction: 'Select NEXT STEP twice.', expect: 'Each step needs its own selection, dwell and pinch.' },
      { instruction: 'Select COMPLETE and pinch.', expect: 'The current inspection checklist item is marked complete.' },
      { instruction: 'Select FAULT and pinch.', expect: 'A simulated fault report is raised — clearly not sent anywhere.' },
      { instruction: 'Select ASSIST and pinch.', expect: 'Simulated assistance request appears in history.' },
      { instruction: 'Sweep across the controls.', expect: 'Nothing changes; TRANSIT rejection is recorded.' },
    ],
  },
  twin: [
    { id: 'industrial.unit', name: 'Equipment unit', type: 'digital', source: 'digital', description: 'Simulated asset state and readings. Fictional data.' },
    { id: 'industrial.step', name: 'Procedure step', type: 'digital', source: 'digital', description: 'Current demonstration maintenance step.' },
    { id: 'industrial.fault', name: 'Fault report channel', type: 'digital', source: 'digital', description: 'Simulated report flag; no CMMS or operator is contacted.' },
    { id: 'industrial.torch', name: 'Equipment torch', type: 'actuator', source: 'physical', device: 'torch', description: 'Phone rear torch; acknowledged over ADB, no read-back available.' },
    { id: 'industrial.buzz', name: 'Service access buzz', type: 'actuator', source: 'physical', device: 'vibration', description: 'Phone vibration motor; acknowledged only — never a machine guard or interlock.' },
  ],
  analytics: ['Procedure steps advanced', 'Checklist items completed', 'Fault reports raised', 'Assistance requests', 'Physical ACK rate'],
  panels: ['monitor', 'manual', 'history'],
  initialPanel: 'monitor',
  timerLabel: 'Maintenance timer',
  dashboard: 'industrial',
}
