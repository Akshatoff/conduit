import type { AppSettings, IntentConfig, Zone } from './types'

// The physical outputs are the phone's three real actuators. Ids are shared with the Python
// backend (backend/hardware/models.py) and the node that drives them over ADB.
export const DEVICE_SPECS: Record<
  string,
  { id: string; name: string; type: string; hardware: string; actions: string[]; states: string[]; safe: string; adb: string; readbackNote: string }
> = {
  torch: {
    id: 'torch', name: 'Phone torch', type: 'flashlight', hardware: 'Rear camera torch (LED) via ADB',
    actions: ['ON', 'OFF'], states: ['ON', 'OFF'], safe: 'OFF', adb: 'adb shell cmd torch set on|off',
    readbackNote: 'ADB cannot report torch state on most phones; the node falls back to a screen flash when the torch is not exposed.',
  },
  screen: {
    id: 'screen', name: 'Screen flash', type: 'display', hardware: 'Display backlight at full brightness + wake',
    actions: ['ON', 'OFF'], states: ['ON', 'OFF'], safe: 'OFF', adb: 'adb shell settings put system screen_brightness 255',
    readbackNote: '',
  },
  vibration: {
    id: 'vibration', name: 'Vibration', type: 'haptic', hardware: 'Phone vibration motor (repeating pulse)',
    actions: ['ON', 'OFF'], states: ['ON', 'OFF'], safe: 'OFF', adb: 'adb shell cmd vibrator vibrate 700',
    readbackNote: 'The vibration motor has no readable state over ADB; the node reports how many pulses it sent.',
  },
}

export const ACTION_TO_STATE: Record<string, string> = { ON: 'ON', OFF: 'OFF' }

export function defaultZones(): Zone[] {
  return [
    { id: 'torch', label: 'Phone torch', device: 'torch', x0: 0.03, y0: 0.1, x1: 0.35, y1: 0.55 },
    { id: 'screen', label: 'Screen flash', device: 'screen', x0: 0.36, y0: 0.1, x1: 0.66, y1: 0.55 },
    { id: 'vibration', label: 'Vibration', device: 'vibration', x0: 0.67, y0: 0.1, x1: 0.97, y1: 0.55 },
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
    phone: { adb_path: '', serial: '', timeout_s: 8.0, pulse_ms: 700 },
    camera: { index: 0, width: 640, height: 480, smoothing_alpha: 0.5 },
    privacy: { preview_stream: true, store_video: false, log_landmarks: false },
    intent: defaultIntentConfig(),
  }
}

export function toggleAction(_device: string, current: string | null | undefined, action?: string | null): string {
  // Mode controls may declare an explicit action (e.g. OPEN_RECORD). Physical controls without
  // one keep the historical toggle semantics.
  if (action) return action
  return current === 'ON' ? 'OFF' : 'ON'
}

export function zoneContains(z: Zone, x: number, y: number, margin = 0): boolean {
  return x >= z.x0 - margin && x <= z.x1 + margin && y >= z.y0 - margin && y <= z.y1 + margin
}
