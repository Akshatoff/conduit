// Shared types. Shapes intentionally mirror the Python backend (snake_case) so that the same
// UI works against the FastAPI backend or the in-browser runtime.

export type Gesture = 'open_palm' | 'pinch' | 'fist' | 'point' | 'other' | 'none'

export interface Zone {
  id: string
  label: string
  device: string
  x0: number
  y0: number
  x1: number
  y1: number
  /** Explicit command action. Omitted = toggle the device state (classic behaviour). */
  action?: string | null
  /** `physical` = ESP32 node, `digital` = mode-layer UI control (never hardware). */
  kind?: 'physical' | 'digital'
  /** Short helper text shown on the mode dashboard / camera overlay. */
  hint?: string
}

export interface IntentConfig {
  min_confidence: number
  min_dwell_s: number
  stability_threshold: number
  confirmation_timeout_s: number
  cooldown_s: number
  activation_hold_s: number
  deactivation_hold_s: number
  cancel_hold_s: number
  emergency_hold_s: number
  confirm_pinch_hold_s: number
  gesture_grace_s: number
  no_hand_timeout_s: number
  interaction_timeout_s: number
  execution_timeout_s: number
  result_hold_s: number
  leave_grace_s: number
  ambiguity_window_s: number
  duplicate_window_s: number
  zone_margin: number
  approach_threshold: number
  approach_full_score: number
  activation_stability: number
  weights: Record<string, number>
  gestures: { activate: string; confirm: string; cancel: string }
  zones: Zone[]
}

export interface AppSettings {
  workspace_mode: string
  hardware_mode: 'simulation' | 'hardware'
  interaction_mode: 'conduit' | 'baseline'
  esp32: { host: string; port: number; timeout_s: number }
  camera: { index: number; width: number; height: number; smoothing_alpha: number }
  privacy: { preview_stream: boolean; store_video: boolean; log_landmarks: boolean }
  intent: IntentConfig
}

export type IntentStateName =
  | 'IDLE'
  | 'ACTIVATING'
  | 'READY'
  | 'APPROACHING_CONTROL'
  | 'SELECTING'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMING'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'ERROR'
  | 'BASELINE'

export interface IntentSnapshot {
  state: IntentStateName
  intent: string
  active: boolean
  target: string | null
  target_label: string | null
  action: string | null
  confidence: number
  final_confidence: number
  components: Record<string, number>
  accepted: boolean
  reason: string
  reason_code: string
  confirmation_required: boolean
  hovered_zone: string | null
  in_cooldown: boolean
  cooldown_remaining: number
  progress: {
    activation: number
    dwell: number
    dwell_s: number
    confirmation_remaining_s: number
    confirmation_timeout_s: number
  }
  tracking_quality: number
  timestamp: number
}

export interface CommandRequest {
  command_id: string
  device: string
  action: string
  confidence: number
  timestamp: number
  source: string
}

export interface IntentEvent {
  kind: string
  intent: string
  target: string | null
  confidence: number
  state: string
  accepted: boolean
  reason: string
  reason_code: string
  timestamp: number
  action: string | null
  command?: CommandRequest | null
  components?: Record<string, number>
}

export interface InteractionInput {
  timestamp: number
  hand_detected: boolean
  x: number
  y: number
  gesture: string
  pinch_distance: number
  tracking_quality: number
}

export interface HandFeatures {
  landmarks: number[][]
  handedness: string
  wrist: number[]
  palm_center: number[]
  fingertips: Record<string, number[]>
  fingers_extended: Record<string, boolean>
  palm_size: number
  pinch_distance: number
  openness: number
  orientation_deg: number
  relative_depth_estimate: number
  tracking_confidence: number
  gesture: Gesture
}

export interface VisionFrame {
  timestamp: number
  hand_detected: boolean
  handedness: string | null
  position: { x: number; y: number } | null
  gesture: string
  pinch_distance: number | null
  velocity: number
  stability: number
  fps: number
  tracking_quality: number
  features: Partial<HandFeatures> | null
}

export type CommandStatus = 'PENDING' | 'REJECTED' | 'SENT' | 'ACKNOWLEDGED' | 'CONFIRMED' | 'FAILED' | 'DISCONNECTED'

export interface CommandResult {
  command_id: string
  device: string
  action: string
  source: string
  status: CommandStatus
  detail: string
  confirmed_state: string | null
  simulated: boolean
  latency_ms: number | null
  ack_latency_ms: number | null
  acknowledged: boolean
  executed_on: string
  digital?: boolean
}

export interface DeviceTwin {
  id: string
  name: string
  type: string
  hardware: string
  actions: string[]
  safe_state: string
  confirmed_state: string
  state_source: string
  simulated: boolean
  connection: 'simulated' | 'connected' | 'disconnected'
  last_command: { command_id: string; device: string; action: string; source: string; status: string; at: number; detail?: string; confidence?: number | null } | null
  last_ack: { command_id: string; status: string; actual_state: string | null; at: number; simulated: boolean } | null
  error: string | null
  pending_command_id: string | null
  updated_at: number
}

export interface LogEntry {
  id: number
  at: number
  channel: 'intent' | 'command' | 'system'
  level: 'info' | 'ok' | 'warn' | 'error'
  title: string
  detail: string
  code?: string
}

export interface Metrics {
  attempts: number
  intended_trials: number
  unintended_trials: number
  accepted: number
  rejected: number
  successful_deliberate: number
  false_activations: number
  accidental_rejected: number
  accidental_rejection_rate: number | null
  false_activation_rate: number | null
  deliberate_success_rate: number | null
  avg_intent_latency_ms: number | null
  avg_e2e_latency_ms: number | null
  commands_sent: number
  commands_acked: number
  device_ack_rate: number | null
  confirmation_requests: number
  confirmation_request_rate: number | null
  confirmation_success_rate: number | null
  avg_task_duration_s: number | null
}

export interface SessionSummary {
  id: number
  mode: 'baseline' | 'conduit'
  workspace: string
  note: string
  start_time: number
  end_time: number | null
  attempts: number
  successes: number
  unintended: number
  metrics: Metrics | null
}

export interface TrialStatus {
  session_active: boolean
  session_id: number | null
  mode: string | null
  workspace?: string | null
  trial_active: boolean
  trial: { label: string; target: string | null; scenario: string; started_at: number; executed: boolean; rejections: number; confirmation_requested: boolean; commands_sent: number } | null
}

export interface AnalyticsSummary {
  has_data: boolean
  total_trials: number
  sessions: SessionSummary[]
  by_mode: { baseline: Metrics; conduit: Metrics }
  by_workspace: Record<string, Metrics>
  status: TrialStatus
  definitions: Record<string, string>
}

export interface CameraState {
  state: 'stopped' | 'starting' | 'running' | 'error' | 'disconnected'
  active: boolean
  fps: number
  error: string | null
  tracker?: string
  available: boolean | null
  camera_index: number
}
