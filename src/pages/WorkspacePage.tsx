import {
  ArrowLeftRight,
  BookOpen,
  Camera,
  CameraOff,
  ChevronRight,
  Clock3,
  Hand,
  History as HistoryIcon,
  LayoutDashboard,
  MousePointer2,
  RotateCcw,
  ShieldAlert,
  ScanLine,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CameraStage } from '../components/CameraStage'
import { ControlTiles, DemoGuide, InteractionHistory, SafetyNote, useActiveMode, useModeState } from '../components/mode/DashboardKit'
import { SignatureScreen } from '../components/mode/signature'
import { Btn, Card, Empty, Pill } from '../components/ui'
import { AccessibilityDashboard } from '../modes/accessibility/Dashboard'
import { resetModeDemo } from '../modes/actions'
import { FoodDashboard } from '../modes/food/Dashboard'
import { HospitalDashboard } from '../modes/hospital/Dashboard'
import { IndustrialDashboard } from '../modes/industrial/Dashboard'
import { SemiconductorDashboard } from '../modes/semiconductor/Dashboard'
import { elapsedMs, fmtClock } from '../modes/state'
import type { ModeDefinition, ModeState } from '../modes/types'
import { rt } from '../runtime'
import { resetSignatureView, useConduit } from '../store'
import { cn } from '../utils/cn'

type DetailTab = 'dashboard' | 'controls' | 'history' | 'guide'

const DETAILS: { id: DetailTab; label: string; icon: ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-3.5" /> },
  { id: 'controls', label: 'Controls', icon: <SlidersHorizontal className="size-3.5" /> },
  { id: 'history', label: 'History', icon: <HistoryIcon className="size-3.5" /> },
  { id: 'guide', label: 'Guide', icon: <BookOpen className="size-3.5" /> },
]

