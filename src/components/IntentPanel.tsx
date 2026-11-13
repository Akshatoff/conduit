import { Brain, OctagonX, Power, PowerOff, Scale, ShieldCheck } from 'lucide-react'
import { rt } from '../runtime'
import { useConduit } from '../store'
import { STATE_LABEL, STATE_TONE } from './intentTheme'
import { Btn, Card, Meter, Pill, type Tone } from './ui'

const COMPONENT_LABELS: Record<string, string> = {
  consistency: 'Trajectory consistency',
  direction: 'Direction toward control',
  stability: 'Hand stability',
  dwell: 'Time in control zone',
  tracking: 'Landmark tracking quality',
  activation: 'Interaction activated',
  gesture: 'Gesture confirmation',
}

export function IntentPanel() {
  const intent = useConduit((s) => s.intent)
  const mode = useConduit((s) => s.interactionMode)
  const cfg = useConduit((s) => s.settings.intent)
  const camera = useConduit((s) => s.camera)
  const tone = STATE_TONE[intent.state]
  const baseline = mode === 'baseline'
  const confTone: Tone = intent.confidence >= cfg.min_confidence ? 'teal' : intent.confidence > 0.4 ? 'warn' : 'neutral'

  return (
    <Card title="Intent Engine" icon={<Brain className="size-4" />} right={<Pill tone={tone}>{STATE_LABEL[intent.state]}</Pill>}>
      <div className="space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted">What the system believes</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {baseline ? 'Gesture → command (no intent evaluation)' : intent.target_label ? `${intent.intent.replace(/_/g, ' ').toLowerCase()} · ${intent.target_label}${intent.action ? ` → ${intent.action}` : ''}` : intent.active ? 'Waiting for a deliberate approach to a control' : 'Not interacting'}
          </p>
          <p className="mt-1 min-h-9 text-xs leading-relaxed text-muted">{intent.reason}</p>
          {intent.reason_code && <p className="mt-0.5 font-mono text-[10px] text-muted/70">{intent.reason_code}</p>}
        </div>

        {!baseline && (
          <>
            <Meter label="Intent confidence" value={intent.confidence} tone={confTone} marker={cfg.min_confidence} hint={`${(intent.confidence * 100).toFixed(0)}% · min ${(cfg.min_confidence * 100).toFixed(0)}%`} height="h-2" />

            <div className="grid grid-cols-3 gap-3">
              <Meter label="Activation" value={intent.progress.activation} tone="accent" hint={intent.active ? 'on' : `${(intent.progress.activation * 100).toFixed(0)}%`} />
              <Meter label="Dwell" value={intent.progress.dwell} tone="teal" hint={`${intent.progress.dwell_s.toFixed(1)}s`} />
              <Meter
                label="Confirm window"
                value={intent.confirmation_required ? intent.progress.confirmation_remaining_s / Math.max(intent.progress.confirmation_timeout_s, 1) : 0}
                tone="warn"
                hint={intent.confirmation_required ? `${intent.progress.confirmation_remaining_s.toFixed(1)}s` : '—'}
              />
            </div>

            <details className="group rounded-lg border border-line/70 bg-bg/40 px-3 py-2" open>
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-ink/90">
                <Scale className="size-3.5 text-muted" /> Score components
                <span className="ml-auto text-[10px] font-normal text-muted">weights set in Settings</span>
              </summary>
              <div className="mt-3 space-y-2">
                {Object.keys(COMPONENT_LABELS).map((k) => {
                  const v = intent.components[k]
                  if (v === undefined && k === 'gesture') return <Meter key={k} label={COMPONENT_LABELS[k]} value={0} tone="neutral" hint="needs pinch" />
                  return <Meter key={k} label={COMPONENT_LABELS[k]} value={v ?? 0} tone={(v ?? 0) > 0.7 ? 'teal' : (v ?? 0) > 0.4 ? 'warn' : 'neutral'} hint={v === undefined ? '—' : v.toFixed(2)} />
                })}
              </div>
            </details>
          </>
        )}

        {intent.in_cooldown && (
          <Pill tone="warn">Cooldown {intent.cooldown_remaining.toFixed(1)}s — new selections blocked</Pill>
        )}

        <div className="flex flex-wrap gap-2">
          {!baseline && (
            <Btn variant={intent.active ? 'default' : 'primary'} size="sm" disabled={!camera.active && !(camera.state === 'running')} onClick={() => void (intent.active ? rt().deactivate() : rt().activate())}>
              {intent.active ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
              {intent.active ? 'Deactivate' : 'Activate'}
            </Btn>
          )}
          <Btn variant="danger" size="sm" onClick={() => void rt().cancel()} disabled={baseline}>
            <OctagonX className="size-3.5" /> Emergency cancel
          </Btn>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-teal" />
          Nothing executes without a deliberate selection and a separate pinch confirmation. Closed fist cancels.
        </p>
      </div>
    </Card>
  )
}
