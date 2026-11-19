import { BarChart3, ClipboardList, Download, FlaskConical, Play, Square, Timer, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Btn, Card, Empty, Field, Pill, inputCls } from '../components/ui'
import { DEVICE_SPECS } from '../core/config'
import { getMode } from '../modes/registry'
import type { Metrics } from '../core/types'
import { rt } from '../runtime'
import { useConduit } from '../store'
import { cn } from '../utils/cn'
import { download, ms, pct } from '../utils/format'

const C_BASE = '#f5b942'
const C_COND = '#42d6c5'
const tooltipStyle = { background: '#111c2e', border: '1px solid #233450', borderRadius: 8, fontSize: 12, color: '#eaf1fa' }

const SCENARIOS = {
  intended: ['Select lighting + pinch confirm', 'Select access + pinch confirm', 'Dwell, then cancel with a fist'],
  unintended: ['Wave across the frame', 'Quick swipe through zones', 'Reach for an object past the controls', 'Scratch face / hand adjust', 'Hand rests in zone, no intent', 'Accidental pinch / fist'],
}

function SessionControl() {
  const a = useConduit((s) => s.analytics)
  const mode = useConduit((s) => s.interactionMode)
  const camera = useConduit((s) => s.camera)
  const st = a?.status
  const [newMode, setNewMode] = useState<'baseline' | 'conduit'>(mode)
  const [note, setNote] = useState('')
  const [label, setLabel] = useState<'intended' | 'unintended'>('intended')
  const active = useConduit((s) => s.activeMode)
  const activeMode = getMode(active)
  const targetOptions = [
    ...Object.values(DEVICE_SPECS).map((d) => ({ id: d.id, label: `${d.name} · shared node` })),
    ...(activeMode?.controls.filter((c) => c.kind === 'digital').map((c) => ({ id: c.device, label: `${c.label} · digital (${activeMode.shortName})` })) ?? []),
  ]
  const [target, setTarget] = useState(targetOptions[0]?.id ?? 'lighting')
  const [scenario, setScenario] = useState('')

  useEffect(() => {
    setScenario(SCENARIOS[label][0])
  }, [label])
  useEffect(() => {
    if (!targetOptions.some((o) => o.id === target)) setTarget(targetOptions[activeMode ? Object.values(DEVICE_SPECS).length : 0]?.id ?? 'lighting')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  if (!st?.session_active) {
    return (
      <Card
        title="Start a test session"
        icon={<FlaskConical className="size-4" />}
        right={<Pill tone="accent">{activeMode ? activeMode.shortName : 'no environment'}</Pill>}
      >
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          The active environment is recorded with every session and trial. Results are never pre-filled — run the same scenarios in each environment you want to compare.
        </p>
        <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <Field label="Interaction mode under test">
            <select className={inputCls} value={newMode} onChange={(e) => setNewMode(e.target.value as 'baseline' | 'conduit')}>
              <option value="baseline">Mode A · Conventional gesture control</option>
              <option value="conduit">Mode B · Conduit intent control</option>
            </select>
          </Field>
          <Field label="Session note (optional)">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. operator, lighting conditions, camera position" />
          </Field>
          <Btn variant="primary" onClick={() => void rt().startSession(newMode, note)}>
            <Play className="size-4" /> Start session
          </Btn>
        </div>
        {!camera.active && camera.state !== 'running' && <p className="mt-3 text-xs text-warn">The camera/simulator is not running — start it on the Live Interaction screen before running trials.</p>}
      </Card>
    )
  }
  const tr = st.trial
  return (
    <Card
      title={`Session #${st.session_id} · ${st.mode === 'conduit' ? 'Conduit intent control' : 'Baseline gesture control'} · ${getMode(st.workspace)?.shortName ?? st.workspace ?? activeMode?.shortName ?? 'environment'}`}
      icon={<FlaskConical className="size-4" />}
      right={
        <Btn size="sm" variant="danger" onClick={() => void rt().stopSession()}>
          <Square className="size-3.5" /> Stop session
        </Btn>
      }
    >
      {!tr ? (
        <div className="grid gap-3 md:grid-cols-[200px_200px_1fr_auto] md:items-end">
          <Field label="Ground-truth label">
            <select className={inputCls} value={label} onChange={(e) => setLabel(e.target.value as 'intended' | 'unintended')}>
              <option value="intended">Intended (deliberate)</option>
              <option value="unintended">Unintended (accidental)</option>
            </select>
          </Field>
          <Field label="Intended target">
            <select className={inputCls} value={target} disabled={label === 'unintended'} onChange={(e) => setTarget(e.target.value)}>
              {targetOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Scenario">
            <input className={inputCls} list="scenarios" value={scenario} onChange={(e) => setScenario(e.target.value)} />
            <datalist id="scenarios">
              {SCENARIOS[label].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Btn variant="teal" onClick={() => void rt().startTrial(label, label === 'intended' ? target : null, scenario)}>
            <Play className="size-4" /> Start trial
          </Btn>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-60 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <span className="size-2 animate-soft-pulse rounded-full bg-danger" />
              Trial running · <span className={tr.label === 'intended' ? 'text-teal' : 'text-warn'}>{tr.label}</span>
              {tr.target ? ` → ${DEVICE_SPECS[tr.target]?.name ?? activeMode?.controls.find((c) => c.device === tr.target)?.label ?? tr.target}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted">
              Now perform: <b className="text-ink">{tr.scenario || '—'}</b>. Press “End trial” when finished.
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <Pill tone={tr.executed ? 'danger' : 'neutral'}>command executed: {tr.executed ? 'yes' : 'no'}</Pill>
            <Pill tone="neutral">rejections: {tr.rejections}</Pill>
            <Pill tone="neutral">confirm request: {tr.confirmation_requested ? 'yes' : 'no'}</Pill>
          </div>
          <Btn variant="primary" onClick={() => void rt().endTrial()}>
            <Square className="size-4" /> End trial
          </Btn>
        </div>
      )}
    </Card>
  )
}

type Row = { metric: string; baseline: number | null; conduit: number | null }

function compare(b: Metrics, c: Metrics): { rates: Row[]; counts: Row[] } {
  const p = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 10)
  return {
    rates: [
      { metric: 'False activation', baseline: p(b.false_activation_rate), conduit: p(c.false_activation_rate) },
      { metric: 'Accidental rejection', baseline: p(b.accidental_rejection_rate), conduit: p(c.accidental_rejection_rate) },
      { metric: 'Deliberate success', baseline: p(b.deliberate_success_rate), conduit: p(c.deliberate_success_rate) },
      { metric: 'Device ack rate', baseline: p(b.device_ack_rate), conduit: p(c.device_ack_rate) },
      { metric: 'Confirmation requests', baseline: p(b.confirmation_request_rate), conduit: p(c.confirmation_request_rate) },
      { metric: 'Confirmation success', baseline: p(b.confirmation_success_rate), conduit: p(c.confirmation_success_rate) },
    ],
    counts: [
      { metric: 'Attempts', baseline: b.attempts, conduit: c.attempts },
      { metric: 'Accepted', baseline: b.accepted, conduit: c.accepted },
      { metric: 'Rejected', baseline: b.rejected, conduit: c.rejected },
      { metric: 'False activations', baseline: b.false_activations, conduit: c.false_activations },
      { metric: 'Successful deliberate', baseline: b.successful_deliberate, conduit: c.successful_deliberate },
    ],
  }
}

function ChartCard({ title, data, unit, domain }: { title: string; data: Row[]; unit?: string; domain?: [number, number] }) {
  return (
    <Card title={title}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#233450" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="metric" tick={{ fill: '#8796aa', fontSize: 10 }} interval={0} tickLine={false} axisLine={{ stroke: '#233450' }} />
            <YAxis tick={{ fill: '#8796aa', fontSize: 11 }} tickLine={false} axisLine={false} domain={domain} allowDecimals={false} unit={unit} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(77,163,255,0.06)' }} formatter={(v) => (v == null ? 'no data' : `${v}${unit ?? ''}`)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="baseline" name="Baseline (Mode A)" fill={C_BASE} radius={[4, 4, 0, 0]} />
            <Bar dataKey="conduit" name="Conduit (Mode B)" fill={C_COND} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export function AnalyticsPage() {
  const a = useConduit((s) => s.analytics)
  const kind = useConduit((s) => s.runtimeKind)
  useEffect(() => {
    void rt().refreshAnalytics()
  }, [])
  const data = useMemo(() => (a ? compare(a.by_mode.baseline, a.by_mode.conduit) : null), [a])

  const exportCsv = async () => download('conduit_trials.csv', await rt().exportCsv())

  return (
    <div className="space-y-4">
      <SessionControl />

      {!a?.has_data || !data ? (
        <Empty icon={<BarChart3 className="size-8" />} title="No test results yet">
          Results appear here only after you run trials. Start a session in <b>Mode A (baseline)</b> and again in <b>Mode B (Conduit)</b>, label each attempt as intended or accidental, and perform the scenario. Nothing on this page is pre-filled, estimated or simulated.
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral">{a.total_trials} trial(s) recorded</Pill>
            {(a.by_mode.baseline.attempts < 20 || a.by_mode.conduit.attempts < 20) && <Pill tone="warn">Small sample — indicative only, not statistically significant</Pill>}
            <div className="ml-auto flex gap-2">
              {kind === 'browser' && (
                <Btn size="sm" variant="ghost" onClick={() => window.confirm('Delete all locally stored trials and sessions?') && rt().clearLocalAnalytics?.()}>
                  <Trash2 className="size-3.5" /> Clear local data
                </Btn>
              )}
              <Btn size="sm" variant="primary" onClick={() => void exportCsv()}>
                <Download className="size-3.5" /> Export CSV
              </Btn>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Rates · Baseline vs Conduit (%)" data={data.rates} unit="%" domain={[0, 100]} />
            <ChartCard title="Interaction counts" data={data.counts} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card title="Latency" icon={<Timer className="size-4" />}>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {(['baseline', 'conduit'] as const).map((m) => (
                  <div key={m} className="rounded-lg border border-line/70 bg-bg/40 p-3">
                    <p className={cn('mb-2 font-semibold', m === 'conduit' ? 'text-teal' : 'text-warn')}>{m === 'conduit' ? 'Conduit (B)' : 'Baseline (A)'}</p>
                    <p className="text-muted">Intent processing / frame</p>
                    <p className="mb-2 font-mono text-base text-ink">{ms(a.by_mode[m].avg_intent_latency_ms)}</p>
                    <p className="text-muted">End-to-end command</p>
                    <p className="mb-2 font-mono text-base text-ink">{ms(a.by_mode[m].avg_e2e_latency_ms)}</p>
                    <p className="text-muted">Operator task duration</p>
                    <p className="font-mono text-base text-ink">{a.by_mode[m].avg_task_duration_s == null ? '—' : `${a.by_mode[m].avg_task_duration_s!.toFixed(1)} s`}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">End-to-end = intent validated → device state CONFIRMED (includes acknowledgement and read-back). It excludes the deliberate dwell and pinch time the user spends confirming, which is the safety cost Conduit adds on purpose.</p>
            </Card>

            <Card title="Comparison table" pad={false}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line/70 text-left text-muted">
                    <th className="px-4 py-2 font-medium">Metric</th>
                    <th className="px-2 py-2 font-medium text-warn">Baseline</th>
                    <th className="px-2 py-2 font-medium text-teal">Conduit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {(
                    [
                      ['Attempts', (m: Metrics) => String(m.attempts)],
                      ['Intended / unintended', (m: Metrics) => `${m.intended_trials} / ${m.unintended_trials}`],
                      ['Accepted / rejected', (m: Metrics) => `${m.accepted} / ${m.rejected}`],
                      ['Successful deliberate', (m: Metrics) => `${m.successful_deliberate} (${pct(m.deliberate_success_rate)})`],
                      ['False activations', (m: Metrics) => `${m.false_activations} (${pct(m.false_activation_rate)})`],
                      ['Accidental rejected', (m: Metrics) => `${m.accidental_rejected} (${pct(m.accidental_rejection_rate)})`],
                      ['Device ack rate', (m: Metrics) => pct(m.device_ack_rate)],
                      ['Confirmation requests', (m: Metrics) => `${m.confirmation_requests} (${pct(m.confirmation_request_rate)})`],
                      ['Confirmation success', (m: Metrics) => pct(m.confirmation_success_rate)],
                      ['Avg task duration', (m: Metrics) => (m.avg_task_duration_s == null ? '—' : `${m.avg_task_duration_s.toFixed(1)} s`)],
                    ] as [string, (m: Metrics) => string][]
                  ).map(([label, f]) => (
                    <tr key={label}>
                      <td className="px-4 py-2 text-muted">{label}</td>
                      <td className="px-2 py-2 font-mono text-ink">{f(a.by_mode.baseline)}</td>
                      <td className="px-2 py-2 font-mono text-ink">{f(a.by_mode.conduit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card title="Environment comparison" icon={<BarChart3 className="size-4" />} pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-line/70 text-left text-muted">
                    {['Environment', 'Sessions', 'Attempts', 'Deliberate ✓', 'False activations', 'Accidental rejected', 'Device ACK rate', 'Avg end-to-end'].map((h) => (
                      <th key={h} className="px-4 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {Object.entries(a.by_workspace ?? {}).map(([ws, m]) => (
                    <tr key={ws}>
                      <td className="px-4 py-2 font-medium text-ink">{getMode(ws)?.shortName ?? ws}</td>
                      <td className="px-4 py-2 font-mono text-muted">{a.sessions.filter((s) => (s.workspace || 'hospital') === ws).length}</td>
                      <td className="px-4 py-2 font-mono">{m.attempts}</td>
                      <td className="px-4 py-2 font-mono">{m.successful_deliberate}/{m.intended_trials} ({pct(m.deliberate_success_rate)})</td>
                      <td className="px-4 py-2 font-mono">{m.false_activations}/{m.unintended_trials}</td>
                      <td className="px-4 py-2 font-mono">{m.accidental_rejected}/{m.unintended_trials}</td>
                      <td className="px-4 py-2 font-mono">{pct(m.device_ack_rate)}</td>
                      <td className="px-4 py-2 font-mono">{ms(m.avg_e2e_latency_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line/60 px-4 py-3 text-[11px] leading-relaxed text-muted">
              Environments are only comparable when the same operator runs the same declared scenarios in each one. Small samples are indicative only.
            </p>
          </Card>

          <Card title="Test session history" icon={<ClipboardList className="size-4" />} pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead>
                  <tr className="border-b border-line/70 text-left text-muted">
                    {['#', 'Mode', 'Environment', 'Started', 'Attempts', 'Deliberate ✓', 'False activations', 'Note'].map((h) => (
                      <th key={h} className="px-4 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {a.sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 font-mono text-muted">{s.id}</td>
                      <td className={cn('px-4 py-2 font-medium', s.mode === 'conduit' ? 'text-teal' : 'text-warn')}>{s.mode}</td>
                      <td className="px-4 py-2 text-muted">{getMode(s.workspace)?.shortName ?? s.workspace ?? '—'}</td>
                      <td className="px-4 py-2 text-muted">{new Date(s.start_time * 1000).toLocaleString()}{!s.end_time && ' · running'}</td>
                      <td className="px-4 py-2 font-mono">{s.metrics?.attempts ?? 0}</td>
                      <td className="px-4 py-2 font-mono">{s.metrics ? `${s.metrics.successful_deliberate}/${s.metrics.intended_trials}` : '—'}</td>
                      <td className="px-4 py-2 font-mono">{s.metrics ? `${s.metrics.false_activations}/${s.metrics.unintended_trials}` : '—'}</td>
                      <td className="px-4 py-2 text-muted">{s.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card title="Metric definitions & protocol">
        <div className="grid gap-x-8 gap-y-2 text-xs leading-relaxed sm:grid-cols-2">
          {a &&
            Object.entries(a.definitions).map(([k, v]) => (
              <p key={k}>
                <span className="font-mono text-ink">{k}</span> <span className="text-muted">— {v}</span>
              </p>
            ))}
        </div>
        <p className="mt-4 border-t border-line/60 pt-3 text-xs leading-relaxed text-muted">
          <b className="text-ink">Protocol:</b> each trial is declared <i>intended</i> (with a target) or <i>unintended</i> by the operator <u>before</u> it is performed. Do the same scripted scenarios in Mode A and Mode B, ≥ 20 trials each, same operator, camera and lighting. A high rejection count is not proof of accuracy — read it together with the deliberate success rate. Full protocol: <span className="font-mono">docs/TEST_PROTOCOL.md</span>.
        </p>
      </Card>
    </div>
  )
}
