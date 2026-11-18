// Mode-layer signature gestures.
//
// These are *view/navigation* gestures layered on top of the existing intent pipeline. They never
// create commands: a control must already have been authorised by the Intent Engine before a
// signature screen can be opened/used, and discrete mode actions still require dwell + confirmation.
//
// The Intent Engine keeps consuming only the primary hand. Signature screens use that same primary
// hand's pose (pinch / open palm / fist / point); a second hand is not required.

import { useEffect, useRef, useState } from 'react'
import type { VisionFrame } from '../core/types'
import { useConduit } from '../store'

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export interface SignatureHands {
  frame: VisionFrame | null
  primary: { x: number; y: number; gesture: string; orientation: number } | null
  /** Signature gestures pause while the engine is selecting/confirming/executing a control. */
  ready: boolean
}

const BLOCKING = new Set(['SELECTING', 'AWAITING_CONFIRMATION', 'CONFIRMING', 'EXECUTING'])

export function useSignatureHands(): SignatureHands {
  const frame = useConduit((s) => s.frame)
  const intent = useConduit((s) => s.intent)
  const primary =
    frame?.hand_detected && frame.position
      ? { x: frame.position.x, y: frame.position.y, gesture: frame.gesture, orientation: frame.features?.orientation_deg ?? 0 }
      : null
  // Hovering a workspace control must not silently pause the signature view: nothing here can
  // activate that control, and the Intent Engine still owns every mode action. Only an in-flight
  // selection/confirmation/execution pauses navigation gestures.
  // Low-confidence / unstable frames are ignored so a flickering classifier cannot toggle a pose.
  const confident = !!frame && (frame.tracking_quality ?? 1) >= 0.25
  const ready = !!primary && confident && !BLOCKING.has(intent.state)
  return { frame, primary, ready }
}

/** Horizontal open-palm swipes. Runs outside engine target selection so it cannot fire a command. */
export function useHorizontalSwipe(onSwipe: (dir: 1 | -1) => void, enabled: boolean, threshold = 0.11, cooldownMs = 850) {
  const hands = useSignatureHands()
  const state = useRef({ x: null as number | null, t: 0, acc: 0, lockedUntil: 0 })
  const cb = useRef(onSwipe)
  cb.current = onSwipe
  const x = hands.primary?.x ?? null
  const t = hands.frame ? hands.frame.timestamp * 1000 : 0
  const eligible = enabled && hands.ready && hands.primary?.gesture !== 'pinch' && hands.primary?.gesture !== 'fist'

  useEffect(() => {
    const s = state.current
    if (!eligible || x == null) {
      s.x = null
      s.acc = 0
      return
    }
    const nowMs = t || performance.now()
    if (s.x == null) {
      s.x = x
      s.t = nowMs
      return
    }
    const dt = Math.max(1, nowMs - s.t)
    const dx = x - s.x
    if (dt < 140 && Math.abs(dx) < 0.16) s.acc += dx
    else s.acc = 0
    s.x = x
    s.t = nowMs
    if (Math.abs(s.acc) > threshold && nowMs > s.lockedUntil) {
      cb.current(s.acc > 0 ? 1 : -1)
      s.lockedUntil = nowMs + cooldownMs
      s.acc = 0
    } else if (dt > 260) {
      s.acc = 0
    }
  }, [x, t, eligible, threshold, cooldownMs])
}

// Pose-based zoom. The gesture *pose* selects the action, not the distance between two hands:
// pinch (thumb + index) zooms in, an open palm zooms out. Open-palm zoom-out is disarmed after a
// pinch until the hand passes through a fist/point reset, so releasing a pinch cannot undo it.
// Open-palm zoom only starts once the hand is held still, leaving horizontal open-palm swipes free.
export const POSE_ZOOM_SPEED = 0.95
export const POSE_HOLD_S = 0.12
export const OPEN_HOLD_S = 0.22
export const OPEN_REARM_S = 0.12

export type PoseZoomDirection = 1 | -1 | 0

export interface PoseZoomState {
  direction: PoseZoomDirection
  gesture: string | null
  /** Open-palm zoom-out is available (false right after a pinch, until a fist/point reset). */
  armedOut: boolean
  /** Open palm is showing but zoom-out needs a fist/point reset first. */
  needsReset: boolean
}

/**
 * Pose-gated zoom. Pinch held = zoom in; open palm held still = zoom out.
 * Both are rate-based, so the user controls the amount by how long the pose is held.
 */