function VisionControls() {
  const camera = useConduit((s) => s.camera)
  const kind = useConduit((s) => s.runtimeKind)
  const source = useConduit((s) => s.inputSource)
  const running = camera.state === 'running' || camera.state === 'starting'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {running ? (
        <Btn size="sm" variant="danger" onClick={() => void rt().stopVision()}>
          <Square className="size-3.5" /> Stop {source === 'pointer' ? 'simulator' : 'camera'}
        </Btn>
      ) : (
        <Btn size="sm" variant="primary" onClick={() => void rt().startVision()}>
          {source === 'pointer' ? <MousePointer2 className="size-3.5" /> : <Camera className="size-3.5" />} Start {source === 'pointer' ? 'simulator' : 'camera'}
        </Btn>
      )}
      {kind === 'browser' && (
        <div className="flex rounded-lg border border-line bg-bg/40 p-0.5 text-[11px]">
          {(['camera', 'pointer'] as const).map((s) => (
            <button
              key={s}
              onClick={() => rt().setInputSource(s)}
              className={cn('flex items-center gap-1 rounded-md px-2 py-1', source === s ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink')}
            >
              {s === 'camera' ? <Camera className="size-3" /> : <MousePointer2 className="size-3" />}
              {s === 'camera' ? 'Webcam' : 'Pointer'}
            </button>
          ))}
        </div>
      )}
      <Pill
        tone={camera.active ? 'danger' : 'neutral'}
        icon={camera.active ? <Camera className="size-3" /> : <CameraOff className="size-3" />}
        pulse={camera.active}
        className="hidden sm:inline-flex"
      >
        {camera.active ? 'local' : running ? 'simulator' : camera.state}
      </Pill>
    </div>
  )
}

function CurrentStepCard({ mode, state, onOpen }: { mode: ModeDefinition; state: ModeState; onOpen: (tab: DetailTab) => void }) {
  const total = mode.workflow.steps.length
  const index = Math.min(mode.workflow.progress ? mode.workflow.progress(state) : state.stepIndex, Math.max(0, total - 1))
  const step = mode.workflow.steps[index]
  const progress = total ? Math.round((index / total) * 100) : 0
  const hasTimer = mode.controls.some((c) => c.action === 'TOGGLE_TIMER')
  const [, tick] = useState(0)

  useEffect(() => {
    if (!state.timer.running) return
    const id = window.setInterval(() => tick((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [state.timer.running])

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="p-4" style={{ boxShadow: `inset 0 2px 0 ${mode.accent}` }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Current step</p>
          <button className="flex items-center gap-0.5 text-[10px] font-medium text-accent hover:text-ink" onClick={() => onOpen('dashboard')}>
            Dashboard <ChevronRight className="size-3" />
          </button>
        </div>
        <p className="mt-2 text-sm font-semibold leading-snug text-ink">{step?.title.replace(/^\d+\.\s*/, '') ?? mode.workflow.title}</p>
        {step?.detail && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{step.detail}</p>}
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-full rounded-full" style={{ width: `${progress}%`, background: mode.accent }} />
          </div>
          <span className="font-mono text-[10px] text-muted">{index + 1}/{total}</span>
        </div>
        {hasTimer && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-line/70 bg-bg/40 px-2.5 py-1.5">
            <Clock3 className="size-3.5 text-muted" />
            <span className="font-mono text-sm text-ink">{fmtClock(elapsedMs(state.timer))}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">{state.timer.running ? 'running' : 'paused'}</span>
          </div>
        )}
      </div>

      <div className="border-t border-line/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Recent</p>
          <button className="flex items-center gap-0.5 text-[10px] font-medium text-accent hover:text-ink" onClick={() => onOpen('history')}>
            View all <ChevronRight className="size-3" />
          </button>
        </div>
        {state.history.length === 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">No gestures yet. Activate with an open palm, then hold still over a control.</p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {state.history.slice(0, 2).map((h) => (
              <li key={h.id} className="flex items-start gap-2 text-[11px]">
                <span
                  className={cn(
                    'mt-1 size-1.5 shrink-0 rounded-full',
                    h.status === 'confirmed' ? 'bg-teal' : h.status === 'rejected' ? 'bg-danger' : 'bg-warn',
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-ink/90">{h.label}</span>
                <span className="shrink-0 font-mono text-[9px] text-muted">{new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function ModeDashboard() {
  const mode = useActiveMode()
  if (!mode) return null
  switch (mode.dashboard) {
    case 'hospital':
      return <HospitalDashboard />
    case 'semiconductor':
      return <SemiconductorDashboard />
    case 'industrial':
      return <IndustrialDashboard />
    case 'food_processing':
      return <FoodDashboard />
    case 'accessibility':
      return <AccessibilityDashboard />
  }
}

export function WorkspacePage() {
  const mode = useActiveMode()
  const state = useModeState()
  const [detail, setDetail] = useState<DetailTab | null>(null)
  const [screen, setScreen] = useState(false)
  const detailsRef = useRef<HTMLDivElement>(null)

  // The signature screens transform the live camera itself. Reset when the screen closes or the
  // environment changes so the next mode always starts from the untouched feed.
  useEffect(() => {
    if (!screen) {
      resetSignatureView()
      return
    }
    useConduit.setState((s) => ({ signatureView: { ...s.signatureView, active: true } }))
    return () => resetSignatureView()
  }, [screen, mode?.id])

  const openDetail = (tab: DetailTab) => {
    setDetail(tab)
    window.setTimeout(() => detailsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 0)
  }

  if (!mode || !state) {
    return (
      <Empty icon={<LayoutDashboard className="size-8" />} title="No environment selected">
        <p>Choose an operational environment first. Each environment loads its own controls and workflow while sharing one Intent Engine.</p>
        <Btn className="mt-3" variant="primary" onClick={() => useConduit.setState({ page: 'modes' })}>
          <ArrowLeftRight className="size-4" /> Choose environment
        </Btn>
      </Empty>
    )
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: mode.accent }} aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight text-ink">{mode.name}</h1>
        <p className="hidden min-w-0 truncate text-xs text-muted lg:block">{mode.tagline}</p>
        <div className="ml-auto flex items-center gap-2">
          <Btn size="sm" onClick={() => useConduit.setState({ page: 'modes' })}>
            <ArrowLeftRight className="size-3.5" /> <span className="hidden sm:inline">Change environment</span><span className="sm:hidden">Change</span>
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => resetModeDemo(mode.id)} title="Reset this environment">
            <RotateCcw className="size-3.5" /> <span className="hidden sm:inline">Reset</span>
          </Btn>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <section className="overflow-hidden rounded-xl border border-line bg-surface/90">
            <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-3 py-2">
              <VisionControls />
              <Btn size="sm" variant={screen ? 'primary' : 'default'} onClick={() => setScreen((v) => !v)} aria-pressed={screen}>
                <ScanLine className="size-3.5" /> <span className="hidden sm:inline">Signature screen</span>
              </Btn>
              <span className="ml-auto hidden items-center gap-1.5 text-[10px] text-muted lg:flex">
                <Hand className="size-3.5" /> palm to activate · hold to select · pinch to confirm
              </span>
            </div>
            <div className="relative">
              <CameraStage
                fill
                className="h-[62dvh] min-h-[360px] rounded-none border-0 sm:h-[68dvh] xl:h-[calc(100dvh-13rem)] xl:min-h-[500px]"
              />
              {screen && (
                <div
                  className={cn(
                    'pointer-events-none absolute inset-0 z-20 flex flex-col p-3',
                    mode.id === 'hospital' ? 'bg-bg/95 backdrop-blur-sm' : 'bg-transparent',
                  )}
                  data-signature-live={mode.id === 'hospital' ? undefined : true}
                >
                  <div className="flex items-center gap-2 rounded-md border-b border-line/60 bg-bg/70 px-2 py-1.5 backdrop-blur">
                    <ScanLine className="size-4 text-accent" />
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink">Signature screen</p>
                    <Pill tone="teal">{mode.shortName}</Pill>
                    <span className="hidden text-[10px] text-muted sm:inline">gesture view · camera still tracked underneath</span>
                    <button
                      onClick={() => setScreen(false)}
                      aria-label="Close signature screen"
                      className="pointer-events-auto ml-auto rounded-md border border-line p-1 text-muted hover:text-ink"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className="min-h-0 w-full flex-1 pt-2 [&_button]:pointer-events-auto [&_select]:pointer-events-auto">
                    <SignatureScreen modeId={mode.id} />
                  </div>
                  <p className="w-full rounded border-t border-line/60 bg-bg/70 px-2 py-1 text-[9px] leading-snug text-muted backdrop-blur">
                    View navigation only. Commands still pass through the Intent Engine; this overlay never bypasses confirmation.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-20 xl:self-start">
          <CurrentStepCard mode={mode} state={state} onOpen={openDetail} />
          <p className="flex gap-2 px-1 text-[10px] leading-relaxed text-muted/85">
            <ShieldAlert className="mt-px size-3.5 shrink-0 text-warn/80" />
            <span>{mode.safety[0]}</span>
          </p>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface/60 p-1">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Details</span>
        {DETAILS.map((d) => (
          <button
            key={d.id}
            onClick={() => (detail === d.id ? setDetail(null) : openDetail(d.id))}
            aria-expanded={detail === d.id}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              detail === d.id ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface2/60 hover:text-ink',
            )}
          >
            {d.icon}
            {d.label}
          </button>
        ))}
        <span className="ml-auto hidden pr-2 text-[10px] text-muted/70 md:block">Everything below is optional detail — the camera stays the main workspace.</span>
      </div>

      {detail && (
        <div ref={detailsRef} className="mx-auto max-w-[1400px] scroll-mt-24 pt-1">
          {detail === 'dashboard' && <ModeDashboard />}
          {detail === 'controls' && (
            <Card title="Virtual controls" right={<Pill tone="neutral">{mode.zones.length} camera zones</Pill>}>
              <p className="mb-3 text-[11px] leading-relaxed text-muted">
                The same zones drawn on the camera. Every action requires activation, deliberate approach, dwell, confidence and a separate pinch.
              </p>
              <ControlTiles mode={mode} />
              <div className="mt-3">
                <SafetyNote lines={mode.safety} accent={mode.accent} />
              </div>
            </Card>
          )}
          {detail === 'history' && (
            <InteractionHistory state={state} empty="Perform an authorised action or a rejected movement to populate this history." />
          )}
          {detail === 'guide' && <DemoGuide mode={mode} />}
        </div>
      )}
    </div>
  )
}
