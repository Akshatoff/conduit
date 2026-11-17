import { ChevronLeft, ChevronRight, Clock3, History, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useConduit } from '../../store'
import { cn } from '../../utils/cn'
import { fmtClock, elapsedMs } from '../../modes/state'
import { getMode } from '../../modes/registry'
import { markDemoStep, resetModeDemo } from '../../modes/actions'
import type { ModeControl, ModeDefinition, ModeState } from '../../modes/types'
import { Btn, Card, Pill } from '../ui'

export function useActiveMode(): ModeDefinition | null {
  const active = useConduit((s) => s.activeMode)
  return getMode(active)
}

export function useModeState(): ModeState | null {
  const active = useConduit((s) => s.activeMode)
  return useConduit((s) => (active ? s.modeState[active] : null))
}

export function ModePanel({ title, icon, right, children, className, pad = true }: { title?: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <Card title={title} icon={icon} right={right} className={className} pad={pad}>
      {children}
    </Card>
  )
}

export function ModePill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'teal' | 'warn' | 'danger' }) {
  return <Pill tone={tone}>{children}</Pill>
}

export function SafetyNote({ lines, accent }: { lines: string[]; accent: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-bg/40 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
        <ShieldAlert className="size-3.5" /> Scope & safety
      </p>
      <ul className="space-y-1 text-[11px] leading-relaxed text-muted">
        {lines.map((l) => (
          <li key={l} className="flex gap-1.5">
            <span aria-hidden>·</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function IntentControlTile({ control, value }: { control: ModeControl; value?: string }) {
  const intent = useConduit((s) => s.intent)
  const devices = useConduit((s) => s.devices)
  const hovered = intent.hovered_zone === control.id
  const targeted = intent.target === control.id
  const awaiting = targeted && (intent.state === 'AWAITING_CONFIRMATION' || intent.state === 'CONFIRMING')
  const physical = control.kind === 'physical'
  const twin = physical ? devices[control.device] : undefined

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border p-2.5 transition-colors',
        awaiting ? 'border-warn/60 bg-warn/10' : targeted ? 'border-accent/60 bg-accent/8' : hovered ? 'border-accent/40 bg-bg/60' : 'border-line/70 bg-bg/40',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{control.label}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">{control.hint}</p>
        </div>
        <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide', physical ? 'border-teal/30 bg-teal/10 text-teal' : 'border-accent/30 bg-accent/10 text-accent')}>
          {physical ? 'node' : 'digital'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line/50 pt-1.5 text-[10px] text-muted">
        <span className="truncate font-mono">
          {value ?? (physical ? `${twin?.confirmed_state ?? '—'}${twin?.simulated ? ' · sim' : ''}` : control.action)}
        </span>
        <span className="shrink-0 uppercase tracking-wide">{physical ? 'ack + read-back' : 'gesture only'}</span>
      </div>
    </div>
  )
}

export function ControlTiles({ mode }: { mode: ModeDefinition }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {mode.controls.map((c) => (
        <IntentControlTile key={c.id} control={c} />
      ))}
    </div>
  )
}

export function InteractionHistory({ state, empty = 'No interactions yet in this environment.' }: { state: ModeState; empty?: string }) {
  return (
    <Card title="Interaction history" icon={<History className="size-4" />} right={<Pill tone="neutral">{state.history.length}</Pill>}>
      {state.history.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted">{empty}</p>
      ) : (
        <ol className="max-h-64 space-y-1.5 overflow-auto pr-1">
          {state.history.map((h) => (
            <li key={h.id} className="rounded-lg border border-line/60 bg-bg/40 px-2.5 py-2">
              <div className="flex items-center gap-2 text-[11px]">
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                    h.status === 'confirmed' ? 'bg-teal/15 text-teal' : h.status === 'rejected' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn',
                  )}
                >
                  {h.status === 'not-applicable' ? 'not applicable' : h.status}
                </span>
                <span className="truncate font-medium text-ink">{h.label}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{new Date(h.at).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted">{h.summary}</p>
              <p className="mt-0.5 font-mono text-[9px] text-muted/70">
                {h.source === 'manual' ? 'MANUAL TEST' : h.source === 'intent' ? 'INTENT-AUTHORISED' : 'SYSTEM'} · {h.kind} · {h.device}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

export function DemoGuide({ mode }: { mode: ModeDefinition }) {
  const state = useModeState()
  if (!state) return null
  const total = mode.demo.steps.length
  const done = Math.min(state.demoStep, total)
  const current = mode.demo.steps[Math.min(state.demoStep, total - 1)]
  return (
    <Card
      title="Demonstration script"
      icon={<Sparkles className="size-4" />}
      right={<Pill tone={done >= total ? 'teal' : 'accent'}>{done}/{total}</Pill>}
    >
      <p className="text-[11px] leading-relaxed text-muted">{mode.demo.goal}</p>
      <div className="mt-2.5 flex items-center gap-2">
        <Btn size="sm" variant="ghost" aria-label="Previous demo step" disabled={state.demoStep === 0} onClick={() => markDemoStep(mode.id, state.demoStep - 1)}>
          <ChevronLeft className="size-3.5" />
        </Btn>
        <div className="flex-1">
          <p className="text-xs font-medium leading-snug text-ink">{done >= total ? 'Demonstration complete' : current.instruction}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">{done >= total ? 'Reset the demo to run it again.' : current.expect}</p>
        </div>
        <Btn size="sm" variant="ghost" aria-label="Next demo step" disabled={done >= total} onClick={() => markDemoStep(mode.id, state.demoStep + 1)}>
          <ChevronRight className="size-3.5" />
        </Btn>
        <Btn size="sm" variant="ghost" aria-label="Reset demo" onClick={() => resetModeDemo(mode.id)}>
          <RotateCcw className="size-3.5" />
        </Btn>
      </div>
      <p className="mt-2.5 rounded border border-line/60 bg-bg/30 px-2 py-1.5 text-[10px] leading-snug text-muted">
        Tip: travel up the <b className="text-ink">centre corridor</b> first, then move sideways into a control rail.
      </p>
      <ol className="mt-2.5 space-y-1">
        {mode.demo.steps.map((s, i) => (
          <li key={s.instruction} className={cn('flex gap-2 text-[10px] leading-snug', i < done ? 'text-teal' : i === done ? 'text-ink' : 'text-muted/70')}>
            <span className="font-mono">{i < done ? '✓' : String(i + 1).padStart(2, '0')}</span>
            <span className="truncate">{s.instruction}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function useTicker(active: boolean) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!active) return
    const i = window.setInterval(() => force((n) => n + 1), 500)
    return () => window.clearInterval(i)
  }, [active])
}

export function ModeTimer({ state, label, className }: { state: ModeState; label?: string; className?: string }) {
  useTicker(state.timer.running)
  const ms = elapsedMs(state.timer)
  return (
    <Card title={label ?? state.timer.label} icon={<Clock3 className="size-4" />} className={className} right={<Pill tone={state.timer.running ? 'teal' : 'neutral'}>{state.timer.running ? 'running' : 'paused'}</Pill>}>
      <p className="font-mono text-3xl font-semibold tracking-tight text-ink">{fmtClock(ms)}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        Non-clinical / non-critical timer. Move to the timer control and pinch to toggle — this panel is read-only.
      </p>
    </Card>
  )
}

export function WorkflowRail({ mode, state }: { mode: ModeDefinition; state: ModeState }) {
  const total = mode.workflow.steps.length
  const completed = Math.min(mode.workflow.progress ? mode.workflow.progress(state) : state.stepIndex, total)
  const rate = total ? Math.round((completed / total) * 100) : 0
  return (
    <Card
      title={mode.workflow.title}
      right={
        <Pill tone={rate === 100 ? 'teal' : 'neutral'}>
          {completed}/{total} steps · {rate}% complete
        </Pill>
      }
    >
      <p className="mb-2 text-[11px] leading-relaxed text-muted">{mode.workflow.description}</p>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
        <span className="block h-full rounded-full bg-teal transition-[width] duration-300" style={{ width: `${rate}%` }} />
      </div>
      <ol className="space-y-1.5">
        {mode.workflow.steps.map((s, i) => (
          <li key={s.id} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2', i === completed ? 'border-accent/50 bg-accent/8' : i < completed ? 'border-teal/20 bg-teal/5' : 'border-line/50 bg-bg/30')}>
            <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold', i < completed ? 'bg-teal/20 text-teal' : i === completed ? 'bg-accent/20 text-accent' : 'bg-surface2 text-muted')}>
              {i < completed ? '✓' : i + 1}
            </span>
            <div className="min-w-0">
              <p className={cn('text-[11px] font-medium', i === completed ? 'text-ink' : 'text-muted')}>{s.title}</p>
              {i === completed && <p className="mt-0.5 text-[10px] leading-snug text-muted">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
