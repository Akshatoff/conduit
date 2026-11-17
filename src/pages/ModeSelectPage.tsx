import { ArrowRight, Brain, CheckCircle2, Layers, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { ModeArt } from '../components/mode/ModeArt'
import { Btn, Card, Pill } from '../components/ui'
import { enterModeLocal } from '../modes/actions'
import { MODES } from '../modes/registry'
import type { ModeDefinition } from '../modes/types'
import { rt } from '../runtime'
import { pushLog } from '../store'
import { cn } from '../utils/cn'

const PIPELINE = ['Activate', 'Approach', 'Dwell & score', 'Confirm', 'Execute', 'Verify']

function enter(mode: ModeDefinition, setBusy: (v: string | null) => void) {
  setBusy(mode.id)
  enterModeLocal(mode.id)
  pushLog({
    channel: 'system',
    level: 'ok',
    title: `Entering ${mode.shortName}`,
    detail: 'Loading mode controls, workflows and device mappings into the shared Intent Engine (camera is not restarted).',
    code: 'MODE_SELECT',
  })
  void rt()
    .setWorkspaceMode(mode.id, mode.zones)
    .catch((e: unknown) => pushLog({ channel: 'system', level: 'warn', title: 'Mode sync failed', detail: String(e) }))
    .finally(() => setBusy(null))
}

export function ModeSelectPage() {
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface/70 px-5 py-8 sm:px-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-teal/10 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">Conduit · Operational environments</p>
          <h1 className="mt-3 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
            From human intent to physical action — choose the environment you want to operate in.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
            Each environment solves a different problem and has its own dashboard, controls and workflow. All five share the
            <b className="text-ink"> same Intent Engine</b>: movement analysis, dwell, stability, confidence, explicit confirmation and device verification. Selecting an environment never restarts the camera.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            {PIPELINE.map((p, i) => (
              <span key={p} className="flex items-center gap-1.5">
                <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-medium', i === 3 ? 'border-warn/40 bg-warn/10 text-warn' : 'border-line bg-bg/40 text-muted')}>{p}</span>
                {i < PIPELINE.length - 1 && <span className="text-[10px] text-muted/50">→</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">Choose your environment</h2>
          <p className="mt-0.5 text-[11px] text-muted">Fictional demonstration data throughout. No connection to real medical, manufacturing, industrial or kitchen systems.</p>
        </div>
        <Pill tone="teal" icon={<Brain className="size-3" />}>one shared intent engine</Pill>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MODES.map((m, i) => (
          <Card key={m.id} className={cn('flex h-full flex-col overflow-hidden', i < 2 && 'xl:col-span-1')} pad={false}>
            <div className="border-b border-line/70 bg-bg/40">
              <ModeArt mode={m.id} className="h-auto w-full" />
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{m.name}</h3>
                  <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: m.accent }} aria-hidden />
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted">{m.tagline}</p>
              </div>

              <dl className="space-y-1.5 text-[10px] leading-snug">
                <div className="flex gap-1.5">
                  <dt className="w-16 shrink-0 text-muted/80">Setting</dt>
                  <dd className="text-muted">{m.environment}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="w-16 shrink-0 text-muted/80">Users</dt>
                  <dd className="text-muted">{m.audience}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="w-16 shrink-0 text-muted/80">Problem</dt>
                  <dd className="line-clamp-3 text-muted">{m.problem}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-1">
                {m.features.slice(0, 3).map((f) => (
                  <span key={f} className="rounded border border-line bg-bg/40 px-1.5 py-0.5 text-[9px] text-muted">{f}</span>
                ))}
                <span className="rounded border border-line bg-bg/40 px-1.5 py-0.5 text-[9px] text-muted">+{m.features.length - 3} more</span>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line/60 pt-3">
                <span className="flex items-center gap-1 text-[9px] text-warn/80">
                  <ShieldAlert className="size-3" /> prototype · simulated
                </span>
                <Btn size="sm" variant={i < 2 ? 'primary' : 'default'} disabled={busy !== null} onClick={() => enter(m, setBusy)}>
                  {busy === m.id ? 'Loading…' : 'Enter mode'} <ArrowRight className="size-3.5" />
                </Btn>
              </div>
            </div>
          </Card>
        ))}

        <Card className="flex h-full flex-col justify-between gap-4 border-dashed bg-surface/40">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">Shared Conduit Core</h3>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Spatial perception → Intent Engine → interaction controller → command validation → device abstraction → analytics.
              Modes only contribute configuration, controls, workflows, demo data and visual dashboards.
            </p>
            <ul className="mt-3 space-y-1.5 text-[10px] leading-snug text-muted">
              {[
                'Same deterministic state machine in every mode',
                'Physical ACK + read-back verification is never bypassed',
                'Digital controls are labelled and never touch hardware',
                'Analytics record the environment for honest comparison',
              ].map((l) => (
                <li key={l} className="flex gap-1.5"><CheckCircle2 className="mt-px size-3 shrink-0 text-teal" />{l}</li>
              ))}
            </ul>
          </div>
          <p className="rounded-lg border border-line/70 bg-bg/40 p-2.5 text-[10px] leading-snug text-muted">
            Research prototype. Not a certified medical, cleanroom, industrial or food-safety product. Hardware is limited to an isolated LED, small fan and model servo.
          </p>
        </Card>
      </div>
    </div>
  )
}
