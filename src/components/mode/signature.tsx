import { Camera, ChevronLeft, ChevronRight, Hand, Layers, Maximize2, Minimize2, Minus, Plus, RotateCcw, ScanLine, Sparkles, TimerReset, Wrench } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { CONTENT_ITEMS } from '../../modes/accessibility/demoData'
import { RECIPES } from '../../modes/food/demoData'
import { MANUAL_STEPS, MACHINE_COMPONENTS } from '../../modes/industrial/demoData'
import { clamp, useCircularGesture, useFistRotation, useHorizontalSwipe, usePoseZoom, usePointDrag, useSignatureCamera, useSignatureHands } from '../../modes/signature'
import type { PoseZoomState } from '../../modes/signature'
import { HAND_CONNECTIONS } from '../../core/landmarks'
import { readObjectCameraId, subscribeObjectCamera, writeObjectCameraId } from '../../objectCamera'
import { backendStreamUrl } from '../../runtime'
import { useConduit } from '../../store'
import { useModeState } from './DashboardKit'
import { Pill } from '../ui'
import { cn } from '../../utils/cn'

// ------------------------------------------------------------------ shared chrome
function GestureChip({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
        active ? 'border-accent/60 bg-accent/15 text-accent' : 'border-line/70 bg-bg/60 text-muted',
      )}
    >
      {active && <span className="size-1.5 animate-soft-pulse rounded-full bg-accent" />}
      {children}
    </span>
  )
}

/** Compact pose guide: the pose name is the control, so detection is a classifier decision rather
 *  than a threshold on how far apart two hands happen to be. */
function PoseGuide({ zoom, rotate = false, inLabel = 'zoom in', outLabel = 'zoom out' }: { zoom: PoseZoomState; rotate?: boolean; inLabel?: string; outLabel?: string }) {
  return (
    <div className="pointer-events-none flex flex-wrap items-center gap-1" aria-label="Signature pose guide">
      <GestureChip active={zoom.gesture === 'pinch'}>pinch · {inLabel}</GestureChip>
      <GestureChip active={zoom.gesture === 'open_palm' && zoom.armedOut}>open · {outLabel}</GestureChip>
      {rotate && <GestureChip active={zoom.gesture === 'fist'}>fist · rotate</GestureChip>}
      <GestureChip active={zoom.gesture === 'point'}>point · pan</GestureChip>
    </div>
  )
}

function poseHint(zoom: PoseZoomState, rotate = false): string {
  if (zoom.direction === 1) return 'PINCH · ZOOM IN'
  if (zoom.direction === -1) return 'OPEN HAND · ZOOM OUT'
  if (zoom.needsReset) return 'FIST OR POINT · RE-ARM ZOOM OUT'
  if (zoom.gesture === 'pinch') return 'PINCH · HOLD TO ZOOM IN'
  if (zoom.gesture === 'open_palm') return 'OPEN HAND · HOLD TO ZOOM OUT'
  if (rotate && zoom.gesture === 'fist') return 'FIST · ROTATE'
  if (zoom.gesture === 'point') return 'POINT-DRAG · PAN'
  return ''
}

function ScreenNote({ children }: { children: React.ReactNode }) {
  return <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/95 to-transparent px-3 pb-2 pt-6 text-[10px] leading-snug text-muted">{children}</p>
}

function NoHand({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-24 z-20 mx-auto flex max-w-md flex-col items-center gap-1 rounded-lg border border-line/60 bg-bg/85 px-4 py-3 text-center shadow-lg backdrop-blur">
      <Hand className="size-5 text-muted/70" />
      <p className="text-xs font-medium text-ink">Show a hand to drive this screen</p>
      <p className="text-[10px] leading-relaxed text-muted">{children}</p>
    </div>
  )
}

function ScreenHeader({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-line/50 bg-bg/75 px-2 py-1.5 backdrop-blur">
      <span className="text-accent">{icon}</span>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink">{title}</p>
      <div className="ml-auto flex items-center gap-1.5">{right}</div>
    </div>
  )
}

