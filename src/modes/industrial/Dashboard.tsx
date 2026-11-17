import { Activity, AlertTriangle, BellRing, BookOpen, CheckSquare, Gauge, History, Wrench } from 'lucide-react'
import { InteractionHistory, ModePanel, ModeTimer, WorkflowRail, useModeState } from '../../components/mode/DashboardKit'
import { MachineViewer } from '../../components/mode/signature'
import { Card, Meter, Pill } from '../../components/ui'
import { cn } from '../../utils/cn'
import { INDUSTRIAL_MODE } from './config'
import { EQUIPMENT_UNIT, FIELD_NOTICE, INSPECTION_STEPS, MANUAL_STEPS, READINGS } from './demoData'

export function IndustrialDashboard() {
  const state = useModeState()
  if (!state) return null
  const step = MANUAL_STEPS[state.stepIndex]
  const checklistDone = state.checklistIndex >= INSPECTION_STEPS.length

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg border border-warn/30 bg-warn/10 text-warn">
            <Wrench className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink">{EQUIPMENT_UNIT.name}</h2>
              <Pill tone="neutral">{EQUIPMENT_UNIT.id}</Pill>
              <Pill tone="warn">{FIELD_NOTICE}</Pill>
            </div>
            <p className="mt-1 text-xs text-muted">{EQUIPMENT_UNIT.location} · asset {EQUIPMENT_UNIT.assetTag}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone={state.fault.reported ? 'danger' : 'neutral'}>{state.fault.reported ? 'fault reported (simulated)' : 'no fault'}</Pill>
            <Pill tone={state.assistance.requested ? 'warn' : 'neutral'}>{state.assistance.requested ? 'assistance requested' : 'assistance idle'}</Pill>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ModePanel title="Equipment monitoring" icon={<Gauge className="size-4" />} right={<Pill tone="warn">simulated readings</Pill>}>
            <div className="grid gap-2 sm:grid-cols-2">
              {READINGS.map((r) => (
                <div key={r.label} className="rounded-lg border border-line/70 bg-bg/40 p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted">{r.label}</p>
                  <p className="mt-0.5 font-mono text-lg text-ink">
                    {r.value} <span className="text-[10px] text-muted">{r.unit}</span>
                  </p>
                  <p className="text-[9px] text-muted/80">{r.state}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-warn/80"><Activity className="size-3" /> Fictional values held in the UI only — not read from any machine or sensor.</p>
          </ModePanel>

          <ModePanel title="Maintenance manual" icon={<BookOpen className="size-4" />} right={<Pill tone="neutral">{state.stepIndex + 1}/{MANUAL_STEPS.length}</Pill>}>
            <div className="mb-3">
              <MachineViewer compact />
            </div>
            <ol className="space-y-1.5">
              {MANUAL_STEPS.map((s, i) => (
                <li key={s.id} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2', i === state.stepIndex ? 'border-warn/50 bg-warn/8' : i < state.stepIndex ? 'border-teal/20 bg-teal/5' : 'border-line/50 bg-bg/30')}>
                  <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold', i < state.stepIndex ? 'bg-teal/20 text-teal' : i === state.stepIndex ? 'bg-warn/20 text-warn' : 'bg-surface2 text-muted')}>
                    {i < state.stepIndex ? '✓' : i + 1}
                  </span>
                  <div>
                    <p className={cn('text-[11px] font-medium', i === state.stepIndex ? 'text-ink' : 'text-muted')}>{s.title}</p>
                    {i === state.stepIndex && <p className="mt-0.5 text-[10px] leading-snug text-muted">{s.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[10px] leading-snug text-muted/80">Current manual step: <span className="text-ink">{step.title}</span>. Isolation text is a placeholder, not an instruction.</p>
          </ModePanel>
        </div>

        <div className="space-y-4">
          <ModePanel title="Inspection checklist" icon={<CheckSquare className="size-4" />} right={<Pill tone={checklistDone ? 'teal' : 'neutral'}>{state.checklistIndex}/{INSPECTION_STEPS.length}</Pill>}>
            <ul className="space-y-1.5">
              {INSPECTION_STEPS.map((c, i) => (
                <li key={c} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]', i < state.checklistIndex ? 'border-teal/25 bg-teal/5 text-teal' : i === state.checklistIndex ? 'border-accent/40 bg-accent/5 text-ink' : 'border-line/50 bg-bg/30 text-muted')}>
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-current text-[9px]">{i < state.checklistIndex ? '✓' : i + 1}</span>
                  {c}
                </li>
              ))}
            </ul>
            <Meter value={state.checklistIndex / INSPECTION_STEPS.length} tone={checklistDone ? 'teal' : 'warn'} label="Inspection progress" />
          </ModePanel>

          <ModeTimer state={state} />

          <ModePanel title="Fault reporting" icon={<AlertTriangle className="size-4" />} right={<Pill tone={state.fault.reported ? 'danger' : 'neutral'}>{state.fault.reported ? 'open' : 'idle'}</Pill>}>
            {state.fault.reported ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-ink">Simulated fault report open</p>
                <p className="text-[11px] leading-relaxed text-muted">Raised at {new Date(state.fault.at ?? Date.now()).toLocaleTimeString()}. No maintenance system, email or operator was contacted. Reset the demo to clear it.</p>
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-muted">Select <b className="text-ink">FAULT</b> with dwell + pinch to raise a clearly-labelled simulated report.</p>
            )}
          </ModePanel>

          <ModePanel title="Assistance" icon={<BellRing className="size-4" />} right={<Pill tone={state.assistance.requested ? 'warn' : 'neutral'}>{state.assistance.requested ? 'requested' : 'idle'}</Pill>}>
            <p className="text-[11px] leading-relaxed text-muted">
              {state.assistance.requested ? 'A simulated assistance request is open. Nobody was contacted.' : 'A gesture-authorised ASSIST selection raises a simulated request for demonstration.'}
            </p>
          </ModePanel>
        </div>
      </div>

      <WorkflowRail mode={INDUSTRIAL_MODE} state={state} />

      <div className="grid gap-4 lg:grid-cols-2">
        <InteractionHistory state={state} />
        <Card title="Maintenance history" icon={<History className="size-4" />}>
          {state.history.filter((h) => h.status === 'confirmed').length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted">No confirmed maintenance actions yet. Only intent-authorised (or clearly labelled manual) entries appear here.</p>
          ) : (
            <ul className="space-y-1.5">
              {state.history.filter((h) => h.status === 'confirmed').slice(0, 8).map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-[10px] text-muted">{new Date(h.at).toLocaleTimeString()}</span>
                  <span className="text-ink">{h.label}</span>
                  <span className="ml-auto text-[9px] uppercase text-muted">{h.source}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
