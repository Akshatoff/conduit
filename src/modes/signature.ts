// Mode-layer signature gestures.
//
// These are *view/navigation* gestures layered on top of the existing intent pipeline. They never
// create commands: a control must already have been authorised by the Intent Engine before a
// signature screen can be opened/used, and discrete mode actions still require dwell + confirmation.
//
// The Intent Engine keeps consuming only the primary hand. Two-hand data is optional and is used
// solely to drive these screens.

import { useEffect, useRef } from 'react'
import type { SecondHand, VisionFrame } from '../core/types'
import { useConduit } from '../store'

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

export interface SignatureHands {
  frame: VisionFrame | null
  primary: { x: number; y: number; gesture: string; orientation: number } | null
  second: SecondHand | null
  twoHand: boolean
  spread: number | null
  center: { x: number; y: number } | null
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
  const second = frame?.second_hand && frame.second_hand.hand_detected ? frame.second_hand : null
  const twoHand = !!primary && !!second
  const spread = primary && second ? dist2(primary, second.position) : null
  const center = primary && second ? { x: (primary.x + second.position.x) / 2, y: (primary.y + second.position.y) / 2 } : null
  const ready = !!primary && !BLOCKING.has(intent.state) && !intent.target
  return { frame, primary, second, twoHand, spread, center, ready }
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

/** Pinch-and-drag deltas in normalised stage coordinates. */
export function usePinchDrag(onDelta: (dx: number, dy: number) => void, enabled: boolean) {
  const hands = useSignatureHands()
  const last = useRef<{ x: number; y: number } | null>(null)
  const cb = useRef(onDelta)
  cb.current = onDelta
  const p = hands.primary
  const active = enabled && hands.ready && p?.gesture === 'pinch'

  useEffect(() => {
    if (!active || !p) {
      last.current = null
      return
    }
    if (last.current) {
      const dx = p.x - last.current.x
      const dy = p.y - last.current.y
      if (Math.abs(dx) + Math.abs(dy) > 0.0005) cb.current(dx, dy)
    }
    last.current = { x: p.x, y: p.y }
  }, [active, p?.x, p?.y])
}

/** Two-hand spread/centre deltas: spread drives zoom, common centre movement drives pan. */
export function useTwoHandTransform(
  onDelta: (d: { spread: number; x: number; y: number }) => void,
  enabled: boolean,
) {
  const hands = useSignatureHands()
  const last = useRef<{ spread: number; x: number; y: number } | null>(null)
  const cb = useRef(onDelta)
  cb.current = onDelta

  useEffect(() => {
    if (!enabled || !hands.twoHand || !hands.spread || !hands.center) {
      last.current = null
      return
    }
    const next = { spread: hands.spread, x: hands.center.x, y: hands.center.y }
    if (last.current) {
      cb.current({ spread: next.spread - last.current.spread, x: next.x - last.current.x, y: next.y - last.current.y })
    }
    last.current = next
  }, [enabled, hands.twoHand, hands.spread, hands.center?.x, hands.center?.y])
}

/** Wrist rotation deltas in degrees, unwrapped so crossing ±180° does not jump. */
export function useWristRotation(onDelta: (deg: number) => void, enabled: boolean) {
  const hands = useSignatureHands()
  const last = useRef<number | null>(null)
  const cb = useRef(onDelta)
  cb.current = onDelta
  const active = enabled && hands.ready && !!hands.primary && hands.primary.gesture !== 'pinch' && hands.primary.gesture !== 'fist'
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