function fmt(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ------------------------------------------------------------------ HOSPITAL
// Your own X-ray images live in public/assets/xray/ and are served at /assets/xray/... both by
// Vite (dev + build) and by the backend when it serves the app. Exact file names, nothing else:
const XRAY_DIR = '/assets/xray'
const XRAY_IMAGES = [
  { file: 'first.jpg', id: 'XRY-01', title: 'Local X-ray · first image', note: 'local file' },
  { file: 'second.jpg', id: 'XRY-02', title: 'Local X-ray · second image', note: 'local file' },
  { file: 'third.jpg', id: 'XRY-03', title: 'Local X-ray · third image', note: 'local file' },
]

function MissingXray({ file }: { file: string }) {
  return (
    <div className="grid h-full w-full place-items-center bg-[#050b14] px-6 text-center">
      <div className="max-w-sm space-y-2">
        <ScanLine className="mx-auto size-7 text-muted/70" />
        <p className="text-xs font-semibold text-ink">
          No image at {XRAY_DIR}/{file}
        </p>
        <p className="text-[11px] leading-relaxed text-muted">
          Put <span className="font-mono text-ink/90">first.jpg</span>, <span className="font-mono text-ink/90">second.jpg</span> and{' '}
          <span className="font-mono text-ink/90">third.jpg</span> in <span className="font-mono text-ink/90">public/assets/xray/</span>, then reload.
        </p>
      </div>
    </div>
  )
}

function HospitalXray({ image, index }: { image: (typeof XRAY_IMAGES)[number]; index: number }) {
  // Keyed by file in the parent, so a failed image is retried when the user swipes away and back.
  const [failed, setFailed] = useState(false)
  if (failed) return <MissingXray file={image.file} />
  return (
    <img
      src={`${XRAY_DIR}/${image.file}`}
      alt={`Local X-ray image ${index + 1} of ${XRAY_IMAGES.length} — demonstration navigation, not diagnostic`}
      data-xray={image.file}
      draggable={false}
      onError={() => setFailed(true)}
      className="h-full w-full select-none object-contain"
    />
  )
}

export function HospitalImaging({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hint, setHint] = useState('')
  const hands = useSignatureHands()
  const current = index % XRAY_IMAGES.length
  const study = XRAY_IMAGES[current]
  const zoomPose = usePoseZoom((factor) => setZoom((z) => clamp(z * factor, 1, 3.6)), hands.ready)
  const gesture = zoomPose.gesture ? zoomPose.gesture.replace('_', ' ').toUpperCase() : null

  const step = (dir: number) => {
    setIndex((i) => (i + dir + XRAY_IMAGES.length) % XRAY_IMAGES.length)
    setHint(dir > 0 ? 'NEXT IMAGE' : 'PREVIOUS IMAGE')
  }

  useHorizontalSwipe(
    (dir) => {
      // A new image means a fresh view: keep zoom/pan from drifting between studies.
      setZoom(1)
      setPan({ x: 0, y: 0 })
      step(dir)
      setHint(dir > 0 ? 'SWIPE → NEXT IMAGE' : 'SWIPE ← PREVIOUS IMAGE')
    },
    hands.ready,
  )
  usePointDrag(
    (dx, dy) => {
      setPan((p) => ({ x: clamp(p.x + dx * 1.5, -0.38, 0.38), y: clamp(p.y + dy * 1.5, -0.38, 0.38) }))
      setHint('POINT-DRAG · PAN')
    },
    hands.ready,
  )
  useEffect(() => {
    const h = poseHint(zoomPose)
    if (h) setHint(h)
  }, [zoomPose.direction, zoomPose.gesture, zoomPose.needsReset])

  const reset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setHint('')
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-line/70 bg-[#040a13]', compact ? 'flex h-full min-h-[300px] flex-col' : 'min-h-[300px]')}>
      <ScreenHeader
        icon={<ScanLine className="size-3.5" />}
        title="Imaging · gesture view"
        right={<Pill tone="warn">local file</Pill>}
      />
      <div className={cn('relative mt-2 overflow-hidden rounded-md border border-line/60 bg-black/50', compact && 'min-h-0 flex-1')} style={compact ? undefined : { height: 320 }}>
        <div
          className="absolute inset-0 transition-transform duration-150 ease-out"
          style={{ transform: `translate(${pan.x * 100}%, ${pan.y * 100}%) scale(${zoom})` }}
        >
          <HospitalXray key={study.file} image={study} index={current} />
        </div>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <PoseGuide zoom={zoomPose} />
          <GestureChip active={hands.primary?.gesture === 'open_palm'}>swipe image</GestureChip>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line/70 bg-bg/80 px-2 py-1 text-right font-mono text-[10px] text-ink/80 backdrop-blur">
          {study.id}<br />
          <span className="text-accent">{zoom.toFixed(1)}×</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
          <div>
            <p className="text-xs font-semibold text-ink">{study.title}</p>
            <p className="font-mono text-[9px] text-muted">Local asset · image {current + 1}/{XRAY_IMAGES.length} · not diagnostic</p>
          </div>
          <div className="flex items-center gap-1">
            {XRAY_IMAGES.map((x, i) => (
              <span key={x.id} className={cn('h-1 rounded-full transition-all', i === current ? 'w-5 bg-accent' : 'w-1.5 bg-muted/40')} />
            ))}
          </div>
        </div>
        {!hands.primary && <NoHand>Open the imaging control with the Intent Engine first, then move an open palm horizontally to swipe. Point-drag to pan; pinch to zoom in; hold an open hand still to zoom out.</NoHand>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GestureChip active={!!hint}>{hint || (gesture ? `${gesture} · ACTIVE` : 'WAITING FOR HAND')}</GestureChip>
        <span className="text-[10px] text-muted">Open-palm swipe changes image · point-drag pans · pinch zooms in · open hand zooms out</span>
        <div className="ml-auto flex items-center gap-1">
          <button aria-label="Previous image" onClick={() => step(-1)} className="rounded border border-line p-0.5 text-muted hover:text-ink">
            <ChevronLeft className="size-3.5" />
          </button>
          <button aria-label="Next image" onClick={() => step(1)} className="rounded border border-line p-0.5 text-muted hover:text-ink">
            <ChevronRight className="size-3.5" />
          </button>
          <button onClick={reset} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink">
            Reset view
          </button>
        </div>
      </div>
      {!compact && (
        <ScreenNote>
          View navigation only — every mode action still requires the Intent Engine. Images are local files you provide
          (public/assets/xray), never fetched from a medical system, and shown for demonstration only.
        </ScreenNote>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ SEMICONDUCTOR
const DIES = Array.from({ length: 42 }, (_, i) => ({
  id: `D${String(i + 1).padStart(2, '0')}`,
  state: i === 7 || i === 19 ? 'flagged' : i === 12 || i === 27 || i === 33 ? 'review' : 'ok',
}))
const DEFECT_CALLOUTS = [
  { x: 196, y: 112, label: 'EDGE-07', kind: 'flagged' },
  { x: 132, y: 166, label: 'SCR-19', kind: 'flagged' },
  { x: 250, y: 196, label: 'REVIEW-27', kind: 'review' },
  { x: 296, y: 122, label: 'REVIEW-33', kind: 'review' },
]

export function WaferInspector({ compact = false }: { compact?: boolean }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hint, setHint] = useState('')
  const hands = useSignatureHands()
  const uid = useId().replace(/:/g, '')
  const detail = clamp((zoom - 1) / 2.4, 0, 1)

  const zoomPose = usePoseZoom((factor) => setZoom((z) => clamp(z * factor, 1, 5)), hands.ready)
  usePointDrag(
    (dx, dy) => {
      setPan((p) => ({ x: clamp(p.x + dx * 1.7, -0.45, 0.45), y: clamp(p.y + dy * 1.7, -0.45, 0.45) }))
      setHint('POINT-DRAG · PAN')
    },
    hands.ready,
  )
  useEffect(() => {
    const h = poseHint(zoomPose)
    if (h) setHint(h)
  }, [zoomPose.direction, zoomPose.gesture, zoomPose.needsReset])

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-line/70 bg-[#031112]', compact ? 'flex h-full flex-col' : '')}>
      <ScreenHeader icon={<Layers className="size-3.5" />} title="Wafer map · gesture view" right={<Pill tone="warn">simulated</Pill>} />
      <div className="relative mt-2 flex-1 overflow-hidden rounded-md border border-line/60 bg-[#04181a]" style={{ minHeight: compact ? 280 : 330 }}>
        <div
          className="absolute inset-0 transition-transform duration-150 ease-out"
          style={{ transform: `translate(${pan.x * 100}%, ${pan.y * 100}%) scale(${zoom})` }}
        >
          <svg viewBox="0 0 380 300" className="h-full w-full" role="img" aria-label="Fictional wafer map — simulated data">
            <defs>
              <clipPath id={`${uid}-wafer`}><circle cx="190" cy="144" r="112" /></clipPath>
              <radialGradient id={`${uid}-bg`} cx="50%" cy="45%" r="65%">
                <stop offset="0%" stopColor="#0a2528" />
                <stop offset="100%" stopColor="#031112" />
              </radialGradient>
            </defs>
            <rect width="380" height="300" fill={`url(#${uid}-bg)`} />
            <circle cx="190" cy="144" r="118" fill="none" stroke="#42d6c5" strokeOpacity="0.55" strokeWidth="2" />
            <circle cx="190" cy="144" r="112" fill="#0a1e20" />
            <g clipPath={`url(#${uid}-wafer)`}>
              {DIES.map((d, i) => {
                const col = i % 7
                const row = Math.floor(i / 7)
                const x = 104 + col * 24
                const y = 64 + row * 25
                const fill = d.state === 'flagged' ? '#f5b942' : d.state === 'review' ? '#4da3ff' : '#1b4b4a'
                return (
                  <g key={d.id}>
                    <rect x={x} y={y} width="20" height="20" rx="2" fill={fill} opacity={d.state === 'ok' ? 0.7 : 0.9} stroke="#04181a" strokeWidth="1.5" />
                    {d.state !== 'ok' && <path d={`M${x + 5} ${y + 5}l10 10M${x + 15} ${y + 5}l-10 10`} stroke="#04181a" strokeWidth="1.5" opacity={0.55} />}
                  </g>
                )
              })}
            </g>
            {DEFECT_CALLOUTS.map((c) => (
              <g key={c.label} opacity={0.16 + detail * 0.84}>
                <circle cx={c.x} cy={c.y} r={9 + detail * 5} fill="none" stroke={c.kind === 'flagged' ? '#f5b942' : '#4da3ff'} strokeWidth="1.5" />
                <line x1={c.x} y1={c.y} x2={c.x + 38} y2={c.y - 26} stroke={c.kind === 'flagged' ? '#f5b942' : '#4da3ff'} strokeWidth="1" opacity="0.65" />
                <text x={c.x + 41} y={c.y - 28} fill={c.kind === 'flagged' ? '#f5b942' : '#4da3ff'} fontSize="9" fontFamily="ui-monospace,monospace">{c.label}</text>
              </g>
            ))}
            <g fill="#6f8f8f" fontSize="9" fontFamily="ui-monospace,monospace">
              <text x="12" y="288">SIMULATED WAFER · LOT DEMO-0042 · NOT METROLOGY</text>
            </g>
          </svg>
        </div>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <PoseGuide zoom={zoomPose} />
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line/70 bg-bg/80 px-2 py-1 font-mono text-[10px] text-ink/80 backdrop-blur">
          {zoom.toFixed(1)}×<br />
          <span className={detail > 0.5 ? 'text-warn' : 'text-muted'}>{Math.round(detail * 100)}% detail</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
          <span className="font-mono text-[9px] text-warn">FLAGGED 2 · REVIEW 3</span>
          <span className="text-[10px] text-muted">Pinch to zoom in; open hand held still to zoom out. Defect labels sharpen with zoom.</span>
        </div>
        {!hands.primary && <NoHand>Open the inspection view first. Pinch to zoom in, hold an open hand still to zoom out, or point-drag to pan.</NoHand>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GestureChip active={!!hint}>{hint || 'PINCH IN · OPEN HAND OUT · POINT PAN'}</GestureChip>
        <span className="text-[10px] text-muted">Point-drag pans; open-palm swipe changes the view.</span>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setHint('') }} className="ml-auto rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink">Reset view</button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ INDUSTRIAL
export function MachineViewer({ compact = false }: { compact?: boolean }) {
  const state = useModeState()
  const [rotation, setRotation] = useState(0)
  const [viewStep, setViewStep] = useState(state?.stepIndex ?? 0)
  const [selected, setSelected] = useState<string | null>(null)
  const [hint, setHint] = useState('')
  const hands = useSignatureHands()
  const pinchPrev = useRef<boolean | null>(null)
  let nearest: { id: string; d: number } | null = null
  if (hands.primary) {
    for (const c of MACHINE_COMPONENTS) {
      const d = Math.hypot(c.x - hands.primary.x, c.y - hands.primary.y)
      if (!nearest || d < nearest.d) nearest = { id: c.id, d }
    }
  }
  const hovered = nearest && nearest.d < 0.22 ? MACHINE_COMPONENTS.find((c) => c.id === nearest!.id) ?? null : null
  const info = MACHINE_COMPONENTS.find((c) => c.id === selected) ?? null

  useFistRotation((deg) => {
    setRotation((r) => clamp(r + deg, -70, 70))
    setHint('FIST ROTATE · MODEL')
  }, hands.ready)

  useHorizontalSwipe((dir) => {
    setViewStep((s) => (s + dir + MANUAL_STEPS.length) % MANUAL_STEPS.length)
    setHint(dir > 0 ? 'SWIPE → NEXT STEP' : 'SWIPE ← PREVIOUS STEP')
  }, hands.ready)

  useEffect(() => {
    const pinching = hands.primary?.gesture === 'pinch'
    // Ignore the gesture that was already present when the screen mounted; only a new pinch counts.
    if (pinchPrev.current === null) {
      pinchPrev.current = pinching
      return
    }
    if (pinching && !pinchPrev.current && hands.ready && hovered) {
      setSelected(hovered.id)
      setHint(`PINCH · ${hovered.label.toUpperCase()}`)
    }
    pinchPrev.current = pinching
  }, [hands.primary?.gesture, hands.ready, hovered])

  const current = MANUAL_STEPS[viewStep % MANUAL_STEPS.length]

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-line/70 bg-bg/50', compact ? 'flex h-full flex-col' : '')}>
      <ScreenHeader icon={<Wrench className="size-3.5" />} title="Machine diagram · gesture view" right={<Pill tone="warn">fictional</Pill>} />
      <div className="relative mt-2 flex-1 overflow-hidden rounded-md border border-line/60 bg-[#07101c]" style={{ minHeight: compact ? 280 : 320 }}>
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute inset-0 transition-transform duration-150" style={{ transform: `rotate(${rotation}deg)` }}>
          <svg viewBox="0 0 380 280" className="h-full w-full" role="img" aria-label="Interactive fictional machine diagram">
            <g fill="none" stroke="#40567a" strokeWidth="2.5">
              <rect x="42" y="148" width="118" height="70" rx="8" fill="#0d1a2c" />
              <circle cx="101" cy="183" r="24" fill="#132238" stroke="#f5b942" />
              <path d="M101 183l15-13" stroke="#f5b942" strokeWidth="4" strokeLinecap="round" />
              <path d="M160 164h48v-42h74" />
              <rect x="238" y="88" width="84" height="84" rx="8" fill="#0d1a2c" />
              <path d="M256 154c12-30 36-30 48 0" stroke="#42d6c5" />
              <path d="M322 140h36v48h-36z" fill="#0d1a2c" />
              <path d="M330 140v-20h28" stroke="#4da3ff" />
              <circle cx="348" cy="160" r="10" fill="#132238" stroke="#4da3ff" />
              <path d="M160 216v-32M160 184h62" strokeDasharray="6 5" />
            </g>
            <g fill="#6f86a5" fontSize="9" fontFamily="ui-monospace,monospace">
              <text x="44" y="140">MOTOR / DEMO</text>
              <text x="238" y="80">SEAL SENSOR</text>
              <text x="324" y="208">OUTLET</text>
              <text x="42" y="260">FICTIONAL DIAGRAM · VIEW-ONLY</text>
            </g>
            {MACHINE_COMPONENTS.map((c) => {
              const active = hovered?.id === c.id
              return (
                <g key={c.id} opacity={active ? 1 : 0.75}>
                  <circle cx={(c.x * 380)} cy={(c.y * 280)} r={active ? 11 : 8} fill={active ? '#f5b942' : '#132238'} stroke={active ? '#f5b942' : '#8796aa'} strokeWidth="1.5" />
                  <circle cx={(c.x * 380)} cy={(c.y * 280)} r={active ? 18 : 13} fill="none" stroke={active ? '#f5b942' : '#4a6284'} strokeOpacity="0.5" />
                </g>
              )
            })}
          </svg>
        </div>
        {hands.primary && (
          <div className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/30" style={{ left: `${hands.primary.x * 100}%`, top: `${hands.primary.y * 100}%` }} />
        )}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <GestureChip active={hands.primary?.gesture === 'fist'}>fist rotate</GestureChip>
          <GestureChip active={hands.primary?.gesture === 'pinch'}>pinch select</GestureChip>
          <GestureChip active={!!hint}>swipe step</GestureChip>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line/70 bg-bg/80 px-2 py-1 text-right font-mono text-[10px] text-ink/80 backdrop-blur">
          {rotation.toFixed(0)}°<br />
          <span className="text-muted">view step {viewStep + 1}/{MANUAL_STEPS.length}</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-7">
          <p className="text-[10px] font-medium text-ink">{current.title}</p>
          <p className="text-[9px] text-muted">Viewing only — completing a step still requires the authorised COMPLETE control.</p>
        </div>
        {!hands.primary && <NoHand>Make a fist and rotate it to turn the diagram, swipe horizontally to browse repair steps, and pinch near a component to open its information.</NoHand>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GestureChip active={!!hint}>{hint || 'FIST ROTATE · SWIPE · PINCH'}</GestureChip>
        <button onClick={() => setRotation(0)} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink">Reset rotation</button>
      </div>
      {info && (
        <div className="mt-2 rounded-lg border border-warn/30 bg-warn/5 p-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-ink">{info.label}</p>
            <span className="ml-auto text-[9px] uppercase text-warn">simulated component</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">{info.description}</p>
        </div>
      )}
      {!info && <p className="mt-2 text-[10px] text-muted">Hover a component marker and pinch to open its fictional information.</p>}
      {!compact && <ScreenNote>Diagram rotation and step browsing are view interactions. No machine, PLC or safety system is connected.</ScreenNote>}
    </div>
  )
}

// ------------------------------------------------------------------ FOOD
export function PrepTimer({ compact = false, live = false, hideHeader = false }: { compact?: boolean; live?: boolean; hideHeader?: boolean }) {
  const state = useModeState()
  const [duration, setDuration] = useState(180)
  const [remaining, setRemaining] = useState(180)
  const [running, setRunning] = useState(false)
  const [viewStep, setViewStep] = useState(state?.stepIndex ?? 0)
  const [hint, setHint] = useState('')
  const hands = useSignatureHands()
  const pinchPrev = useRef<boolean | null>(null)
  const recipe = RECIPES[(state?.recipeIndex ?? 0) % RECIPES.length]
  const steps = recipe.steps

  useCircularGesture((deg) => {
    if (running) return
    setDuration((d) => {
      const next = clamp(Math.round((d + deg * 0.6) / 5) * 5, 30, 600)
      setRemaining(next)
      return next
    })
    setHint(deg > 0 ? 'CLOCKWISE · ADD TIME' : 'COUNTER-CLOCKWISE · REDUCE')
  }, hands.ready && !running)

  // Keep swipe navigation on the lower edge so a circular timing gesture cannot also page steps.
  useHorizontalSwipe((dir) => {
    setViewStep((s) => (s + dir + steps.length) % steps.length)
    setHint(dir > 0 ? 'SWIPE → NEXT PREP STEP' : 'SWIPE ← PREVIOUS STEP')
  }, hands.ready && !!hands.primary && hands.primary.y > 0.64)

  useEffect(() => {
    const pinching = hands.primary?.gesture === 'pinch'
    // A pinch already present at mount must not start the timer by itself.
    if (pinchPrev.current === null) {
      pinchPrev.current = pinching
      return
    }
    if (pinching && !pinchPrev.current && hands.ready) {
      if (!running) {
        setRemaining(duration)
        setRunning(true)
        setHint('PINCH · TIMER CONFIRMED')
      } else {
        setRunning(false)
        setHint('PINCH · TIMER PAUSED')
      }
    }
    pinchPrev.current = pinching
  }, [hands.primary?.gesture, hands.ready, running, duration])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 0.5) {
          setRunning(false)
          setHint('TIME UP · SIMULATED')
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [running])

  const pct = duration > 0 ? remaining / duration : 0
  const circ = 2 * Math.PI * 78

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-line/70 p-3', live ? 'border-0 bg-transparent' : 'bg-bg/50', compact || live ? 'flex h-full flex-col' : '')}>
      {!hideHeader && <ScreenHeader icon={<TimerReset className="size-3.5" />} title="Preparation timer · gesture" right={<Pill tone="warn">simulated</Pill>} />}
      <div className="mt-2 flex flex-1 flex-col items-center justify-center gap-2">
        <div className="relative">
          <svg viewBox="0 0 200 200" className={cn(live ? 'size-40' : 'size-48 sm:size-56')} role="img" aria-label={`Simulated preparation timer ${fmt(remaining)}`}>
            <circle cx="100" cy="100" r="78" fill="none" stroke="#1c2a42" strokeWidth="10" />
            <circle
              cx="100" cy="100" r="78" fill="none" stroke={running ? '#42d6c5' : '#ef8f6b'} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 100 100)"
              style={{ transition: 'stroke-dashoffset 0.6s linear' }}
            />
            <text x="100" y="94" textAnchor="middle" fill="#eaf1fa" fontSize="30" fontFamily="ui-monospace,monospace">{fmt(remaining)}</text>
            <text x="100" y="116" textAnchor="middle" fill="#8796aa" fontSize="9" fontFamily="ui-monospace,monospace">{running ? 'RUNNING · SIMULATED' : 'SET DURATION'}</text>
            <text x="100" y="132" textAnchor="middle" fill="#ef8f6b" fontSize="9" fontFamily="ui-monospace,monospace">TARGET {fmt(duration)}</text>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center">
            <span className={cn('mb-1 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider', running ? 'border-teal/40 bg-teal/10 text-teal' : 'border-line bg-bg/80 text-muted')}>{running ? 'counting down' : 'adjust with circle'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <GestureChip active={!!hands.primary && !running && hands.primary.gesture !== 'pinch'}>circle to adjust</GestureChip>
          <GestureChip active={hands.primary?.gesture === 'pinch'}>pinch confirm</GestureChip>
          <GestureChip active={!!hint}>swipe step</GestureChip>
        </div>
        <p className="text-center text-[11px] leading-snug text-muted">
          {hint || (hands.primary ? 'Move an open palm in a circle to set the duration, then pinch to start. Swipe along the lower edge to page steps.' : 'Circle an open palm around the timer centre; pinch confirms the duration.')}
        </p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-line/60 bg-bg/40 px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted">Authorised timer</span>
        <span className={cn('font-mono text-[10px]', state?.timer.running ? 'text-teal' : 'text-muted')}>
          {state?.timer.running ? `running · ${state.timer.label || 'demo'}` : 'idle · start with TIMER + pinch'}
        </span>
      </div>
      <div className="mt-2 rounded-lg border border-line/60 bg-bg/40 p-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-muted">Preparation step</p>
          <div className="flex gap-1">
            <button onClick={() => setViewStep((s) => (s - 1 + steps.length) % steps.length)} className="rounded border border-line p-0.5 text-muted hover:text-ink" aria-label="Previous preparation step"><ChevronLeft className="size-3" /></button>
            <button onClick={() => setViewStep((s) => (s + 1) % steps.length)} className="rounded border border-line p-0.5 text-muted hover:text-ink" aria-label="Next preparation step"><ChevronRight className="size-3" /></button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-ink"><span className="font-mono text-muted">{viewStep + 1}/{steps.length}</span> · {steps[viewStep]}</p>
        <p className="mt-0.5 text-[9px] text-muted">Viewing only — advancing the authorised preparation step still requires NEXT STEP + pinch.</p>
      </div>
      {!compact && <ScreenNote>Timer and step view are demonstration-only. No kitchen equipment, timer or order system is connected.</ScreenNote>}
    </div>
  )
}

// ------------------------------------------------------------------ ACCESSIBILITY
export function AdaptivePanels({ compact = false }: { compact?: boolean }) {
  const state = useModeState()
  const hands = useSignatureHands()
  const dwellMs = useConduit((s) => Math.round((s.settings?.intent.min_dwell_s ?? 1.6) * 1000))
  const [large, setLarge] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [dwell, setDwell] = useState(0)
  const holdRef = useRef<{ index: number | null; since: number }>({ index: null, since: 0 })
  const focused = CONTENT_ITEMS[(state?.focusIndex ?? 0) % CONTENT_ITEMS.length]

  useEffect(() => {
    if (!hands.primary) {
      setHover(null)
      setDwell(0)
      return
    }
    const cols = large ? 1 : 2
    const rows = 2
    const col = Math.min(cols - 1, Math.max(0, Math.floor(hands.primary.x * cols)))
    const row = Math.min(rows - 1, Math.max(0, Math.floor((hands.primary.y - 0.05) / 0.65 * rows)))
    const idx = Math.min(CONTENT_ITEMS.length - 1, row * cols + col)
    setHover(idx)
    const now = performance.now()
    if (holdRef.current.index !== idx) {
      holdRef.current = { index: idx, since: now }
      setDwell(0)
    } else {
      setDwell(clamp((now - holdRef.current.since) / dwellMs, 0, 1))
    }
  }, [hands.primary?.x, hands.primary?.y, large, dwellMs])

  useEffect(() => {
    if (hover == null) return
    const id = window.setInterval(() => {
      const now = performance.now()
      setDwell(clamp((now - holdRef.current.since) / dwellMs, 0, 1))
    }, 120)
    return () => window.clearInterval(id)
  }, [hover, dwellMs])

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-line/70 bg-bg/50 p-3', compact ? 'flex h-full flex-col' : '')}>
      <ScreenHeader
        icon={<Sparkles className="size-3.5" />}
        title="Adaptive panels · gesture focus"
        right={
          <button onClick={() => setLarge((v) => !v)} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink">
            {large ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />} {large ? 'standard' : 'large panels'}
          </button>
        }
      />
      <div className={cn('mt-2 grid flex-1 gap-2', large ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
        {CONTENT_ITEMS.map((item, i) => {
          const isHover = hover === i
          const isFocus = ((state?.focusIndex ?? 0) % CONTENT_ITEMS.length) === i
          return (
            <div
              key={item.id}
              className={cn(
                'relative overflow-hidden rounded-xl border transition-colors',
                large || compact ? 'p-4' : 'p-3',
                isFocus ? 'border-[#b18cff]/70 bg-[#b18cff]/10' : isHover ? 'border-accent/60 bg-accent/8' : 'border-line/60 bg-bg/40',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={cn('font-semibold text-ink', large || compact ? 'text-base' : 'text-sm')}>{item.title}</p>
                {isFocus && <Pill tone="accent">focus</Pill>}
              </div>
              <p className={cn('mt-1 text-muted', large || compact ? 'line-clamp-4 text-xs leading-relaxed' : 'line-clamp-3 text-[10px]')}>{item.body}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-wider text-muted">hand focus</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface2">
                  <span className="block h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${isHover ? dwell * 100 : 0}%` }} />
                </div>
              </div>
              {isHover && (
                <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-accent/40 bg-bg/80 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-accent">
                  {dwell >= 1 ? 'ready for confirmation' : 'hand over'}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GestureChip active={!!hover}>hand focus preview</GestureChip>
        <GestureChip active={state?.panel === 'reading'}>reading view</GestureChip>
        <span className="text-[10px] text-muted">Preview only — SELECT / READ still need the configured confirmation gesture.</span>
      </div>
      {state?.panel === 'reading' && (
        <div className="mt-2 rounded-lg border border-[#b18cff]/30 bg-[#b18cff]/5 p-3">
          <p className="text-xs font-semibold text-ink">Reading view · {focused.title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{focused.body}</p>
        </div>
      )}
      {!compact && <ScreenNote>Focus preview is not a command. Large controls, dwell, sensitivity and confirmation gesture are configured in this environment's dashboard. No claim of suitability for every user is made.</ScreenNote>}
    </div>
  )
}

// ------------------------------------------------------------------ two-camera signature layout
// CAM 1 is the gesture camera: the same stream MediaPipe is tracking, drawn with landmarks.
// CAM 2 is a separate physical camera pointed at the object; only this image is zoomed/panned/rotated.

type ObjectCameraStatus = 'starting' | 'live' | 'fallback' | 'error'
function useObjectCamera() {
  const gestureStream = useConduit((s) => s.stream)
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([])
  const [selected, setSelected] = useState(readObjectCameraId)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<ObjectCameraStatus>('starting')
  const [error, setError] = useState('')
  const gestureId = gestureStream?.getVideoTracks()[0]?.getSettings().deviceId ?? null

  useEffect(() => subscribeObjectCamera(setSelected), [])

  useEffect(() => {
    if (selected) writeObjectCameraId(selected)
  }, [selected])

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setStatus('error')
      setError('Camera enumeration is unavailable in this browser.')
      return
    }
    let cancelled = false
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (cancelled) return
        const cams = all.filter((d) => d.kind === 'videoinput').map((d) => ({ id: d.deviceId, label: d.label || 'Camera' }))
        setDevices(cams)
        if (cams.length === 0) {
          setStatus('error')
          setError('No camera devices were found.')
        }
        setSelected((current) => {
          if (current && cams.some((c) => c.id === current)) return current
          return cams.find((c) => c.id !== gestureId)?.id ?? cams[0]?.id ?? ''
        })
      })
      .catch((e) => {
        if (cancelled) return
        setStatus('error')
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [gestureStream, gestureId])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    let own: MediaStream | null = null
    setStatus('starting')
    setError('')
    const run = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (gestureStream) {
          setStream(gestureStream)
          setStatus('fallback')
          setError('This browser cannot open a separate object camera.')
        } else {
          setStatus('error')
          setError('This browser cannot open a second camera.')
        }
        return
      }
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: selected ? { deviceId: { exact: selected }, width: { ideal: 1280 }, height: { ideal: 720 } } : true,
          audio: false,
        })
        if (cancelled) {
          ms.getTracks().forEach((t) => t.stop())
          return
        }
        own = ms
        setStream(ms)
        setStatus(gestureId && selected === gestureId ? 'fallback' : 'live')
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        // A laptop with one webcam cannot open the same device twice. Mirror the gesture stream
        // instead of leaving a black panel, and say so plainly.
        if (gestureStream) {
          setStream(gestureStream)
          setStatus('fallback')
          setError(msg)
        } else {
          setStream(null)
          setStatus('error')
          setError(msg)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
      own?.getTracks().forEach((t) => t.stop())
    }
  }, [selected, gestureStream])

  return { stream, devices, selected, status, error, gestureId }
}

function LandmarkOverlay() {
  const frame = useConduit((s) => s.frame)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const W = Math.max(1, rect.width)
    const H = Math.max(1, rect.height)
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const hands: number[][][] = []
    if (frame?.features?.landmarks?.length === 21) hands.push(frame.features.landmarks)
    const second = frame?.second_hand?.features?.landmarks
    if (second?.length === 21) hands.push(second)
    hands.forEach((lm, i) => {
      ctx.strokeStyle = i === 1 ? 'rgba(177,140,255,0.6)' : 'rgba(66,214,197,0.72)'
      ctx.lineWidth = 2
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath()
        ctx.moveTo(lm[a][0] * W, lm[a][1] * H)
        ctx.lineTo(lm[b][0] * W, lm[b][1] * H)
        ctx.stroke()
      }
      lm.forEach((p, idx) => {
        const tip = [4, 8, 12, 16, 20].includes(idx)
        ctx.beginPath()
        ctx.arc(p[0] * W, p[1] * H, tip ? 3.5 : 2.4, 0, Math.PI * 2)
        ctx.fillStyle = tip ? '#42d6c5' : 'rgba(234,241,250,0.85)'
        ctx.fill()
      })
    })
  }, [frame])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}

function GestureFeed() {
  const stream = useConduit((s) => s.stream)
  const runtimeKind = useConduit((s) => s.runtimeKind)
  const camera = useConduit((s) => s.camera)
  const frame = useConduit((s) => s.frame)
  const previewOn = useConduit((s) => s.settings?.privacy.preview_stream ?? true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const running = camera.state === 'running'

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.srcObject = stream
    if (stream) void v.play().catch(() => undefined)
    return () => {
      v.srcObject = null
    }
  }, [stream])

  return (
    <section className="relative min-h-0 overflow-hidden rounded-lg border border-line/60 bg-black">
      {runtimeKind === 'browser' && stream && (
        <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 h-full w-full -scale-x-100 object-fill" />
      )}
      {runtimeKind === 'browser' && !stream && <div className="grid-bg absolute inset-0" />}
      {runtimeKind === 'backend' && running && previewOn && (
        <img src={backendStreamUrl()} alt="Gesture camera preview" className="absolute inset-0 h-full w-full object-fill" />
      )}
      {runtimeKind === 'backend' && running && !previewOn && <div className="grid-bg absolute inset-0" />}
      <LandmarkOverlay />
      {frame?.hand_detected && frame.position && (
        <div
          className="pointer-events-none absolute z-10 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/20"
          style={{ left: `${frame.position.x * 100}%`, top: `${frame.position.y * 100}%` }}
        />
      )}
      <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-2 bg-bg/85 px-2 py-1.5 backdrop-blur">
        <Camera className="size-3.5 text-accent" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink">CAM 1 · gesture</p>
        <span className="ml-auto font-mono text-[9px] text-muted">
          {running ? `${frame?.hand_detected ? 'hand tracked' : 'no hand'} · ${camera.fps.toFixed(0)} FPS` : 'camera off'}
        </span>
      </div>
      {!running && (
        <div className="absolute inset-x-3 bottom-3 rounded border border-line/60 bg-bg/80 px-2 py-1.5 text-center text-[10px] text-muted backdrop-blur">
          Start the camera to track gestures here.
        </div>
      )}
    </section>
  )
}

function TwoCameraView({ title, children }: { title: string; children: React.ReactNode }) {
  const object = useObjectCamera()
  const view = useConduit((s) => s.signatureView)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.srcObject = object.stream
    if (object.stream) void v.play().catch(() => undefined)
    return () => {
      v.srcObject = null
    }
  }, [object.stream])

  const selectedIndex = object.devices.findIndex((d) => d.id === object.selected)
  return (
    <div className="grid h-full min-h-0 grid-rows-[1.45fr_1fr] gap-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] sm:grid-rows-1">
      <GestureFeed />
      <section className="relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-line/60 bg-black">
        <div
          className="absolute inset-0 transition-transform duration-90 ease-linear"
          style={{
            transform: `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.zoom}) rotate(${view.rotation}deg)`,
            transformOrigin: '50% 50%',
          }}
        >
          {object.stream ? (
            <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-fill" />
          ) : (
            <div className="grid-bg absolute inset-0" />
          )}
        </div>
        <div className="relative z-20 flex flex-wrap items-center gap-1.5 bg-bg/85 px-2 py-1.5 backdrop-blur">
          <Camera className="size-3.5 text-warn" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink">
            CAM 2 · object {selectedIndex >= 0 && <span className="font-mono text-muted">#{selectedIndex}</span>}
          </p>
          <Pill tone={object.status === 'live' ? 'teal' : object.status === 'fallback' ? 'warn' : 'neutral'}>
            {object.status === 'live' ? 'live' : object.status === 'starting' ? 'starting' : object.status === 'fallback' ? 'same camera' : 'no camera'}
          </Pill>
          <span className="hidden text-[9px] text-muted md:inline">{title}</span>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-muted">
            camera index in Settings
          </span>
        </div>
        <div className="relative min-h-0 flex-1">
          {children}
          {object.status !== 'live' && object.status !== 'starting' && (
            <div className="absolute inset-x-3 bottom-2 z-10 rounded border border-warn/40 bg-bg/85 px-2 py-1 text-[9px] leading-snug text-warn backdrop-blur">
              {object.status === 'fallback'
                ? 'Second camera unavailable — showing the gesture camera. Connect/select a second webcam for a separate object view.'
                : `Object camera could not open. ${object.error}`}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ LIVE CAMERA SIGNATURES
// Semiconductor / industrial / accessibility manipulate the real webcam image. The transform is
// applied by CameraStage to the video and landmark canvas together; these components are HUDs only.

function LiveZoomBadge({ zoom, rotation }: { zoom: number; rotation?: number }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line/70 bg-bg/80 px-2 py-1 text-right font-mono text-[10px] text-ink/80 backdrop-blur">
      {zoom.toFixed(1)}×
      {rotation !== undefined && <><br /><span className="text-muted">{rotation.toFixed(0)}°</span></>}
    </div>
  )
}

export function LiveCameraZoom() {
  const hands = useSignatureHands()
  const cam = useSignatureCamera()
  const [hint, setHint] = useState('')

  const zoomPose = usePoseZoom((factor) => cam.zoomBy(factor), hands.ready)
  usePointDrag((dx, dy) => {
    cam.panBy(dx, dy)
    setHint('POINT-DRAG · PAN')
  }, hands.ready)
  useEffect(() => {
    const h = poseHint(zoomPose)
    if (h) setHint(h)
  }, [zoomPose.direction, zoomPose.gesture, zoomPose.needsReset])

  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        <PoseGuide zoom={zoomPose} />
      </div>
      <LiveZoomBadge zoom={cam.zoom} />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 rounded-md border border-line/50 bg-bg/75 px-2 py-1.5 backdrop-blur">
        <GestureChip active={!!hint}>{hint || 'PINCH IN · OPEN HAND OUT · POINT PAN'}</GestureChip>
        <span className="text-[10px] text-muted">Only CAM 2 — the object camera — is zoomed and panned.</span>
        <button onClick={() => cam.zoomBy(1 / 1.3)} aria-label="Zoom camera out" className="pointer-events-auto ml-auto rounded border border-line p-1 text-muted hover:text-ink"><Minus className="size-3" /></button>
        <button onClick={() => cam.zoomBy(1.3)} aria-label="Zoom camera in" className="pointer-events-auto rounded border border-line p-1 text-muted hover:text-ink"><Plus className="size-3" /></button>
        <button onClick={cam.reset} className="pointer-events-auto inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"><RotateCcw className="size-3" /> Reset view</button>
      </div>
      {!hands.primary && <NoHand>Pinch thumb and index together to zoom CAM 2 in; hold an open hand still to zoom out; point and drag to pan. After pinching, close your fist briefly before zooming out.</NoHand>}
    </div>
  )
}

export function LiveCameraMachine() {
  const state = useModeState()
  const hands = useSignatureHands()
  const cam = useSignatureCamera()
  const [viewStep, setViewStep] = useState(state?.stepIndex ?? 0)
  const [hint, setHint] = useState('')

  useFistRotation((deg) => {
    cam.rotateBy(deg)
    setHint('FIST ROTATE · LIVE CAMERA')
  }, hands.ready)

  const zoomPose = usePoseZoom((factor) => cam.zoomBy(factor), hands.ready)
  usePointDrag((dx, dy) => {
    cam.panBy(dx, dy)
    setHint('POINT-DRAG · PAN')
  }, hands.ready)
  useEffect(() => {
    const h = poseHint(zoomPose, true)
    if (h) setHint(h)
  }, [zoomPose.direction, zoomPose.gesture, zoomPose.needsReset])

  useHorizontalSwipe((dir) => {
    setViewStep((s) => (s + dir + MANUAL_STEPS.length) % MANUAL_STEPS.length)
    setHint(dir > 0 ? 'SWIPE → NEXT STEP' : 'SWIPE ← PREVIOUS STEP')
  }, hands.ready)

  const current = MANUAL_STEPS[viewStep % MANUAL_STEPS.length]
  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        <PoseGuide zoom={zoomPose} rotate />
        <GestureChip active={hands.primary?.gesture === 'open_palm'}>swipe step</GestureChip>
      </div>
      <LiveZoomBadge zoom={cam.zoom} rotation={cam.rotation} />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md border border-line/50 bg-bg/75 px-2 py-1.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <GestureChip active={!!hint}>{hint || 'PINCH IN · OPEN OUT · FIST ROTATE · POINT PAN'}</GestureChip>
          <span className="font-mono text-[10px] text-muted">{viewStep + 1}/{MANUAL_STEPS.length}</span>
          <button onClick={() => cam.zoomBy(1 / 1.3)} aria-label="Zoom camera out" className="pointer-events-auto ml-auto rounded border border-line p-1 text-muted hover:text-ink"><Minus className="size-3" /></button>
          <button onClick={() => cam.zoomBy(1.3)} aria-label="Zoom camera in" className="pointer-events-auto rounded border border-line p-1 text-muted hover:text-ink"><Plus className="size-3" /></button>
          <button onClick={cam.reset} className="pointer-events-auto inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"><RotateCcw className="size-3" /> Reset view</button>
        </div>
        <p className="mt-1 text-[11px] font-medium text-ink">{current.title}</p>
        <p className="text-[9px] text-muted">Pinch = zoom in · open hand held still = zoom out · fist = rotate · point-drag = pan.</p>
        <p className="text-[9px] text-muted">Viewing only — completing a step still requires the authorised COMPLETE control.</p>
      </div>
      {!hands.primary && <NoHand>Make a fist and rotate it to turn CAM 2. Pinch to zoom in, hold an open hand still to zoom out, point-drag to pan, swipe horizontally to browse steps. After pinching, close your fist briefly before zooming out.</NoHand>}
    </div>
  )
}

export function CameraMagnifier() {
  const hands = useSignatureHands()
  const cam = useSignatureCamera(4)
  const settings = useConduit((s) => s.settings)
  const [hint, setHint] = useState('')

  const zoomPose = usePoseZoom((factor) => cam.zoomBy(factor), hands.ready)
  usePointDrag((dx, dy) => {
    cam.panBy(dx * 0.9, dy * 0.9)
    setHint('POINT-DRAG · PAN')
  }, hands.ready)
  useEffect(() => {
    if (zoomPose.direction === 1) setHint('PINCH · MAGNIFY')
    else if (zoomPose.direction === -1) setHint('OPEN HAND · REDUCE')
    else if (zoomPose.needsReset) setHint('FIST OR POINT · RE-ARM REDUCE')
    else if (zoomPose.gesture === 'pinch') setHint('PINCH · HOLD TO MAGNIFY')
    else if (zoomPose.gesture === 'open_palm') setHint('OPEN HAND · HOLD TO REDUCE')
    else if (zoomPose.gesture === 'point') setHint('POINT-DRAG · PAN')
  }, [zoomPose.direction, zoomPose.gesture, zoomPose.needsReset])

  const bigBtn = 'pointer-events-auto inline-flex size-12 items-center justify-center rounded-xl border border-line bg-bg/85 text-ink shadow-lg backdrop-blur hover:border-accent/60'
  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        <PoseGuide zoom={zoomPose} inLabel="magnify" outLabel="reduce" />
        <GestureChip active>dwell {settings.intent.min_dwell_s.toFixed(1)}s</GestureChip>
      </div>
      <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-line/70 bg-bg/85 px-3 py-2 text-right backdrop-blur">
        <p className="font-mono text-2xl font-semibold text-ink">{cam.zoom.toFixed(1)}×</p>
        <p className="text-[9px] uppercase tracking-wider text-muted">live magnification</p>
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
        <button className={bigBtn} aria-label="Zoom out" onClick={() => cam.zoomBy(1 / 1.3)}><Minus className="size-6" /></button>
        <button className="pointer-events-auto inline-flex h-12 items-center justify-center rounded-xl border border-line bg-bg/85 px-4 text-xs font-medium text-ink shadow-lg backdrop-blur hover:border-accent/60" onClick={cam.reset}>1× · reset</button>
        <button className={bigBtn} aria-label="Zoom in" onClick={() => cam.zoomBy(1.3)}><Plus className="size-6" /></button>
      </div>
      <p className="pointer-events-none absolute inset-x-3 bottom-20 text-center text-[10px] text-ink/80">
        <span className="rounded bg-bg/70 px-2 py-1 backdrop-blur">{hint || 'Pinch to magnify, hold an open hand still to reduce. Large buttons are an alternative to gestures.'}</span>
      </p>
      {!hands.primary && <NoHand>Pinch to magnify, hold an open hand still to reduce, point-drag to pan. After pinching, close your fist briefly before reducing. Large − / + buttons remain available. Magnification is view-only.</NoHand>}
    </div>
  )
}

// ------------------------------------------------------------------ dispatcher
export function SignatureScreen({ modeId }: { modeId: 'hospital' | 'semiconductor' | 'industrial' | 'food_processing' | 'accessibility' }) {
  if (modeId === 'hospital') return <HospitalImaging compact />
  if (modeId === 'semiconductor') {
    return (
      <TwoCameraView title="pinch zoom · open hand out">
        <LiveCameraZoom />
      </TwoCameraView>
    )
  }
  if (modeId === 'industrial') {
    return (
      <TwoCameraView title="fist rotate · pinch zoom">
        <LiveCameraMachine />
      </TwoCameraView>
    )
  }
  if (modeId === 'food_processing') {
    return (
      <TwoCameraView title="preparation timer">
        <PrepTimer compact live hideHeader />
      </TwoCameraView>
    )
  }
  return (
    <TwoCameraView title="adaptive magnification">
      <CameraMagnifier />
    </TwoCameraView>
  )
}
