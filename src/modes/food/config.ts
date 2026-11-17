import { railZones } from '../layout'
import type { ModeControl, ModeDefinition } from '../types'
import { ORDER_STATES, QC_ITEMS, RECIPES } from './demoData'

const controls: ModeControl[] = [
  { id: 'food.recipe', device: 'food.recipe', label: 'Recipe selector', short: 'RECIPE', kind: 'digital', action: 'SELECT_RECIPE', hint: 'Open the recipe panel; select again to cycle demo recipes.' },
  { id: 'food.step', device: 'food.step', label: 'Preparation step', short: 'NEXT STEP', kind: 'digital', action: 'NEXT_STEP', hint: 'Advance the preparation steps.' },
  { id: 'food.qty', device: 'food.qty', label: 'Ingredient quantities', short: 'INGREDIENTS', kind: 'digital', action: 'SHOW_INGREDIENTS', hint: 'Show the ingredient quantity panel.' },
  { id: 'food.timer', device: 'food.timer', label: 'Cooking timer', short: 'TIMER', kind: 'digital', action: 'TOGGLE_TIMER', hint: 'Start or pause the demonstration timer.' },
  { id: 'food.qc', device: 'food.qc', label: 'QC checklist', short: 'QC CHECK', kind: 'digital', action: 'NEXT_QC', hint: 'Mark the next quality-control item complete.' },
  { id: 'food.order', device: 'food.order', label: 'Order status', short: 'ORDER', kind: 'digital', action: 'ADVANCE_ORDER', hint: 'Advance a simulated order status.' },
  { id: 'food.assist', device: 'food.assist', label: 'Request assistance', short: 'ASSIST', kind: 'digital', action: 'REQUEST_ASSIST', hint: 'Send a simulated assistance request.' },
  { id: 'food.lamp', device: 'lighting', label: 'Pass lamp', short: 'PASS LAMP', kind: 'physical', hint: 'Shared low-voltage LED used as a simulated pass indicator.' },
]

export const FOOD_MODE: ModeDefinition = {
  id: 'food_processing',
  name: 'Food Processing / Commercial Kitchen',
  shortName: 'Food Processing',
  tagline: 'Follow a recipe and timer without touching a shared screen.',
  environment: 'Commercial kitchen · preparation line',
  audience: 'Kitchen staff, preparation workers, quality checkers',
  problem:
    'Shared screens in busy kitchens get touched repeatedly during service, often with wet or occupied hands. Staff also need both hands free while following preparation steps.',
  approach:
    'Conduit lets a worker activate a recipe display, move to the next step, check quantities and start a timer with deliberate gestures. The shared Intent Engine still requires a dwell and a fresh pinch for every action.',
  features: [
    'Digital recipe dashboard with switchable demo recipes',
    'Preparation-step navigation and ingredient quantities',
    'Cooking timer',
    'Quality-control checklist',
    'Simulated order status',
    'Simulated assistance request',
    'Shared lamp output as a demonstration pass indicator',
    'Mode-specific interaction history',
  ],
  safety: [
    'Fictional recipes and orders; no nutrition or allergen data is represented.',
    'No claim is made about food safety, contamination prevention or hygiene benefit.',
    'No connection to kitchen equipment, refrigeration or order systems.',
    'Only the shared low-voltage LED is actuated in this mode.',
  ],
  accent: '#ef8f6b',
  controls,
  zones: railZones(controls),
  workflow: {
    id: 'prep-run',
    title: 'Simulated preparation run',
    description: 'Select a demo recipe, follow its preparation steps, verify quantities, run the timer and complete quality checks.',
    steps: [
      { id: 'recipe', title: 'Open a demo recipe', detail: 'Pick the demonstration recipe for this run.', controlId: 'food.recipe' },
      { id: 'qty', title: 'Check ingredient quantities', detail: 'Show the quantity panel for the selected recipe.', controlId: 'food.qty' },
      { id: 'step', title: 'Advance preparation', detail: 'Move through the demo preparation steps.', controlId: 'food.step' },
      { id: 'timer', title: 'Start the timer', detail: 'Use the demonstration timer at the marked step.', controlId: 'food.timer' },
      { id: 'qc', title: 'Complete a QC check', detail: 'Mark the next demo quality-control item.', controlId: 'food.qc' },
      { id: 'order', title: 'Update the order status', detail: 'Advance the simulated order.', controlId: 'food.order' },
    ],
  },
  checklistTitle: 'Quality-control checklist (demo)',
  checklist: QC_ITEMS,
  demo: {
    title: 'Recipe → timer → QC',
    goal: 'Show a complete kitchen workflow and the rejection of a careless sweep across the screen.',
    steps: [
      { instruction: 'Activate with a still open palm.', expect: 'Interaction active; the shared Intent Engine is unchanged.' },
      { instruction: 'Select RECIPE and pinch.', expect: `The recipe panel shows ${RECIPES[0].name}.` },
      { instruction: 'Select INGREDIENTS and pinch.', expect: 'Fictional quantities for the selected recipe are shown.' },
      { instruction: 'Select NEXT STEP and pinch.', expect: 'The preparation step advances one at a time.' },
      { instruction: 'Select TIMER and pinch.', expect: 'The demonstration timer starts; select again to pause.' },
      { instruction: 'Select QC CHECK and pinch.', expect: 'One demo QC item is marked complete.' },
      { instruction: 'Select ORDER and pinch.', expect: `Order status advances through ${ORDER_STATES.join(' → ')}.` },
      { instruction: 'Wave from the left edge to the right edge.', expect: 'No status changes; TRANSIT rejection recorded.' },
    ],
  },
  twin: [
    { id: 'food.recipe', name: 'Recipe display', type: 'digital', source: 'digital', description: 'Selected fictional recipe and preparation step. Digital UI state.' },
    { id: 'food.timer', name: 'Cooking timer', type: 'digital', source: 'digital', description: 'Demonstration timer; not connected to cooking equipment.' },
    { id: 'food.order', name: 'Order board', type: 'digital', source: 'digital', description: 'Simulated order statuses; no order system is connected.' },
    { id: 'food.lamp', name: 'Pass lamp', type: 'actuator', source: 'physical', device: 'lighting', description: 'Low-voltage LED used as a simulated pass indicator, confirmed after read-back.' },
  ],
  analytics: ['Recipes opened', 'Preparation steps advanced', 'Timers started', 'QC checks completed', 'Accidental sweeps rejected'],
  panels: ['recipe', 'quantities', 'orders'],
  initialPanel: 'recipe',
  timerLabel: 'Cooking timer',
  dashboard: 'food_processing',
}
