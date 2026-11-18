import { Camera, ChevronLeft, ChevronRight, Hand, Layers, Maximize2, Minimize2, Minus, Plus, RotateCcw, ScanLine, Sparkles, TimerReset, Wrench } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { CONTENT_ITEMS } from '../../modes/accessibility/demoData'
import { RECIPES } from '../../modes/food/demoData'
import { MANUAL_STEPS, MACHINE_COMPONENTS } from '../../modes/industrial/demoData'
import { clamp, useCircularGesture, useHorizontalSwipe, usePinchDrag, useSignatureCamera, useSignatureHands, useTwoHandTransform, useWristRotation } from '../../modes/signature'
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
const STUDIES = [
  { id: 'IMG-014', title: 'Chest overview', modality: 'Simulated radiograph', variant: 0, note: 'Fictional demonstration study' },
  { id: 'IMG-021', title: 'Head slice', modality: 'Simulated cross-section', variant: 1, note: 'Fictional demonstration study' },
  { id: 'IMG-033', title: 'Abdominal overview', modality: 'Simulated section', variant: 2, note: 'Fictional demonstration study' },
]

function HospitalScan({ variant, uid }: { variant: number; uid: string }) {
  return (
    <svg viewBox="0 0 480 320" className="h-full w-full" role="img" aria-label="Fictional medical image for navigation demonstration — not diagnostic">
      <defs>
        <radialGradient id={`${uid}-bg`} cx="50%" cy="48%" r="70%">
          <stop offset="0%" stopColor="#173652" />
          <stop offset="100%" stopColor="#050a12" />
        </radialGradient>
        <linearGradient id={`${uid}-bone`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dbe9f7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7da2c7" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <rect width="480" height="320" fill={`url(#${uid}-bg)`} />
      {variant === 0 && (
        <g fill="none" stroke={`url(#${uid}-bone)`} strokeWidth="2.5" opacity="0.8">
          <path d="M240 44v210M198 70c-42 14-52 54-38 94M282 70c42 14 52 54 38 94" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${128 - i * 2} ${100 + i * 30}q112 ${22 + i} 224 0`} strokeWidth="1.4" opacity={0.42 + i * 0.06} />
          ))}
          <ellipse cx="238" cy="192" rx="62" ry="46" fill="#0a1828" stroke="#42d6c5" strokeOpacity="0.45" />
          <path d="M176 188h124M214 166v52" stroke="#42d6c5" strokeOpacity="0.25" strokeDasharray="4 5" />
        </g>
      )}
      {variant === 1 && (
        <g fill="none" stroke={`url(#${uid}-bone)`} strokeWidth="2">
          <ellipse cx="240" cy="160" rx="112" ry="128" strokeOpacity="0.75" />
          <ellipse cx="240" cy="160" rx="92" ry="108" stroke="#42d6c5" strokeOpacity="0.5" />
          <path d="M240 32v256M128 160h224" stroke="#8796aa" strokeDasharray="4 5" strokeOpacity="0.45" />
          <ellipse cx="205" cy="145" rx="36" ry="62" fill="#0a1828" stroke="#4da3ff" strokeOpacity="0.55" />
          <ellipse cx="275" cy="145" rx="36" ry="62" fill="#0a1828" stroke="#4da3ff" strokeOpacity="0.55" />
          <circle cx="212" cy="165" r="7" fill="#f5b942" fillOpacity="0.7" stroke="none" />
        </g>
      )}
      {variant === 2 && (
        <g fill="none" stroke={`url(#${uid}-bone)`} strokeWidth="2.2">
          <path d="M180 34c-24 70-16 160 18 252M300 34c24 70 16 160-18 252" />
          <path d="M210 84c-20 80-6 140 20 186M270 84c20 80 6 140-20 186" strokeOpacity="0.55" />
          <path d="M204 122c28-22 66-22 92 0M198 180c34-16 66-16 98 0M204 230c30-12 58-12 84 0" stroke="#42d6c5" strokeOpacity="0.4" />
          <circle cx="272" cy="196" r="12" fill="#f5b942" fillOpacity="0.35" stroke="#f5b942" />
          <circle cx="272" cy="196" r="22" stroke="#f5b942" strokeOpacity="0.35" />
        </g>
      )}
      <g opacity="0.65" stroke="#8796aa" strokeWidth="2">
        <path d="M14 14h12M14 14v12M466 14h-12M466 14v12M14 306h12M14 306v-12M466 306h-12M466 306v-12" />
      </g>
      <text x="16" y="302" fill="#f5b942" opacity="0.75" fontSize="9" fontFamily="ui-monospace,monospace">FICTIONAL IMAGE · NOT DIAGNOSTIC</text>
    </svg>
  )
}

export function HospitalImaging({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hint, setHint] = useState('')
  const uid = useId().replace(/:/g, '')
  const hands = useSignatureHands()
  const study = STUDIES[index % STUDIES.length]
  const gesture = hands.twoHand ? 'TWO-HAND' : hands.primary?.gesture === 'pinch' ? 'PINCH-DRAG' : hands.primary?.gesture === 'open_palm' ? 'OPEN PALM' : null

  useHorizontalSwipe(
    (dir) => {
      setIndex((i) => (i + dir + STUDIES.length) % STUDIES.length)
      setHint(dir > 0 ? 'SWIPE → NEXT IMAGE' : 'SWIPE ← PREVIOUS IMAGE')
    },
    hands.ready && !hands.twoHand,
  )
  usePinchDrag(
    (dx, dy) => {
      if (hands.twoHand) return
      setPan((p) => ({ x: clamp(p.x + dx * 1.5, -0.38, 0.38), y: clamp(p.y + dy * 1.5, -0.38, 0.38) }))
      setHint('PINCH-DRAG · PAN')
    },
    hands.ready && !hands.twoHand,
  )
  useTwoHandTransform(
    (d) => {
      if (Math.abs(d.spread) > Math.abs(d.x) + Math.abs(d.y)) {
        setZoom((z) => clamp(z * (1 + d.spread * 3.2), 1, 3.6))
        setHint('TWO-HAND · ZOOM')
      } else {
        setPan((p) => ({ x: clamp(p.x - d.x * 1.6, -0.38, 0.38), y: clamp(p.y - d.y * 1.6, -0.38, 0.38) }))
        setHint('TWO-HAND · PAN')
      }
    },
    hands.ready,
  )

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
        right={<Pill tone="warn">fictional</Pill>}
      />
      <div className={cn('relative mt-2 overflow-hidden rounded-md border border-line/60 bg-black/50', compact && 'min-h-0 flex-1')} style={compact ? undefined : { height: 320 }}>
        <div
          className="absolute inset-0 transition-transform duration-150 ease-out"
          style={{ transform: `translate(${pan.x * 100}%, ${pan.y * 100}%) scale(${zoom})` }}
        >
          <HospitalScan variant={study.variant} uid={uid} />
        </div>
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <GestureChip active={!!hands.twoHand}>two-hand zoom</GestureChip>
          <GestureChip active={hands.primary?.gesture === 'pinch' && !hands.twoHand}>pinch-drag pan</GestureChip>
          <GestureChip active={hands.primary?.gesture === 'open_palm' && !hands.twoHand}>swipe image</GestureChip>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line/70 bg-bg/80 px-2 py-1 text-right font-mono text-[10px] text-ink/80 backdrop-blur">
          {study.id}<br />
          <span className="text-accent">{zoom.toFixed(1)}×</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
          <div>
            <p className="text-xs font-semibold text-ink">{study.title}</p>
            <p className="font-mono text-[9px] text-muted">{study.modality} · image {index + 1}/{STUDIES.length} · {study.note}</p>
          </div>
          <div className="flex items-center gap-1">
            {STUDIES.map((s, i) => (
              <span key={s.id} className={cn('h-1 rounded-full transition-all', i === index ? 'w-5 bg-accent' : 'w-1.5 bg-muted/40')} />
            ))}
          </div>
        </div>
        {!hands.primary && <NoHand>Open the imaging control with the Intent Engine first, then move an open palm horizontally. Pinch-drag to pan; use both hands to spread/pinch for zoom.</NoHand>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GestureChip active={!!hint}>{hint || (gesture ? `${gesture} · ACTIVE` : 'WAITING FOR HAND')}</GestureChip>
        <span className="text-[10px] text-muted">Horizontal swipe changes image · pinch-drag pans · two-hand spread zooms</span>
        <button onClick={reset} className="ml-auto rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink">Reset view</button>
      </div>
      {!compact && <ScreenNote>View navigation only. Opening this viewer and every mode action still requires the Intent Engine; the image is fictional and not diagnostic.</ScreenNote>}
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

  useTwoHandTransform(
    (d) => {
      if (Math.abs(d.spread) > (Math.abs(d.x) + Math.abs(d.y)) * 1.15) {
        setZoom((z) => clamp(z * (1 + d.spread * 3.5), 1, 5))
        setHint(d.spread > 0 ? 'TWO-HAND SPREAD · ZOOM IN' : 'TWO-HAND PINCH · ZOOM OUT')
      } else {
        setPan((p) => ({ x: clamp(p.x - d.x * 1.8, -0.45, 0.45), y: clamp(p.y - d.y * 1.8, -0.45, 0.45) }))
        setHint('TWO-HAND TOGETHER · PAN')
      }
    },
    hands.ready,
  )
  usePinchDrag(
    (dx, dy) => {
      if (hands.twoHand) return
      setPan((p) => ({ x: clamp(p.x + dx * 1.7, -0.45, 0.45), y: clamp(p.y + dy * 1.7, -0.45, 0.45) }))
      setHint('PINCH-DRAG · PAN')
    },
    hands.ready && !hands.twoHand,
  )

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
          <GestureChip active={hands.twoHand}>two-hand zoom / pan</GestureChip>
          <GestureChip active={hands.primary?.gesture === 'pinch' && !hands.twoHand}>pinch-drag pan</GestureChip>
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-line/70 bg-bg/80 px-2 py-1 font-mono text-[10px] text-ink/80 backdrop-blur">
          {zoom.toFixed(1)}×<br />
          <span className={detail > 0.5 ? 'text-warn' : 'text-muted'}>{Math.round(detail * 100)}% detail</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
          <span className="font-mono text-[9px] text-warn">FLAGGED 2 · REVIEW 3</span>
          <span className="text-[10px] text-muted">Spread both hands to zoom in; defect labels sharpen with zoom.</span>
        </div>
        {!hands.primary && <NoHand>Open the inspection view first. Spread both hands apart to zoom, bring them together to zoom out, or move both hands together to pan.</NoHand>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GestureChip active={!!hint}>{hint || (hands.twoHand ? 'TWO HANDS DETECTED' : 'TWO-HAND VIEW')}</GestureChip>
        <span className="text-[10px] text-muted">Single-hand fallback: pinch-drag to pan.</span>
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

  useWristRotation((deg) => {
    setRotation((r) => clamp(r + deg, -70, 70))
    setHint('WRIST ROTATE · MODEL')
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
          <GestureChip active={!!hands.primary && hands.primary.gesture !== 'pinch'}>wrist rotate</GestureChip>
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
        {!hands.primary && <NoHand>Rotate your wrist to turn the diagram, swipe horizontally to browse repair steps, and pinch near a component to open its information.</NoHand>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <GestureChip active={!!hint}>{hint || 'WRIST · SWIPE · PINCH'}</GestureChip>
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

  useTwoHandTransform((d) => {
    if (Math.abs(d.spread) > (Math.abs(d.x) + Math.abs(d.y)) * 1.15) {
      cam.zoomBy(1 + d.spread * 3.4)
      setHint(d.spread > 0 ? 'TWO-HAND SPREAD · ZOOM IN' : 'TWO-HAND PINCH · ZOOM OUT')
    } else {
      cam.panBy(d.x, d.y)
      setHint('TWO-HAND TOGETHER · PAN')
    }
  }, hands.ready)

  usePinchDrag((dx, dy) => {
    cam.panBy(dx * 0.9, dy * 0.9)
    setHint('PINCH-DRAG · PAN')
  }, hands.ready && !hands.twoHand)

  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        <GestureChip active={hands.twoHand}>two-hand zoom / pan</GestureChip>
        <GestureChip active={hands.primary?.gesture === 'pinch' && !hands.twoHand}>pinch-drag pan</GestureChip>
      </div>
      <LiveZoomBadge zoom={cam.zoom} />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 rounded-md border border-line/50 bg-bg/75 px-2 py-1.5 backdrop-blur">
        <GestureChip active={!!hint}>{hint || (hands.twoHand ? 'TWO HANDS DETECTED' : 'SPREAD BOTH HANDS TO ZOOM')}</GestureChip>
        <span className="text-[10px] text-muted">Only CAM 2 — the object camera — is zoomed and panned.</span>
        <button onClick={() => cam.zoomBy(1 / 1.3)} aria-label="Zoom camera out" className="pointer-events-auto ml-auto rounded border border-line p-1 text-muted hover:text-ink"><Minus className="size-3" /></button>
        <button onClick={() => cam.zoomBy(1.3)} aria-label="Zoom camera in" className="pointer-events-auto rounded border border-line p-1 text-muted hover:text-ink"><Plus className="size-3" /></button>
        <button onClick={cam.reset} className="pointer-events-auto inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"><RotateCcw className="size-3" /> Reset view</button>
      </div>
      {!hands.primary && <NoHand>Spread both hands apart to zoom CAM 2 in, bring them together to zoom out, or move both hands to pan. One-handed fallback: pinch and drag.</NoHand>}
    </div>
  )
}

export function LiveCameraMachine() {
  const state = useModeState()
  const hands = useSignatureHands()
  const cam = useSignatureCamera()
  const [viewStep, setViewStep] = useState(state?.stepIndex ?? 0)
  const [hint, setHint] = useState('')

  useWristRotation((deg) => {
    cam.rotateBy(deg)
    setHint('WRIST ROTATE · LIVE CAMERA')
  }, hands.ready && !hands.twoHand)

  useTwoHandTransform((d) => {
    if (Math.abs(d.spread) > (Math.abs(d.x) + Math.abs(d.y)) * 1.15) {
      cam.zoomBy(1 + d.spread * 3.4)
      setHint(d.spread > 0 ? 'TWO-HAND SPREAD · ZOOM IN' : 'TWO-HAND PINCH · ZOOM OUT')
    } else {
      cam.panBy(d.x, d.y)
      setHint('TWO-HAND TOGETHER · PAN')
    }
  }, hands.ready)

  usePinchDrag((dx, dy) => {
    cam.panBy(dx * 0.9, dy * 0.9)
    setHint('PINCH-DRAG · PAN')
  }, hands.ready && !hands.twoHand)

  useHorizontalSwipe((dir) => {
    setViewStep((s) => (s + dir + MANUAL_STEPS.length) % MANUAL_STEPS.length)
    setHint(dir > 0 ? 'SWIPE → NEXT STEP' : 'SWIPE ← PREVIOUS STEP')
  }, hands.ready && !hands.twoHand)

  const current = MANUAL_STEPS[viewStep % MANUAL_STEPS.length]
  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        <GestureChip active={!!hands.primary && !hands.twoHand}>wrist rotate</GestureChip>
        <GestureChip active={hands.twoHand}>two-hand zoom / pan</GestureChip>
        <GestureChip active={hands.primary?.gesture === 'pinch' && !hands.twoHand}>pinch-drag pan</GestureChip>
      </div>
      <LiveZoomBadge zoom={cam.zoom} rotation={cam.rotation} />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md border border-line/50 bg-bg/75 px-2 py-1.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <GestureChip active={!!hint}>{hint || 'WRIST ROTATE · TWO-HAND ZOOM · SWIPE STEP'}</GestureChip>
          <span className="font-mono text-[10px] text-muted">{viewStep + 1}/{MANUAL_STEPS.length}</span>
          <button onClick={() => cam.zoomBy(1 / 1.3)} aria-label="Zoom camera out" className="pointer-events-auto ml-auto rounded border border-line p-1 text-muted hover:text-ink"><Minus className="size-3" /></button>
          <button onClick={() => cam.zoomBy(1.3)} aria-label="Zoom camera in" className="pointer-events-auto rounded border border-line p-1 text-muted hover:text-ink"><Plus className="size-3" /></button>
          <button onClick={cam.reset} className="pointer-events-auto inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"><RotateCcw className="size-3" /> Reset view</button>
        </div>
        <p className="mt-1 text-[11px] font-medium text-ink">{current.title}</p>
        <p className="text-[9px] text-muted">Viewing only — completing a step still requires the authorised COMPLETE control.</p>
      </div>
      {!hands.primary && <NoHand>Rotate your wrist to turn CAM 2, spread both hands to zoom, pinch-drag to pan, and swipe horizontally to browse repair steps.</NoHand>}
    </div>
  )
}

export function CameraMagnifier() {
  const hands = useSignatureHands()
  const cam = useSignatureCamera(4)
  const settings = useConduit((s) => s.settings)
  const [hint, setHint] = useState('')

  useTwoHandTransform((d) => {
    if (Math.abs(d.spread) > (Math.abs(d.x) + Math.abs(d.y)) * 1.15) {
      cam.zoomBy(1 + d.spread * 3)
      setHint(d.spread > 0 ? 'TWO-HAND SPREAD · MAGNIFY' : 'TWO-HAND PINCH · REDUCE')
    } else {
      cam.panBy(d.x, d.y)
      setHint('TWO-HAND TOGETHER · PAN')
    }
  }, hands.ready)

  usePinchDrag((dx, dy) => {
    cam.panBy(dx * 0.9, dy * 0.9)
    setHint('PINCH-DRAG · PAN')
  }, hands.ready && !hands.twoHand)

  const bigBtn = 'pointer-events-auto inline-flex size-12 items-center justify-center rounded-xl border border-line bg-bg/85 text-ink shadow-lg backdrop-blur hover:border-accent/60'
  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        <GestureChip active={hands.twoHand}>two-hand magnify</GestureChip>
        <GestureChip active={hands.primary?.gesture === 'pinch' && !hands.twoHand}>pinch-drag pan</GestureChip>
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
        <span className="rounded bg-bg/70 px-2 py-1 backdrop-blur">{hint || 'Spread both hands to magnify. Large buttons are an alternative to gestures.'}</span>
      </p>
      {!hands.primary && <NoHand>Spread both hands apart to magnify CAM 2, move both hands to pan, or use the large − / + buttons. Magnification is view-only.</NoHand>}
    </div>
  )
}

// ------------------------------------------------------------------ dispatcher
export function SignatureScreen({ modeId }: { modeId: 'hospital' | 'semiconductor' | 'industrial' | 'food_processing' | 'accessibility' }) {
  if (modeId === 'hospital') return <HospitalImaging compact />
  if (modeId === 'semiconductor') {
    return (
      <TwoCameraView title="two-hand zoom">
        <LiveCameraZoom />
      </TwoCameraView>
    )
  }
  if (modeId === 'industrial') {
    return (
      <TwoCameraView title="wrist rotate · two-hand zoom">
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
