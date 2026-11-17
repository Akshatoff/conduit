import { ArrowLeftRight, Camera, CameraOff, Layers, MousePointer2, RotateCcw, Square, Hand } from 'lucide-react'
import { CameraStage } from '../components/CameraStage'
import { IntentPanel } from '../components/IntentPanel'
import { ControlTiles, DemoGuide, InteractionHistory, SafetyNote, useActiveMode, useModeState } from '../components/mode/DashboardKit'
import { ModeArt } from '../components/mode/ModeArt'
import { Btn, Card, Empty, Pill } from '../components/ui'
import { AccessibilityDashboard } from '../modes/accessibility/Dashboard'
import { resetModeDemo } from '../modes/actions'
import { FoodDashboard } from '../modes/food/Dashboard'
import { HospitalDashboard } from '../modes/hospital/Dashboard'
import { IndustrialDashboard } from '../modes/industrial/Dashboard'
import { SemiconductorDashboard } from '../modes/semiconductor/Dashboard'
import { rt } from '../runtime'
import { useConduit } from '../store'
import { cn } from '../utils/cn'

function QuickVisionBar() {
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
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-[11px]">
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
      <Pill tone={camera.active ? 'danger' : 'neutral'} icon={camera.active ? <Camera className="size-3" /> : <CameraOff className="size-3" />} pulse={camera.active}>
        {camera.active ? 'camera active · local' : camera.state === 'running' ? 'simulator' : camera.state}
      </Pill>
      <span className="ml-auto flex items-center gap-1 text-[10px] text-muted">
        <Hand className="size-3" /> palm activates · hold to select · pinch confirms · fist cancels
      </span>
    </div>
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

  if (!mode || !state) {
    return (
      <Empty icon={<Layers className="size-8" />} title="No environment selected">
        <p>Choose an operational environment first. Each environment loads its own dashboard, controls and workflows while sharing one Intent Engine.</p>
        <Btn className="mt-3" variant="primary" onClick={() => useConduit.setState({ page: 'modes' })}>
          <ArrowLeftRight className="size-4" /> Choose environment
        </Btn>
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <div className="hidden w-44 shrink-0 overflow-hidden rounded-lg border border-line/70 bg-bg/40 sm:block">
            <ModeArt mode={mode.id} className="h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-ink">{mode.name}</h1>
              <Pill tone="accent">active environment</Pill>
              <Pill tone="neutral">{mode.zones.length} controls</Pill>
            </div>
            <p className="mt-1 text-sm text-ink/85">{mode.tagline}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{mode.environment} · {mode.audience}</p>
            <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-muted">{mode.problem}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" onClick={() => useConduit.setState({ page: 'modes' })}>
              <ArrowLeftRight className="size-3.5" /> Change environment
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => resetModeDemo(mode.id)}>
              <RotateCcw className="size-3.5" /> Reset demo
            </Btn>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-4">
          <ModeDashboard />

          <Card title="Virtual controls" icon={<Layers className="size-4" />} right={<Pill tone="neutral">camera zones · {mode.zones.length}</Pill>}>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">
              These are the same zones drawn in the camera view. Every mode action (physical or digital) passes through the Intent Engine: activation, deliberate approach, dwell, confidence, then a separate confirmation gesture. There is no manual shortcut on this surface.
            </p>
            <ControlTiles mode={mode} />
          </Card>

          <Card title="Why this environment" icon={<Layers className="size-4" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">What Conduit changes</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{mode.approach}</p>
                <ul className="mt-2 space-y-1 text-[11px] text-muted">
                  {mode.features.map((f) => (
                    <li key={f} className="flex gap-1.5"><span className="text-teal">·</span>{f}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <SafetyNote lines={mode.safety} accent={mode.accent} />
                <div className="rounded-lg border border-line/70 bg-bg/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Analytics categories</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {mode.analytics.map((a) => (
                      <span key={a} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">{a}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Live interaction" right={<Pill tone="teal">shared engine</Pill>}>
            <div className="space-y-3">
              <QuickVisionBar />
              <CameraStage />
              <p className="text-[10px] leading-relaxed text-muted">
                Approach from the bottom, move up the centre corridor, then sideways into a control. Video is processed locally and never recorded.
              </p>
            </div>
          </Card>
          <IntentPanel />
          <DemoGuide mode={mode} />
          <InteractionHistory state={state} empty="Perform an authorised action or a rejected movement to populate this history." />
          <Card title="Digital twin" right={<Pill tone="warn">simulated vs physical</Pill>}>
            <p className="text-[11px] leading-relaxed text-muted">
              Device and indicator states for this environment are on the Digital Twin page. Physical outputs are only marked confirmed after an acknowledgement and an independent state read-back.
            </p>
            <Btn className="mt-2" size="sm" onClick={() => useConduit.setState({ page: 'twin' })}>
              Open Digital Twin
            </Btn>
          </Card>
        </div>
      </div>
    </div>
  )
}
