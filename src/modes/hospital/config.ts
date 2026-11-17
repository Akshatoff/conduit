import { railZones } from '../layout'
import type { ModeControl, ModeDefinition } from '../types'

const controls: ModeControl[] = [
  { id: 'hospital.overview', device: 'hospital.overview', label: 'Patient overview', short: 'OVERVIEW', kind: 'digital', action: 'OPEN_OVERVIEW', hint: 'Bring the fictional patient summary to the front.' },
  { id: 'hospital.records', device: 'hospital.records', label: 'Clinical records', short: 'RECORDS', kind: 'digital', action: 'OPEN_RECORDS', hint: 'Scrolling record list (fictional entries).' },
  { id: 'hospital.imaging', device: 'hospital.imaging', label: 'Imaging viewer', short: 'IMAGING', kind: 'digital', action: 'CYCLE_IMAGING', hint: 'Open the sample image; select again to cycle zoom.' },
  { id: 'hospital.checklist', device: 'hospital.checklist', label: 'Task checklist', short: 'CHECKLIST', kind: 'digital', action: 'ADVANCE_CHECKLIST', hint: 'Mark the next preparation task complete.' },
  { id: 'hospital.procedure', device: 'hospital.procedure', label: 'Procedure step', short: 'PROCEDURE', kind: 'digital', action: 'NEXT_PROCEDURE', hint: 'Advance the demonstration procedure.' },
  { id: 'hospital.timer', device: 'hospital.timer', label: 'Workstation timer', short: 'TIMER', kind: 'digital', action: 'TOGGLE_TIMER', hint: 'Start or pause the non-clinical timer.' },
  { id: 'hospital.assist', device: 'hospital.assist', label: 'Request assistance', short: 'ASSIST', kind: 'digital', action: 'REQUEST_ASSIST', hint: 'Send a simulated assistance request.' },
  { id: 'hospital.lamp', device: 'lighting', label: 'Workstation lamp', short: 'LAMP', kind: 'physical', hint: 'Shared low-voltage LED output on the demonstration node.' },
]

export const HOSPITAL_MODE: ModeDefinition = {
  id: 'hospital',
  name: 'Hospital / Clinical Workstation',
  shortName: 'Hospital',
  tagline: 'Navigate clinical information without leaving the bedside.',
  environment: 'Ward workstation · shared clinical display',
  audience: 'Doctors, nurses, laboratory and clinical support staff',
  problem:
    'Staff often need to check information while their hands are occupied with a clinical task. Repeatedly touching a shared workstation interrupts the workflow and adds another surface to clean.',
  approach:
    'Conduit lets a clinician activate the display with an open palm, select an information panel by moving toward it, and open it with a pinch — while the shared screen stays untouched.',
  features: [
    'Fictional patient overview with clearly labelled demo vitals',
    'Records and information panels',
    'Sample imaging viewer with gesture-selected zoom',
    'Task checklist and procedure-step navigation',
    'Non-clinical workstation timer',
    'Simulated assistance request',
    'Per-attempt interaction history',
    'Shared low-voltage lamp output',
  ],
  safety: [
    'All patient information in this environment is fictional demonstration data.',
    'No connection to real patient records, no diagnosis support, no medical device control.',
    'A research prototype for information navigation — not a certified healthcare product.',
    'Selecting a panel never executes without dwell, confidence and pinch confirmation.',
  ],
  accent: '#4da3ff',
  controls,
  zones: railZones(controls),
  workflow: {
    id: 'clinical-round',
    title: 'Bedside information round',
    description: 'A fictional review sequence: identify the panel, read the summary, open the sample image, work through the checklist and log the handover step.',
    steps: [
      { id: 'summary', title: 'Open the patient overview', detail: 'Confirm which fictional patient is shown and read the demo summary.', controlId: 'hospital.overview' },
      { id: 'records', title: 'Check recent records', detail: 'Open the record list and note the latest fictional entry.', controlId: 'hospital.records' },
      { id: 'imaging', title: 'Open the sample image', detail: 'Open the imaging panel and zoom once. The image is a placeholder.', controlId: 'hospital.imaging' },
      { id: 'checklist', title: 'Work the preparation checklist', detail: 'Complete the next task using deliberate selection + pinch.', controlId: 'hospital.checklist' },
      { id: 'procedure', title: 'Advance the procedure', detail: 'Move the demonstration procedure to the next step.', controlId: 'hospital.procedure' },
      { id: 'timer', title: 'Start the workstation timer', detail: 'A non-clinical example of a stateful control.', controlId: 'hospital.timer' },
    ],
  },
  checklistTitle: 'Preparation checklist (fictional)',
  checklist: [
    'Confirm fictional patient identity on screen',
    'Review the demo observation summary',
    'Open the sample imaging panel',
    'Check the demonstration task list',
    'Record a fictional handover note',
  ],
  demo: {
    title: 'Bedside information round',
    goal: 'Show that a clinician can navigate the workstation without touching it, and that an accidental sweep is rejected.',
    steps: [
      { instruction: 'Hold a still open palm to activate the workstation.', expect: 'Interaction becomes active; the shared Intent Engine is running.' },
      { instruction: 'Move deliberately toward OVERVIEW and hold.', expect: 'Dwell and stability are evaluated before the panel can be selected.' },
      { instruction: 'Pinch to confirm.', expect: 'The pipeline validates intent, then the overview panel opens (digital ACK).' },
      { instruction: 'Select RECORDS, then IMAGING and pinch.', expect: 'Each panel change passes through selection + confirmation.' },
      { instruction: 'Select CHECKLIST and pinching moves the task on.', expect: 'One deliberate action, one checklist step — no duplicates.' },
      { instruction: 'Sweep a flat hand across the row instead of dwelling.', expect: 'No panel opens. The log records TRANSIT with a reason.' },
      { instruction: 'Select TIMER or ASSIST to show stateful, non-clinical controls.', expect: 'Timer toggles / assistance request is clearly marked simulated.' },
    ],
  },
  twin: [
    { id: 'hospital.display', name: 'Workstation display', type: 'digital', source: 'digital', description: 'Which fictional panel is open. Digital UI state, not a medical device.' },
    { id: 'hospital.timer', name: 'Workstation timer', type: 'digital', source: 'digital', description: 'Non-clinical timer state driven by an authorised selection.' },
    { id: 'hospital.assist', name: 'Assistance channel', type: 'digital', source: 'digital', description: 'Simulated request only — nothing is transmitted to a hospital system.' },
    { id: 'hospital.lamp', name: 'Workstation lamp', type: 'actuator', source: 'physical', device: 'lighting', description: 'Shared low-voltage LED; state only confirmed after node ACK + read-back.' },
  ],
  analytics: ['Panels opened', 'Checklist steps completed', 'Accidental sweeps rejected', 'Assistance requests', 'Intent confidence at confirmation'],
  panels: ['overview', 'records', 'imaging'],
  initialPanel: 'overview',
  timerLabel: 'Workstation timer',
  dashboard: 'hospital',
}