export function usePoseZoom(
  onZoom: (factor: number) => void,
  enabled: boolean,
  maxSpeed = POSE_ZOOM_SPEED,
): PoseZoomState {
  const hands = useSignatureHands()
  const cb = useRef(onZoom)
  cb.current = onZoom
  const state = useRef({
    direction: 0 as PoseZoomDirection,
    pinchSince: 0,
    openSince: 0,
    neutralSince: 0,
    lastT: 0,
    lastPos: null as { x: number; y: number } | null,
    armedOut: true,
  })
  const [direction, setDirection] = useState<PoseZoomDirection>(0)
  const [armedOut, setArmedOut] = useState(true)
  const primary = hands.primary
  const now = hands.frame?.timestamp ?? 0

  useEffect(() => {
    const st = state.current
    if (!primary || !hands.frame) {
      st.direction = 0
      st.pinchSince = 0
      st.openSince = 0
      st.neutralSince = 0
      st.lastT = 0
      st.lastPos = null
      st.armedOut = true
      setDirection(0)
      setArmedOut(true)
      return
    }
    if (!enabled) {
      // A brief low-confidence or engine-busy frame must not cancel a pose the user is holding.
      // Short gaps keep the timers; a longer gap starts the pose cleanly.
      if (st.lastT && now - st.lastT > 0.4) {
        st.pinchSince = 0
        st.openSince = 0
        st.neutralSince = 0
      }
      st.direction = 0
      setDirection(0)
      return
    }

    const dt = st.lastT ? clamp(now - st.lastT, 0, 0.12) : 0.016
    st.lastT = now
    const moved = st.lastPos ? Math.hypot(primary.x - st.lastPos.x, primary.y - st.lastPos.y) : 0
    st.lastPos = { x: primary.x, y: primary.y }

    let next: PoseZoomDirection = 0

    if (primary.gesture === 'pinch') {
      st.openSince = 0
      st.neutralSince = 0
      if (!st.pinchSince) st.pinchSince = now
      if (now - st.pinchSince >= POSE_HOLD_S) {
        cb.current(Math.exp(maxSpeed * dt))
        next = 1
        if (st.armedOut) {
          st.armedOut = false
          setArmedOut(false)
        }
      }
    } else if (primary.gesture === 'open_palm') {
      st.pinchSince = 0
      st.neutralSince = 0
      if (!st.armedOut) {
        // Releasing a pinch must not immediately reverse it. The hand has to pass through a
        // fist/point reset below before open-palm zoom-out arms again.
        st.openSince = 0
      } else {
        if (moved > 0.012) st.openSince = 0
        else if (!st.openSince) st.openSince = now
        if (st.openSince && now - st.openSince >= OPEN_HOLD_S) {
          cb.current(Math.exp(-maxSpeed * dt))
          next = -1
        }
      }
    } else {
      st.pinchSince = 0
      st.openSince = 0
      if (!st.armedOut && (primary.gesture === 'fist' || primary.gesture === 'point')) {
        if (!st.neutralSince) st.neutralSince = now
        if (now - st.neutralSince >= OPEN_REARM_S) {
          st.armedOut = true
          st.neutralSince = 0
          setArmedOut(true)
        }
      } else if (st.armedOut) {
        st.neutralSince = 0
      }
    }

    if (st.direction !== next) {
      st.direction = next
      setDirection(next)
    }
  }, [enabled, primary?.gesture, primary?.x, primary?.y, now, hands.frame, maxSpeed])

  return {
    direction,
    gesture: primary?.gesture ?? null,
    armedOut,
    needsReset: !armedOut && primary?.gesture === 'open_palm',
  }
}

/** Index-finger drag in normalised stage coordinates, used for panning. */
export function usePointDrag(onDelta: (dx: number, dy: number) => void, enabled: boolean) {
  const hands = useSignatureHands()
  const last = useRef<{ x: number; y: number } | null>(null)
  const cb = useRef(onDelta)
  cb.current = onDelta
  const p = hands.primary
  const active = enabled && hands.ready && p?.gesture === 'point'

  useEffect(() => {
    if (!active || !p) {
      last.current = null
      return
    }
    if (last.current) {
      const dx = p.x - last.current.x
      const dy = p.y - last.current.y
      if (Math.abs(dx) + Math.abs(dy) > 0.0008) cb.current(clamp(dx, -0.04, 0.04), clamp(dy, -0.04, 0.04))
    }
    last.current = { x: p.x, y: p.y }
  }, [active, p?.x, p?.y])
}

