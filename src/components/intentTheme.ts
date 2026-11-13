import type { IntentStateName } from '../core/types'
import type { Tone } from './ui'

export const STATE_TONE: Record<IntentStateName, Tone> = {
  IDLE: 'neutral',
  ACTIVATING: 'accent',
  READY: 'accent',
  APPROACHING_CONTROL: 'teal',
  SELECTING: 'teal',
  AWAITING_CONFIRMATION: 'warn',
  CONFIRMING: 'accent',
  EXECUTING: 'accent',
  COMPLETED: 'teal',
  CANCELLED: 'warn',
  REJECTED: 'danger',
  ERROR: 'danger',
  BASELINE: 'warn',
}

export const STATE_LABEL: Record<IntentStateName, string> = {
  IDLE: 'Idle',
  ACTIVATING: 'Activating',
  READY: 'Ready',
  APPROACHING_CONTROL: 'Approaching control',
  SELECTING: 'Selecting',
  AWAITING_CONFIRMATION: 'Awaiting confirmation',
  CONFIRMING: 'Confirming',
  EXECUTING: 'Executing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  ERROR: 'Error',
  BASELINE: 'Baseline (direct)',
}

export const HEX: Record<Tone, string> = {
  neutral: '#8796aa',
  accent: '#4da3ff',
  teal: '#42d6c5',
  warn: '#f5b942',
  danger: '#ef6b73',
}

export const GESTURE_LABEL: Record<string, string> = {
  open_palm: 'Open palm',
  pinch: 'Pinch',
  fist: 'Closed fist',
  point: 'Pointing',
  other: 'Other pose',
  none: 'No hand',
}
