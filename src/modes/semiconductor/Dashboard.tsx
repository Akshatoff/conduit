import { CheckSquare, ClipboardCheck, Factory, Fan, Layers, ScanSearch, ServerCog, ShieldCheck } from 'lucide-react'
import { ModePanel, WorkflowRail, useModeState } from '../../components/mode/DashboardKit'
import { Card, Meter, Pill } from '../../components/ui'
import { useConduit } from '../../store'
import { cn } from '../../utils/cn'
import { SEMICONDUCTOR_MODE } from './config'
import { CHECKLIST, DEFECT_CATEGORIES, EQUIPMENT, FAB_NOTICE, PROCESS_STAGES, WAFER_DIES } from './demoData'

function WaferMap({ zoom }: { zoom: number }) {
  const scale = [1, 1.45, 1.95][zoom] ?? 1
  const cols = 7
  return (
    <div className="relative overflow-hidden rounded-lg border border-line/70 bg-[#061214]">
      <svg viewBox="0 0 340 250" className="h-72 w-full" role="img" aria-label="Fictional wafer map — simulated data">
        <defs>
          <clipPath id="wafer"><circle cx="170" cy="125" r="104" /></clipPath>
        </defs>
        <g transform={`translate(170 125) scale(${scale}) translate(-170 -125)`}>
          <circle cx="170" cy="125" r="108" fill="none" stroke="#42d6c5" strokeWidth="2" opacity="0.7" />
          <circle cx="170" cy="125" r="104" fill="#0a1e20" />
          <g clipPath="url(#wafer)">
            {WAFER_DIES.map((d, i) => {
              const col = i % cols
              const row = Math.floor(i / cols)
              const x = 84 + col * 25
              const y = 47 + row * 26
              const fill = d.state === 'flagged' ? '#f5b942' : d.state === 'review' ? '#4da3ff' : '#1b4b4a'
              return <rect key={d.id} x={x} y={y} width="21" height="21" rx="2" fill={fill} opacity={d.state === 'ok' ? 0.75 : 0.95} stroke="#0a1e20" strokeWidth="1.5" />
            })}
          </g>
          <path d="M170 21v-9" stroke="#42d6c5" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g fontSize="9" fill="#7f9a9a" fontFamily="ui-monospace,monospace">
          <text x="12" y="238">SIMULATED WAFER · fictional die map · zoom {zoom + 1}×</text>
          <text x="248" y="238">LOT DEMO-0042</text>
        </g>
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 flex gap-1.5">
        <Pill tone="warn">SIMULATED</Pill>
        <Pill tone="neutral">not metrology</Pill>
      </div>
    </div>
  )
}

