import { Camera, CameraOff, Hand, Loader2, MousePointer2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { HAND_CONNECTIONS } from '../core/landmarks'
import { backendStreamUrl, rt } from '../runtime'
import { useConduit } from '../store'
import { cn } from '../utils/cn'
import { GESTURE_LABEL, HEX, STATE_LABEL, STATE_TONE } from './intentTheme'
import { Btn, Pill } from './ui'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function draw(ctx: CanvasRenderingContext2D, W: number, H: number, time: number) {
  const s = useConduit.getState()
  const { intent, frame, trail, devices, interactionMode } = s
  // A signature screen drives the live image; hide the control rails there so the feed is clean.
  const zones = s.signatureView.active ? [] : s.zones
  ctx.clearRect(0, 0, W, H)
  const baseline = interactionMode === 'baseline'
  const stateHex = HEX[STATE_TONE[intent.state]]
  const pulse = 0.5 + 0.5 * Math.sin(time / 220)
  // Overlay typography and handles scale with the stage so the large workspace camera stays legible.
  const k = Math.max(1, Math.min(1.8, W / 1000))
  const pad = Math.round(14 * k)
  const tick = Math.round(14 * k)

  // ---------------------------------------------------------------- control zones
  for (const z of zones) {
    const x = z.x0 * W
    const y = z.y0 * H
    const w = (z.x1 - z.x0) * W
    const h = (z.y1 - z.y0) * H
    const hovered = intent.hovered_zone === z.id
    const isTarget = intent.target === z.id && !baseline
    let stroke = 'rgba(135,150,170,0.55)'
    let fill = 'rgba(11,18,32,0.28)'
    let lw = 1.5
    let banner = ''
    let progress = 0
    let progressHex = HEX.teal

    if (hovered) {
      stroke = HEX.accent
      fill = rgba(HEX.accent, 0.1)
    }
    if (isTarget) {
      lw = 2.5
      switch (intent.state) {
        case 'APPROACHING_CONTROL':
          stroke = rgba(HEX.teal, 0.5 + 0.4 * pulse)
          fill = rgba(HEX.teal, 0.06)
          banner = 'APPROACHING'
          break
        case 'SELECTING':
          stroke = HEX.teal
          fill = rgba(HEX.teal, 0.12)
          banner = 'HOLD STILL TO SELECT'
          progress = intent.progress.dwell
          break
        case 'AWAITING_CONFIRMATION':
        case 'CONFIRMING': {
          stroke = HEX.warn
          fill = rgba(HEX.warn, 0.14 + 0.05 * pulse)
          banner = z.kind === 'digital' ? 'PINCH TO CONFIRM' : `PINCH TO ${intent.action ?? 'CONFIRM'}`
          progress = intent.progress.confirmation_timeout_s > 0 ? intent.progress.confirmation_remaining_s / intent.progress.confirmation_timeout_s : 0
          progressHex = HEX.warn
          break
        }
        case 'EXECUTING':
          stroke = HEX.accent
          fill = rgba(HEX.accent, 0.16)
          banner = 'AWAITING DEVICE ACK…'
          break
        case 'COMPLETED':
          stroke = HEX.teal
          fill = rgba(HEX.teal, 0.2)
          banner = 'CONFIRMED'
          break
        case 'REJECTED':
        case 'ERROR':
          stroke = HEX.danger
          fill = rgba(HEX.danger, 0.14)
          banner = intent.state === 'ERROR' ? 'DEVICE ERROR' : 'REJECTED'
          break
        case 'CANCELLED':
          stroke = HEX.warn
          banner = 'CANCELLED'
          break
        default:
      }
    }
    ctx.lineWidth = lw
    roundRect(ctx, x, y, w, h, Math.round(14 * k))
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = stroke
    ctx.stroke()

    // corner ticks give the zone a spatial "control surface" feel
    ctx.strokeStyle = stroke
    ctx.lineWidth = 3
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as number[][]) {
      ctx.beginPath()
      ctx.moveTo(cx + dx * tick, cy)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx, cy + dy * tick)
      ctx.stroke()
    }

    ctx.font = `600 ${Math.round(12 * k)}px Inter, system-ui, sans-serif`
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(234,241,250,0.92)'
    ctx.fillText(fitText(ctx, z.label.toUpperCase(), w - pad * 2), x + pad, y + Math.round(12 * k))
    const dev = devices[z.device]
    ctx.font = `500 ${Math.round(11 * k)}px ui-monospace, Menlo, Consolas, monospace`
    ctx.fillStyle = 'rgba(135,150,170,0.95)'
    const digital = z.kind === 'digital'
    const st = digital
      ? `digital · ${z.action ?? 'control'}`
      : dev
        ? `${dev.confirmed_state}${dev.simulated ? ' · sim' : ''}`
        : '—'
    ctx.textBaseline = 'bottom'
    ctx.fillText(fitText(ctx, `state: ${st}`, w - pad * 2), x + pad, y + h - Math.round(12 * k))

    if (banner) {
      ctx.font = `700 ${Math.round(11 * k)}px Inter, system-ui, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      const bh = Math.round(26 * k)
      const bw = ctx.measureText(banner).width + Math.round(22 * k)
      roundRect(ctx, x + w / 2 - bw / 2, y + h / 2 - bh / 2, bw, bh, bh / 2)
      ctx.fillStyle = 'rgba(11,18,32,0.82)'
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = stroke.startsWith('#') ? stroke : '#EAF1FA'
      ctx.fillText(banner, x + w / 2, y + h / 2 + 1)
      ctx.textAlign = 'left'
    }
    if (progress > 0) {
      const bx = x + pad
      const bw = w - pad * 2
      const by = y + h - Math.round(30 * k)
      const ph = Math.max(4, Math.round(5 * k))
      roundRect(ctx, bx, by, bw, ph, ph / 2)
      ctx.fillStyle = 'rgba(11,18,32,0.8)'
      ctx.fill()
      roundRect(ctx, bx, by, Math.max(6, bw * Math.min(1, progress)), ph, ph / 2)
      ctx.fillStyle = progressHex
      ctx.fill()
    }
  }

  // ---------------------------------------------------------------- trajectory trail
  if (trail.length > 1) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length
      ctx.strokeStyle = rgba(HEX.accent, 0.08 + 0.7 * a * a)
      ctx.lineWidth = 1.5 + 4 * a
      ctx.beginPath()
      ctx.moveTo(trail[i - 1][0] * W, trail[i - 1][1] * H)
      ctx.lineTo(trail[i][0] * W, trail[i][1] * H)
      ctx.stroke()
    }
  }

  // ---------------------------------------------------------------- hand
  if (frame?.hand_detected && frame.position) {
    const lm = frame.features?.landmarks
    if (lm && lm.length === 21) {
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(234,241,250,0.55)'
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath()
        ctx.moveTo(lm[a][0] * W, lm[a][1] * H)
        ctx.lineTo(lm[b][0] * W, lm[b][1] * H)
        ctx.stroke()
      }
      lm.forEach((p, i) => {
        const tip = [4, 8, 12, 16, 20].includes(i)
        ctx.beginPath()
        ctx.arc(p[0] * W, p[1] * H, (tip ? 4.5 : 3) * Math.min(1.5, k), 0, Math.PI * 2)
        ctx.fillStyle = tip ? HEX.teal : 'rgba(234,241,250,0.95)'
        ctx.fill()
      })
      if (frame.gesture === 'pinch') {
        ctx.beginPath()
        ctx.moveTo(lm[4][0] * W, lm[4][1] * H)
        ctx.lineTo(lm[8][0] * W, lm[8][1] * H)
        ctx.strokeStyle = HEX.warn
        ctx.lineWidth = 4
        ctx.stroke()
      }
    }
    const px = frame.position.x * W
    const py = frame.position.y * H
    ctx.beginPath()
    ctx.arc(px, py, (13 + (intent.state === 'AWAITING_CONFIRMATION' ? 3 * pulse : 0)) * Math.min(1.5, k), 0, Math.PI * 2)
    ctx.strokeStyle = stateHex
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(px, py, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = stateHex
    ctx.fill()

    // activation ring
    if (intent.state === 'ACTIVATING') {
      ctx.beginPath()
      ctx.arc(px, py, 24 * Math.min(1.5, k), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * intent.progress.activation)
      ctx.strokeStyle = HEX.accent
      ctx.lineWidth = 4
      ctx.stroke()
    }
  }

  // ---------------------------------------------------------------- optional second hand
  // The Intent Engine never consumes this hand; it is drawn here for the mode signature screens.
  const second = frame?.second_hand
  if (second?.position) {
    const lm2 = second.features?.landmarks
    if (lm2 && lm2.length === 21) {
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(177,140,255,0.55)'
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath()
        ctx.moveTo(lm2[a][0] * W, lm2[a][1] * H)
        ctx.lineTo(lm2[b][0] * W, lm2[b][1] * H)
        ctx.stroke()
      }
      lm2.forEach((p, i) => {
        const tip = [4, 8, 12, 16, 20].includes(i)
        ctx.beginPath()
        ctx.arc(p[0] * W, p[1] * H, (tip ? 3.5 : 2.5) * Math.min(1.5, k), 0, Math.PI * 2)
        ctx.fillStyle = tip ? '#b18cff' : 'rgba(234,241,250,0.7)'
        ctx.fill()
      })
    }
    const x2 = second.position.x * W
    const y2 = second.position.y * H
    ctx.beginPath()
    ctx.arc(x2, y2, 10 * Math.min(1.5, k), 0, Math.PI * 2)
    ctx.strokeStyle = '#b18cff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

export function CameraStage({ fill = false, className }: { fill?: boolean; className?: string } = {}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeKind = useConduit((s) => s.runtimeKind)
  const inputSource = useConduit((s) => s.inputSource)
  const camera = useConduit((s) => s.camera)
  const previewOn = useConduit((s) => s.settings.privacy.preview_stream)
  const frame = useConduit((s) => s.frame)
  const intent = useConduit((s) => s.intent)
  const mode = useConduit((s) => s.interactionMode)
  const signatureActive = useConduit((s) => s.signatureView.active)
  const running = camera.state === 'running'

  // the browser runtime owns one persistent <video>; mount it into this stage while visible
  useEffect(() => {
    if (runtimeKind !== 'browser') return
    const host = hostRef.current
    rt().attachVideo(host)
    return () => rt().attachVideo(null)
  }, [runtimeKind, inputSource])

  // canvas overlay render loop (reads the store directly, independent of React renders)
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let W = 0
    let H = 0
    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      W = r.width
      H = r.height
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()
    const loop = (t: number) => {
      draw(ctx, W, H, t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const pointerMode = runtimeKind === 'browser' && inputSource === 'pointer' && running
  const toXY = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const
  }

  const stateTone = STATE_TONE[intent.state]
  const showBackendVideo = runtimeKind === 'backend' && running && previewOn
  const showHole = !running
  // A model/runtime problem is not a camera problem: name it correctly so the fix is obvious.
  const modelProblem = /hand model|mediapipe runtime|hand_landmarker/i.test(camera.error ?? '')

  return (
    <div className={cn('overflow-hidden rounded-xl border border-line bg-black/60', fill && 'h-full', className)}>
      <div
        ref={wrapRef}
        data-camera-fill={fill || undefined}
        className={cn(
          'relative w-full select-none overflow-hidden bg-[#070d18]',
          fill ? 'h-full min-h-[320px]' : 'aspect-[4/3]',
          pointerMode && 'cursor-none touch-none',
        )}
        onPointerMove={pointerMode ? (e) => rt().setPointer(...toXY(e), true) : undefined}
        onPointerLeave={pointerMode ? () => { rt().setPointer(0.5, 0.5, false); rt().setPointerPinch(false) } : undefined}
        onPointerDown={pointerMode ? (e) => { (e.target as Element).setPointerCapture?.(e.pointerId); rt().setPointerPinch(true) } : undefined}
        onPointerUp={pointerMode ? () => rt().setPointerPinch(false) : undefined}
      >
        {/* gesture camera: the signature overlay renders its own two-camera layout */}
        {runtimeKind === 'browser' && inputSource === 'camera' && <div ref={hostRef} className={cn('absolute inset-0', !running && 'opacity-0')} />}
        {pointerMode && <div className="grid-bg absolute inset-0" />}
        {showBackendVideo && <img key={camera.state + String(camera.camera_index)} src={backendStreamUrl()} alt="Live camera feed (processed locally)" className="absolute inset-0 h-full w-full object-fill" />}
        {runtimeKind === 'backend' && running && !previewOn && <div className="grid-bg absolute inset-0" />}

        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* top-left status */}
        {!signatureActive && <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
          {camera.active ? (
            <Pill tone="danger" icon={<span className="block size-2 rounded-full bg-danger" />} pulse className="bg-bg/80 backdrop-blur">
              CAMERA ACTIVE · LOCAL PROCESSING
            </Pill>
          ) : pointerMode ? (
            <Pill tone="warn" icon={<MousePointer2 className="size-3" />} className="bg-bg/80 backdrop-blur">
              POINTER SIMULATOR · SYNTHETIC HAND
            </Pill>
          ) : (
            <Pill tone="neutral" icon={<CameraOff className="size-3" />} className="bg-bg/80 backdrop-blur">
              CAMERA OFF
            </Pill>
          )}
          {mode === 'baseline' && <Pill tone="warn" className="bg-bg/80 backdrop-blur">BASELINE MODE · NO INTENT CHECKS</Pill>}
        </div>}

        {/* top-right telemetry */}
        {running && !signatureActive && (
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2">
            <Pill tone="neutral" icon={<Hand className="size-3" />} className="bg-bg/80 backdrop-blur">
              {frame?.hand_detected ? `${GESTURE_LABEL[frame.gesture] ?? frame.gesture}${frame.handedness ? ` · ${frame.handedness}` : ''}` : 'No hand'}
            </Pill>
            {frame?.second_hand && <Pill tone="accent" className="bg-bg/80 backdrop-blur">2 hands</Pill>}
            <Pill tone="neutral" className="bg-bg/80 font-mono backdrop-blur">{camera.fps.toFixed(0)} FPS</Pill>
          </div>
        )}

        {/* bottom intent bar: what the system currently believes */}
        {running && !signatureActive && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/95 via-bg/70 to-transparent px-4 pb-3 pt-10">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={stateTone}>{STATE_LABEL[intent.state]}</Pill>
              {intent.target_label && mode === 'conduit' && (
                <Pill tone="neutral">
                  {intent.target_label}
                  {intent.action ? ` → ${intent.action}` : ''}
                </Pill>
              )}
              {mode === 'conduit' && intent.confidence > 0 && <Pill tone="neutral" className="font-mono">conf {(intent.confidence * 100).toFixed(0)}%</Pill>}
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-ink/90">{intent.reason}</p>
          </div>
        )}

        {/* not running overlay */}
        {showHole && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bg/70 p-6 text-center backdrop-blur-[2px]">
            {camera.state === 'starting' ? (
              <>
                <Loader2 className="size-8 animate-spin text-accent" />
                <p className="text-sm text-ink">Starting… {camera.tracker ?? ''}</p>
                <p className="max-w-sm text-xs text-muted">The hand-tracking model is downloaded once, then runs entirely on this device.</p>
              </>
            ) : (
              <>
                {camera.state === 'error' || camera.state === 'disconnected' ? <TriangleAlert className="size-8 text-warn" /> : <Camera className="size-8 text-muted" />}
                <div>
                  <p className="text-sm font-medium text-ink">
                    {camera.state === 'error'
                      ? modelProblem
                        ? 'Hand tracking could not start'
                        : 'Camera could not start'
                      : camera.state === 'disconnected'
                        ? 'Camera disconnected'
                        : inputSource === 'pointer'
                          ? 'Pointer simulator is stopped'
                          : 'Camera is off'}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
                    {camera.error ?? (inputSource === 'pointer' ? 'Move the mouse over this panel to drive a synthetic hand through the same landmark → intent pipeline.' : 'Video is processed locally and is never recorded or uploaded. Press start to begin.')}
                  </p>
                </div>
                <Btn variant="primary" onClick={() => void rt().startVision()}>
                  {inputSource === 'pointer' ? <MousePointer2 className="size-4" /> : <Camera className="size-4" />}
                  {camera.state === 'error' || camera.state === 'disconnected' ? 'Retry' : inputSource === 'pointer' ? 'Start simulator' : 'Start camera'}
                </Btn>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
