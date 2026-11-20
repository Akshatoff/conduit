import { MonitorSmartphone, Radar } from 'lucide-react'
import { fmtClock, elapsedMs } from '../../modes/state'
import { CONTENT_ITEMS } from '../../modes/accessibility/demoData'
import { ORDERS, ORDER_STATES, RECIPES } from '../../modes/food/demoData'
import { MANUAL_STEPS } from '../../modes/industrial/demoData'
import { PATIENTS } from '../../modes/hospital/demoData'
import { DEFECT_CATEGORIES, PROCESS_STAGES } from '../../modes/semiconductor/demoData'
import { getMode } from '../../modes/registry'
import type { ModeState } from '../../modes/types'
import { useConduit } from '../../store'
import { cn } from '../../utils/cn'
import { Btn, Card, Pill } from '../ui'

function digitalValue(id: string, mode: string, st: ModeState | null): string {
  if (!st) return '—'
  if (mode === 'hospital') {
    if (id === 'hospital.display') return `${st.panel.toUpperCase()} · ${PATIENTS[st.patientIndex].id}`
    if (id === 'hospital.timer') return `${fmtClock(elapsedMs(st.timer))} · ${st.timer.running ? 'running' : 'paused'}`
    if (id === 'hospital.assist') return st.assistance.requested ? 'requested (simulated)' : 'idle'
  }
  if (mode === 'semiconductor') {
    if (id === 'semi.stage') return PROCESS_STAGES[st.stageIndex].name
    if (id === 'semi.inspection') return st.inspections.length ? `${st.inspections.length} record(s) · ${DEFECT_CATEGORIES[st.defect].label}` : 'no records yet'
  }
  if (mode === 'industrial') {
    if (id === 'industrial.unit') return 'PUMP-DEMO-07 · nominal (simulated)'
    if (id === 'industrial.step') return `step ${st.stepIndex + 1}/${MANUAL_STEPS.length}`
    if (id === 'industrial.fault') return st.fault.reported ? 'report open (simulated)' : 'idle'
  }
  if (mode === 'food_processing') {
    if (id === 'food.recipe') return `${RECIPES[st.recipeIndex].name} · step ${st.stepIndex + 1}`
    if (id === 'food.timer') return `${fmtClock(elapsedMs(st.timer))} · ${st.timer.running ? 'running' : 'paused'}`
    if (id === 'food.order') return `${ORDERS[0].id} · ${ORDER_STATES[st.orderStatus]}`
  }
  if (mode === 'accessibility') {
    if (id === 'access.focus') return CONTENT_ITEMS[st.focusIndex].title
    if (id === 'access.selection') return `${st.selections} deliberate selection(s)`
  }
  return st.last?.label ?? '—'
}

export function ModeTwinPanel() {
  const active = useConduit((s) => s.activeMode)
  const devices = useConduit((s) => s.devices)
  const state = useConduit((s) => (s.activeMode ? s.modeState[s.activeMode] ?? null : null))
  const mode = getMode(active)
  if (!mode) {
    return (
      <Card title="Mode indicators" icon={<Radar className="size-4" />}>
        <p className="text-xs leading-relaxed text-muted">No operational environment is active. Choose one under Environments to load its device and indicator mapping.</p>
        <Btn className="mt-2" size="sm" onClick={() => useConduit.setState({ page: 'modes' })}>Choose environment</Btn>
      </Card>
    )
  }
  return (
    <Card
      title={`${mode.shortName} · indicators`}
      icon={<Radar className="size-4" />}
      right={<Pill tone="warn">digital vs physical</Pill>}
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {mode.twin.map((t) => {
          const device = t.source === 'physical' && t.device ? devices[t.device] : undefined
          const value = device ? `${device.confirmed_state}${device.simulated ? ' · simulated' : device.verified ? ' · read back' : ' · ack only'}` : digitalValue(t.id, mode.id, state)
          return (
            <div key={t.id} className={cn('rounded-lg border p-2.5', t.source === 'physical' ? 'border-teal/25 bg-teal/5' : 'border-line/70 bg-bg/40')}>
              <div className="flex items-center gap-2">
                <MonitorSmartphone className={cn('size-3.5', t.source === 'physical' ? 'text-teal' : 'text-accent')} />
                <p className="truncate text-[11px] font-semibold text-ink">{t.name}</p>
                <span className={cn('ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase', t.source === 'physical' ? 'border-teal/30 text-teal' : 'border-accent/30 text-accent')}>
                  {t.source === 'physical' ? 'node' : 'ui'}
                </span>
              </div>
              <p className="mt-1.5 font-mono text-xs text-ink">{value}</p>
              <p className="mt-1 text-[10px] leading-snug text-muted">{t.description}</p>
              {device && (
                <p className="mt-1 font-mono text-[9px] text-muted/70">
                  {device.last_ack ? `ACK ${device.last_ack.status} → ${device.last_ack.actual_state ?? '?'}` : 'no ACK'} · {device.state_source}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-3 border-t border-line/60 pt-2 text-[10px] leading-relaxed text-muted">
        Entries marked <b className="text-accent">UI</b> are digital mode-layer state and are never reported as physical execution. Entries marked <b className="text-teal">node</b> come from the phone controller: they change only after a real acknowledgement, and are only labelled read-back when an independent read-back agrees (the screen backlight).
      </p>
    </Card>
  )
}
