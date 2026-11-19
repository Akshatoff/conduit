import type { AppSettings, IntentConfig, Zone } from './types'

export const DEVICE_SPECS: Record<
  string,
  { id: string; name: string; type: string; hardware: string; actions: string[]; states: string[]; safe: string }
> = {
  lighting: { id: 'lighting', name: 'Lighting', type: 'led', hardware: 'LED on D3 (+220R)', actions: ['ON', 'OFF'], states: ['ON', 'OFF'], safe: 'OFF' },
  access: { id: 'access', name: 'Access control', type: 'servo_latch', hardware: 'SG90 servo on D9 · 0° locked / 90° unlocked', actions: ['LOCK', 'UNLOCK'], states: ['LOCKED', 'UNLOCKED'], safe: 'LOCKED' },
}

export const ACTION_TO_STATE: Record<string, string> = { ON: 'ON', OFF: 'OFF', LOCK: 'LOCKED', UNLOCK: 'UNLOCKED' }

export function defaultZones(): Zone[] {
  return [
    { id: 'lighting', label: 'Lighting', device: 'lighting', x0: 0.05, y0: 0.1, x1: 0.45, y1: 0.55 },
    { id: 'access', label: 'Access control', device: 'access', x0: 0.55, y0: 0.1, x1: 0.95, y1: 0.55 },
  ]
}

export function defaultIntentConfig(): IntentConfig {
  return {
    min_confidence: 0.75,
    min_dwell_s: 0.6,
    stability_threshold: 0.6,
    confirmation_timeout_s: 6.0,
    cooldown_s: 2.0,
    activation_hold_s: 0.7,
    deactivation_hold_s: 2.0,
    cancel_hold_s: 0.35,
    emergency_hold_s: 0.8,
    confirm_pinch_hold_s: 0.2,
    gesture_grace_s: 0.15,
    no_hand_timeout_s: 3.0,
    interaction_timeout_s: 30.0,
    execution_timeout_s: 6.0,
    result_hold_s: 1.0,
    leave_grace_s: 0.8,
    ambiguity_window_s: 2.0,
    duplicate_window_s: 4.0,
    zone_margin: 0.03,
    approach_threshold: 0.5,
    approach_full_score: 0.8,
    activation_stability: 0.5,
    weights: { consistency: 0.15, direction: 0.25, stability: 0.2, dwell: 0.15, tracking: 0.1, activation: 0.05, gesture: 0.1 },
    gestures: { activate: 'open_palm', confirm: 'pinch', cancel: 'fist' },
    zones: defaultZones(),
  }
}

export function defaultSettings(): AppSettings {
  return {
    workspace_mode: 'hospital',
    hardware_mode: 'simulation',
    interaction_mode: 'conduit',
    arduino: { port: '', baud: 9600, timeout_s: 2.0 },
    camera: { index: 0, width: 640, height: 480, smoothing_alpha: 0.5 },
    privacy: { preview_stream: true, store_video: false, log_landmarks: false },
    intent: defaultIntentConfig(),
  }
}

export function toggleAction(device: string, current: string | null | undefined, action?: string | null): string {
  // Mode controls may declare an explicit action (e.g. OPEN_RECORD). Physical controls without
  // one keep the historical toggle semantics.
  if (action) return action
  if (device === 'access') return current === 'UNLOCKED' ? 'LOCK' : 'UNLOCK'
  return current === 'ON' ? 'OFF' : 'ON'
}

export function zoneContains(z: Zone, x: number, y: number, margin = 0): boolean {
  return x >= z.x0 - margin && x <= z.x1 + margin && y >= z.y0 - margin && y <= z.y1 + margin
}