function EquipmentCard({ equipment }: { equipment: (typeof EQUIPMENT)[number] }) {
  const devices = useConduit((s) => s.devices)
  const device = equipment.indicator.startsWith('LED') ? devices.lighting : equipment.indicator.startsWith('Fan') ? devices.ventilation : devices.access
  const Icon = equipment.indicator.startsWith('LED') ? Factory : equipment.indicator.startsWith('Fan') ? Fan : ServerCog
  return (
    <div className="rounded-lg border border-line/70 bg-bg/40 p-2.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-teal" />
        <p className="text-xs font-semibold text-ink">{equipment.name}</p>
        <Pill tone={device?.simulated ? 'warn' : 'teal'} className="ml-auto">{device?.simulated ? 'SIM' : device?.connection === 'connected' ? 'NODE' : 'OFFLINE'}</Pill>
      </div>
      <p className="mt-1 text-[10px] text-muted">{equipment.indicator}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <p className="text-muted">Confirmed state</p>
          <p className="font-mono text-sm text-ink">{device?.confirmed_state ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted">Simulated reading</p>
          <p className="font-mono text-sm text-ink">{equipment.reading}</p>
        </div>
      </div>
      <p className="mt-1 text-[9px] leading-snug text-muted/80">{equipment.state}</p>
      <p className="mt-1 font-mono text-[9px] text-muted/60">
        {device?.last_ack ? `ACK ${device.last_ack.status} → ${device.last_ack.actual_state ?? '?'}` : 'no ACK yet'} · source {device?.state_source ?? '—'}
      </p>
    </div>
  )
}

export function SemiconductorDashboard() {
  const state = useModeState()
  if (!state) return null
  const stage = PROCESS_STAGES[state.stageIndex]
  const defect = DEFECT_CATEGORIES[state.defect]
  const checklistDone = state.checklistIndex >= CHECKLIST.length

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg border border-teal/30 bg-teal/10 text-teal">
            <Factory className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink">Simulated cleanroom workstation</h2>
              <Pill tone="warn">{FAB_NOTICE}</Pill>
            </div>
            <p className="mt-1 text-xs text-muted">
              Lot DEMO-0042 · stage {state.stageIndex + 1}/{PROCESS_STAGES.length} · <span className="text-ink">{stage.name}</span> · {stage.code}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="teal">Digital layer</Pill>
            <Pill tone="warn">Physical indicators</Pill>
          </div>
        </div>
      </Card>

      <ModePanel title="Process stages" icon={<Layers className="size-4" />} right={<Pill tone="neutral">{state.stageIndex + 1}/{PROCESS_STAGES.length}</Pill>}>
        <ol className="grid gap-2 sm:grid-cols-5">
          {PROCESS_STAGES.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                'rounded-lg border p-2.5',
                i === state.stageIndex ? 'border-teal/60 bg-teal/10' : i < state.stageIndex ? 'border-teal/20 bg-teal/5' : 'border-line/60 bg-bg/30',
              )}
            >
              <p className="flex items-center justify-between text-[10px] text-muted">
                <span className="font-mono">{s.code}</span>
                {i < state.stageIndex ? <span className="text-teal">✓</span> : i === state.stageIndex ? <span className="text-teal">●</span> : null}
              </p>
              <p className={cn('mt-1 text-xs font-medium', i === state.stageIndex ? 'text-ink' : 'text-muted')}>{s.name}</p>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{stage.detail} Select <b className="text-ink">NEXT STAGE</b> and pinch to advance one step at a time.</p>
      </ModePanel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ModePanel
            title="Wafer inspection viewer"
            icon={<ScanSearch className="size-4" />}
            right={<Pill tone={state.panel === 'inspection' ? 'teal' : 'neutral'}>{state.panel === 'inspection' ? 'open' : 'closed'}</Pill>}
          >
            {state.panel === 'inspection' ? (
              <>
                <WaferMap zoom={state.zoom} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {DEFECT_CATEGORIES.map((d, i) => (
                    <span
                      key={d.id}
                      className={cn(
                        'rounded-md border px-2 py-1 text-[10px]',
                        i === state.defect ? 'border-warn/60 bg-warn/15 text-warn' : 'border-line text-muted',
                      )}
                    >
                      {d.label}
                    </span>
                  ))}
                  <span className="ml-auto font-mono text-[10px] text-muted">selected: {defect.label}</span>
                </div>
                <p className="mt-2 text-[10px] leading-snug text-muted/80">Fictional categories and a deterministic placeholder die map. No inspection measurement is performed.</p>
              </>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center">
                <ScanSearch className="size-8 text-muted" />
                <p className="text-sm font-medium text-ink">Inspection image not open</p>
                <p className="max-w-md text-[11px] leading-relaxed text-muted">Select <b className="text-ink">INSPECT</b> with a deliberate approach and pinch. The image and all defect data are fictional.</p>
              </div>
            )}
          </ModePanel>

          <ModePanel title="Inspection records" icon={<ClipboardCheck className="size-4" />} right={<Pill tone="neutral">{state.inspections.length}</Pill>}>
            {state.inspections.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted">
                No simulated records yet. Open the inspection view, choose a defect category, then select <b className="text-ink">CONFIRM</b> and pinch. Records are appended only after the intent pipeline authorises the action.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {state.inspections.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line/60 bg-bg/40 px-2.5 py-2 text-[11px]">
                    <span className="font-mono text-teal">{r.id}</span>
                    <span className="text-ink">{r.stage}</span>
                    <span className="text-muted">· {r.defect}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted">{new Date(r.at).toLocaleTimeString()}</span>
                    <p className="w-full text-[10px] text-warn/80">{r.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </ModePanel>
        </div>

        <div className="space-y-4">
          <ModePanel title="Equipment status" icon={<ServerCog className="size-4" />} right={<Pill tone="warn">simulated readings</Pill>}>
            <div className="space-y-2">
              {EQUIPMENT.map((e) => (
                <EquipmentCard key={e.id} equipment={e} />
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-muted">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-teal" />
              Indicator states are confirmed only after the node acknowledges and state is read back. A fan is not a ventilation system and a servo is not a door interlock.
            </p>
          </ModePanel>

          <ModePanel title="Manufacturing checklist" icon={<CheckSquare className="size-4" />} right={<Pill tone={checklistDone ? 'teal' : 'neutral'}>{state.checklistIndex}/{CHECKLIST.length}</Pill>}>
            <ul className="space-y-1.5">
              {CHECKLIST.map((c, i) => (
                <li key={c} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]', i < state.checklistIndex ? 'border-teal/25 bg-teal/5 text-teal' : i === state.checklistIndex ? 'border-accent/40 bg-accent/5 text-ink' : 'border-line/50 bg-bg/30 text-muted')}>
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-current text-[9px]">{i < state.checklistIndex ? '✓' : i + 1}</span>
                  {c}
                </li>
              ))}
            </ul>
            <Meter value={state.checklistIndex / CHECKLIST.length} tone={checklistDone ? 'teal' : 'accent'} label="Checklist progress" />
          </ModePanel>
        </div>
      </div>

      <WorkflowRail mode={SEMICONDUCTOR_MODE} state={state} />
    </div>
  )
}
