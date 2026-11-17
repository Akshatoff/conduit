import { railZones } from '../layout'
import type { ModeControl, ModeDefinition } from '../types'
import { CONTENT_ITEMS } from './demoData'

const controls: ModeControl[] = [
  { id: 'access.next', device: 'access.next', label: 'Next panel', short: 'NEXT', kind: 'digital', action: 'NEXT_ITEM', hint: 'Move the focus ring to the next panel.' },
  { id: 'access.select', device: 'access.select', label: 'Select panel', short: 'SELECT', kind: 'digital', action: 'SELECT_ITEM', hint: 'Choose the focused panel.' },
  { id: 'access.read', device: 'access.read', label: 'Read panel', short: 'READ', kind: 'digital', action: 'READ_ITEM', hint: 'Show the focused content in a larger reading view.' },
  { id: 'access.back', device: 'access.back', label: 'Back', short: 'BACK', kind: 'digital', action: 'BACK', hint: 'Return to the panel grid.' },
  { id: 'access.lamp', device: 'lighting', label: 'Desk lamp', short: 'LAMP', kind: 'physical', hint: 'Optional low-voltage lamp output.' },
]

export const ACCESSIBILITY_MODE: ModeDefinition = {
  id: 'accessibility',
  name: 'Accessibility / Adaptive Interaction',
  shortName: 'Accessibility',
  tagline: 'Configure the interaction, not the person.',
  environment: 'Adaptive desktop · configurable interaction surface',
  audience: 'Users and support staff exploring alternative computer input',
  problem:
    'A single fixed interaction method excludes people. Dwell time, control size, confidence thresholds and confirmation gestures that suit one person can make an interface unusable for another.',
  approach:
    'This mode exposes the Intent Engine’s parameters directly: dwell time, confidence threshold, stability requirement, confirmation gesture and control size. The same engine runs underneath, so changes are visible and explainable rather than hidden.',
  features: [
    'Five deliberately large virtual controls',
    'Adjustable dwell time and confidence threshold',
    'Adjustable hand-stability requirement',
    'Alternative confirmation gesture',
    'Large / standard control-surface presets',
    'Clear textual and visual feedback for every state',
    'Optional low-voltage desk lamp output',
  ],
  safety: [
    'Gesture interaction is not suitable for every person or every disability.',
    'No claim of clinical or therapeutic benefit is made.',
    'Configuration changes affect the same shared Intent Engine, not a separate simplified one.',
    'This mode demonstrates configurability — it has not been co-designed with disabled users.',
  ],
  accent: '#b18cff',
  controls,
  zones: railZones(controls),
  workflow: {
    id: 'adaptive-browse',
    title: 'Adaptive browsing sequence',
    description: 'Move focus, select a panel, open the reading view and return — with settings that can be changed at any point.',
    steps: [
      { id: 'next', title: 'Move the focus ring', detail: 'Use NEXT to move between large demo panels.', controlId: 'access.next' },
      { id: 'select', title: 'Select the focused panel', detail: 'Confirm with the configured confirmation gesture.', controlId: 'access.select' },
      { id: 'read', title: 'Open the larger reading view', detail: 'The same content, presented with larger text.', controlId: 'access.read' },
      { id: 'back', title: 'Return to the grid', detail: 'Go back and continue browsing.', controlId: 'access.back' },
    ],
  },
  checklistTitle: 'Configuration checklist',
  checklist: [
    'Set a dwell time that is comfortable',
    'Choose a confidence threshold',
    'Pick a confirmation gesture you can perform',
    'Try the large control preset',
    'Confirm every state is readable',
  ],
  demo: {
    title: 'Configure → browse → confirm',
    goal: 'Show that interaction parameters are adjustable and that the same engine honours them.',
    steps: [
      { instruction: 'Adjust dwell time and minimum confidence in the panel.', expect: 'The Intent Engine config updates live without restarting the camera.' },
      { instruction: 'Activate with the configured activation gesture.', expect: 'The activation progress is shown textually and visually.' },
      { instruction: 'Select NEXT and pinch to move focus.', expect: `Focus advances through ${CONTENT_ITEMS.length} large demo panels.` },
      { instruction: 'Select SELECT and pinch.', expect: 'The focused panel is recorded as the deliberate choice.' },
      { instruction: 'Change the confirmation gesture, then repeat.', expect: 'The new gesture is required for the next confirmation.' },
      { instruction: 'Select the large-control preset.', expect: 'Zones grow; no duplicate engine or camera restart occurs.' },
    ],
  },
  twin: [
    { id: 'access.focus', name: 'Focus indicator', type: 'digital', source: 'digital', description: 'Current focus position in the demo panel grid.' },
    { id: 'access.selection', name: 'Selected content', type: 'digital', source: 'digital', description: 'Last deliberately selected demo panel.' },
    { id: 'access.lamp', name: 'Desk lamp', type: 'actuator', source: 'physical', device: 'lighting', description: 'Optional low-voltage LED, confirmed only after ACK + read-back.' },
  ],
  analytics: ['Panels focused', 'Deliberate selections', 'Config changes', 'Rejected movements', 'Intent latency'],
  panels: ['grid', 'reading', 'settings'],
  initialPanel: 'grid',
  timerLabel: 'Session timer',
  dashboard: 'accessibility',
}
