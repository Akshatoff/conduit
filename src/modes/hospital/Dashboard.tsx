import { Activity, BellRing, CheckSquare, ClipboardList, Eye, FileText, HeartPulse, ScanLine, Timer } from 'lucide-react'
import { ModePanel, ModeTimer, WorkflowRail, useModeState } from '../../components/mode/DashboardKit'
import { Card, Meter, Pill } from '../../components/ui'
import { cn } from '../../utils/cn'
import { HOSPITAL_MODE } from './config'
import { DEMO_NOTICE, PATIENTS } from './demoData'

function ImagingPlaceholder({ zoom }: { zoom: number }) {
  const scale = [1, 1.6, 2.3][zoom] ?? 1
  return (
    <div className="relative overflow-hidden rounded-lg border border-line/70 bg-black/50">
      <svg viewBox="0 0 320 220" className="h-64 w-full" aria-label="Sample placeholder image — not a diagnostic image">
        <defs>
          <radialGradient id="scanbg" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#16324f" />
            <stop offset="100%" stopColor="#060c16" />
          </radialGradient>
        </defs>
        <rect width="320" height="220" fill="url(#scanbg)" />
        <g transform={`translate(160 110) scale(${scale}) translate(-160 -110)`} opacity="0.9">
          <ellipse cx="160" cy="110" rx="76" ry="62" fill="none" stroke="#4da3ff" strokeOpacity="0.8" strokeWidth="2" />
          <ellipse cx="160" cy="106" rx="38" ry="48" fill="none" stroke="#42d6c5" strokeOpacity="0.55" strokeWidth="1.5" />
          <path d="M160 58v96M124 110h72" stroke="#8796aa" strokeWidth="0.8" strokeDasharray="4 4" />
          <circle cx="146" cy="96" r="9" fill="#16233a" stroke="#42d6c5" strokeOpacity="0.8" />
          <circle cx="174" cy="118" r="11" fill="#16233a" stroke="#42d6c5" strokeOpacity="0.6" />
          <path d="M96 150c22 16 106 16 128 0" fill="none" stroke="#2b4467" strokeWidth="2" />
        </g>
        <g opacity="0.8">
          <path d="M12 12h10M12 12v10M308 12h-10M308 12v10M12 208h10M12 208v-10M308 208h-10M308 208v-10" stroke="#8796aa" strokeWidth="2" />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-[10px]">
        <span className="font-mono text-warn">PLACEHOLDER · NOT DIAGNOSTIC</span>
        <span className="font-mono text-ink/80">zoom {zoom === 0 ? '1×' : `${zoom + 1}×`}</span>
      </div>
    </div>
  )
}