/** Fist rotation deltas in degrees, unwrapped so crossing ±180° does not jump. */
export function useFistRotation(onDelta: (deg: number) => void, enabled: boolean) {
  const hands = useSignatureHands()
  const last = useRef<number | null>(null)
  const cb = useRef(onDelta)
  cb.current = onDelta
  const active = enabled && hands.ready && hands.primary?.gesture === 'fist'
  const angle = hands.primary?.orientation ?? null

  useEffect(() => {
    if (!active || angle == null) {
      last.current = null
      return
    }
    if (last.current != null) {
      let d = angle - last.current
      if (d > 180) d -= 360
      if (d < -180) d += 360
      if (Math.abs(d) > 0.25 && Math.abs(d) < 60) cb.current(d)
    }
    last.current = angle
  }, [active, angle])
}

/** Clockwise/counter-clockwise open-palm motion around a fixed centre, in degrees. */
export function useCircularGesture(onDelta: (deg: number) => void, enabled: boolean, center = { x: 0.5, y: 0.34 }) {
  const hands = useSignatureHands()
  const last = useRef<number | null>(null)
  const cb = useRef(onDelta)
  cb.current = onDelta
  const active = enabled && hands.ready && !!hands.primary && hands.primary.gesture !== 'pinch' && hands.primary.gesture !== 'fist'
  const p = hands.primary

  useEffect(() => {
    if (!active || !p) {
      last.current = null
      return
    }
    const dx = p.x - center.x
    const dy = p.y - center.y
    const radius = Math.hypot(dx, dy)
    // Keep the circle close to the dial: a wide lower-edge sweep is swipe navigation, not a tune.
    if (radius < 0.06 || radius > 0.34) {
      last.current = null
      return
    }
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    if (last.current != null) {
      let d = angle - last.current
      if (d > 180) d -= 360
      if (d < -180) d += 360
      if (Math.abs(d) > 0.4 && Math.abs(d) < 65) cb.current(d)
    }
    last.current = angle
  }, [active, p?.x, p?.y, center.x, center.y])
}

// ------------------------------------------------------------------ live camera view
// Signature screens for semiconductor / industrial / accessibility transform the *live camera*
// itself. The transform lives in the store so CameraStage can apply it to the video + landmark
// canvas together, keeping the hand overlay aligned with the zoomed image.

export const MIN_SIGNATURE_ZOOM = 1
export const MAX_SIGNATURE_ZOOM = 5

export function clampSignaturePan(x: number, y: number, zoom: number) {
  const m = Math.max(0, ((zoom - 1) / 2) * 0.9)
  return { x: clamp(x, -m, m), y: clamp(y, -m, m) }
}

export function useSignatureCamera(maxZoom = MAX_SIGNATURE_ZOOM) {
  const view = useConduit((s) => s.signatureView)
  const update = (fn: (v: typeof view) => Partial<typeof view>) =>
    useConduit.setState((s) => {
      const next = { ...s.signatureView, ...fn(s.signatureView) }
      const p = clampSignaturePan(next.x, next.y, next.zoom)
      return { signatureView: { ...next, ...p } }
    })

  return {
    view,
    zoom: view.zoom,
    pan: { x: view.x, y: view.y },
    rotation: view.rotation,
    zoomBy(factor: number) {
      update((v) => {
        const zoom = clamp(v.zoom * factor, MIN_SIGNATURE_ZOOM, maxZoom)
        return { zoom }
      })
    },
    setZoom(zoom: number) {
      update(() => ({ zoom: clamp(zoom, MIN_SIGNATURE_ZOOM, maxZoom) }))
    },
    panBy(dx: number, dy: number) {
      update((v) => ({ x: v.x + dx, y: v.y + dy }))
    },
    rotateBy(deg: number) {
      update((v) => ({ rotation: clamp(v.rotation + deg, -60, 60) }))
    },
    reset() {
      update(() => ({ zoom: 1, x: 0, y: 0, rotation: 0 }))
    },
  }
}

/** Project a raw (unzoomed) normalised hand point through the same transform as the video. */
export function projectSignaturePoint(
  p: { x: number; y: number },
  view: { zoom: number; x: number; y: number; rotation: number },
) {
  const dx = (p.x - 0.5) * view.zoom
  const dy = (p.y - 0.5) * view.zoom
  const r = (view.rotation * Math.PI) / 180
  return {
    x: 0.5 + dx * Math.cos(r) - dy * Math.sin(r) + view.x,
    y: 0.5 + dx * Math.sin(r) + dy * Math.cos(r) + view.y,
  }
}
