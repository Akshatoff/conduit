import { Camera, CameraOff, Hand, Info, MousePointer2, Square } from 'lucide-react'
import { CameraStage } from '../components/CameraStage'
import { EventLog } from '../components/EventLog'
import { IntentPanel } from '../components/IntentPanel'
import { PipelineRibbon } from '../components/PipelineRibbon'
import { Btn, Card, Pill } from '../components/ui'
import { rt } from '../runtime'
import { useConduit, type PointerGesture } from '../store'
import { cn } from '../utils/cn'

const GESTURES: { id: PointerGesture; label: string; hint: string }[] = [
  { id: 'open_palm', label: 'Open palm', hint: 'activate · navigate' },
  { id: 'point', label: 'Point', hint: 'neutral pose' },
  { id: 'fist', label: 'Fist', hint: 'cancel' },
]

function Guide() {
  const steps = [
    ['1', 'Activate', 'Hold a still open palm in the lower area.'],
    ['2', 'Select', 'Move steadily into a control zone and hold still.'],
    ['3', 'Confirm', 'Pinch thumb and index finger to execute.'],
    ['✕', 'Cancel', 'Closed fist cancels at any time.'],
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {steps.map(([n, t, d]) => (
        <div key={t} className="rounded-lg border border-line/70 bg-bg/40 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="grid size-5 place-items-center rounded-full bg-accent/15 text-[10px] text-accent">{n}</span>
            {t}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">{d}</p>
        </div>
      ))}
    </div>
  )
}

export function LivePage() {
  const kind = useConduit((s) => s.runtimeKind)
  const camera = useConduit((s) => s.camera)
  const cameras = useConduit((s) => s.cameras)
  const source = useConduit((s) => s.inputSource)
  const pointer = useConduit((s) => s.pointer)
  const mode = useConduit((s) => s.interactionMode)
  const running = camera.state === 'running' || camera.state === 'starting'
  const settingsIdx = useConduit((s) => s.settings.camera.index)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {/* controls */}
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Btn variant="danger" onClick={() => void rt().stopVision()}>
              <Square className="size-4" /> Stop {source === 'pointer' ? 'simulator' : 'camera'}
            </Btn>
          ) : (
            <Btn variant="primary" onClick={() => void rt().startVision()}>
              {source === 'pointer' ? <MousePointer2 className="size-4" /> : <Camera className="size-4" />} Start {source === 'pointer' ? 'simulator' : 'camera'}
            </Btn>
          )}

          {kind === 'browser' && (
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
              {(['camera', 'pointer'] as const).map((s) => (
                <button key={s} onClick={() => rt().setInputSource(s)} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5', source === s ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink')}>
                  {s === 'camera' ? <Camera className="size-3.5" /> : <MousePointer2 className="size-3.5" />}
                  {s === 'camera' ? 'Webcam' : 'Pointer simulator'}
                </button>
              ))}
            </div>
          )}

          {source === 'camera' && cameras.length > 1 && (
            <select
              aria-label="Select camera"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
              value={kind === 'backend' ? String(settingsIdx) : undefined}
              onChange={(e) => rt().selectCamera(e.target.value)}
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Pill tone={mode === 'conduit' ? 'teal' : 'warn'}>{mode === 'conduit' ? 'Mode B · Conduit intent control' : 'Mode A · Baseline gesture control'}</Pill>
            <Pill tone="neutral" icon={camera.active ? <Camera className="size-3" /> : <CameraOff className="size-3" />}>
              {camera.tracker ?? (camera.state === 'stopped' ? 'stopped' : camera.state)}
            </Pill>
          </div>
        </div>

        <CameraStage />

        {source === 'pointer' && kind === 'browser' && (
          <Card className="border-warn/30" title="Pointer simulator" icon={<MousePointer2 className="size-4" />}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5">
                {GESTURES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => useConduit.setState({ pointer: { ...pointer, gesture: g.id } })}
                    className={cn('rounded-lg border px-3 py-2 text-left text-xs transition-colors', pointer.gesture === g.id ? 'border-accent/60 bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink')}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Hand className="size-3.5" /> {g.label}
                    </span>
                    <span className="text-[10px] text-muted">{g.hint}</span>
                  </button>
                ))}
              </div>
              <p className="min-w-56 flex-1 text-xs leading-relaxed text-muted">
                Move the mouse over the stage to move a <b className="text-ink">synthetic 21-point hand</b>; <b className="text-ink">hold the mouse button to pinch</b>. Landmarks go through the same feature extraction, trajectory analysis and Intent Engine as a real camera.
              </p>
            </div>
          </Card>
        )}

        <PipelineRibbon />
        <Guide />
        {kind === 'browser' && (
          <p className="flex items-start gap-2 rounded-lg border border-line/70 bg-surface/50 px-3 py-2 text-[11px] leading-relaxed text-muted">
            <Info className="mt-px size-3.5 shrink-0 text-accent" />
            Browser runtime: the Python backend was not detected, so tracking, the Intent Engine, device simulation and analytics run locally in this tab. Start the backend (see README) for server-side OpenCV/MediaPipe and ESP32 control.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <IntentPanel />
        <EventLog max="max-h-72" />
      </div>
    </div>
  )
}