export function HospitalDashboard() {
  const state = useModeState()
  if (!state) return null
  const patient = PATIENTS[state.patientIndex % PATIENTS.length]
  const panel = state.panel
  const done = state.checklistIndex >= HOSPITAL_MODE.checklist.length

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <HeartPulse className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink">{patient.label}</h2>
              <Pill tone="neutral">{patient.id}</Pill>
              <Pill tone="warn">{DEMO_NOTICE}</Pill>
            </div>
            <p className="mt-1 text-xs text-muted">
              {patient.age} · {patient.sex} · {patient.location} · {patient.status}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{patient.summary}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {HOSPITAL_MODE.panels.map((p) => (
              <span
                key={p}
                className={cn(
                  'rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider',
                  panel === p ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-muted',
                )}
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ModePanel
            title="Patient information"
            icon={<FileText className="size-4" />}
            right={<Pill tone="neutral">fictional record</Pill>}
          >
            {panel === 'records' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line/70 text-left text-muted">
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2 pr-3 font-medium">Kind</th>
                      <th className="py-2 font-medium">Demonstration entry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/40">
                    {patient.records.map((r) => (
                      <tr key={`${r.time}-${r.entry}`}>
                        <td className="py-2 pr-3 font-mono text-muted">{r.time}</td>
                        <td className="py-2 pr-3 text-ink">{r.kind}</td>
                        <td className="py-2 text-muted">
                          {r.entry}
                          <span className="ml-2 font-mono text-[10px] text-muted/60">{r.author}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[10px] leading-snug text-muted/80">Every entry above is fictional placeholder text created for the demonstration.</p>
              </div>
            ) : panel === 'imaging' ? (
              <div className="space-y-2">
                <ImagingPlaceholder zoom={state.zoom} />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <ScanLine className="size-3.5 text-accent" />
                  Sample/placeholder image. Select <b className="text-ink">IMAGING</b> again (with a new pinch) to cycle zoom. Nothing is loaded from a medical system.
                </div>
                <Meter label="Sample zoom" value={(state.zoom + 1) / 3} tone="accent" hint={`${state.zoom + 1}×`} />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {patient.vitals.map((v) => (
                    <div key={v.label} className="rounded-lg border border-line/70 bg-bg/40 p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted">{v.label}</p>
                      <p className="mt-0.5 font-mono text-lg text-ink">
                        {v.value} <span className="text-[10px] text-muted">{v.unit}</span>
                      </p>
                      <p className="text-[9px] text-warn/80">{v.note}</p>
                    </div>
                  ))}
                </div>
                <ul className="space-y-1.5">
                  {patient.notes.map((n) => (
                    <li key={n} className="flex gap-2 rounded-lg border border-line/50 bg-bg/30 px-2.5 py-2 text-[11px] leading-snug text-muted">
                      <Activity className="mt-0.5 size-3.5 shrink-0 text-accent/80" />
                      {n}
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted/80">Fictional values for navigation demonstration only — no clinical interpretation is provided.</p>
              </div>
            )}
          </ModePanel>

          <WorkflowRail mode={HOSPITAL_MODE} state={state} />
        </div>

        <div className="space-y-4">
          <ModePanel title="Task checklist" icon={<CheckSquare className="size-4" />} right={<Pill tone={done ? 'teal' : 'neutral'}>{state.checklistIndex}/{HOSPITAL_MODE.checklist.length}</Pill>}>
            <ul className="space-y-1.5">
              {HOSPITAL_MODE.checklist.map((c, i) => (
                <li key={c} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]', i < state.checklistIndex ? 'border-teal/25 bg-teal/5 text-teal' : i === state.checklistIndex ? 'border-accent/40 bg-accent/5 text-ink' : 'border-line/50 bg-bg/30 text-muted')}>
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-current text-[9px]">{i < state.checklistIndex ? '✓' : i + 1}</span>
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-muted/80">Advance with CHECKLIST + pinch. Each step needs its own confirmation.</p>
          </ModePanel>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <ModeTimer state={state} />
            <ModePanel title="Assistance" icon={<BellRing className="size-4" />} right={<Pill tone={state.assistance.requested ? 'warn' : 'neutral'}>{state.assistance.requested ? 'requested' : 'idle'}</Pill>}>
              {state.assistance.requested ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-ink">Simulated request raised</p>
                  <p className="text-[11px] leading-relaxed text-muted">
                    At {new Date(state.assistance.at ?? Date.now()).toLocaleTimeString()}. No message was transmitted; no hospital system or person was contacted.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-muted">Select ASSIST with a valid dwell and pinch to raise a clearly-labelled simulated request.</p>
              )}
            </ModePanel>
          </div>
        </div>
      </div>

      <Card title="Recorded interaction trail" icon={<ClipboardList className="size-4" />}>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-line/60 bg-bg/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">Last authorised action</p>
            <p className="mt-1 text-xs text-ink">{state.last ? state.last.label : '—'}</p>
            <p className="mt-0.5 text-[10px] text-muted">{state.last ? state.last.summary : 'No interaction yet'}</p>
          </div>
          <div className="rounded-lg border border-line/60 bg-bg/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">Checklist</p>
            <p className="mt-1 text-xs text-ink">{state.checklistIndex} of {HOSPITAL_MODE.checklist.length} complete</p>
            <Meter value={state.checklistIndex / HOSPITAL_MODE.checklist.length} tone={done ? 'teal' : 'accent'} />
          </div>
          <div className="rounded-lg border border-line/60 bg-bg/40 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">Procedure</p>
            <p className="mt-1 text-xs text-ink">Step {Math.min(state.stepIndex + 1, HOSPITAL_MODE.workflow.steps.length)} of {HOSPITAL_MODE.workflow.steps.length}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted"><Eye className="size-3" /> {state.history.filter((h) => h.source === 'intent' && h.status === 'confirmed').length} authorised actions this session</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted">
          <span className="flex items-center gap-1"><Timer className="size-3" /> Timer: {state.timer.running ? 'running' : 'paused'}</span>
          <span>· Panel: {panel}</span>
          <span>· Sample image zoom: {state.zoom + 1}×</span>
        </div>
      </Card>
    </div>
  )
}
