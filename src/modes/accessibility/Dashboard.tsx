import { Accessibility, Info, Maximize2, Minimize2, MousePointerClick, Settings2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ModePanel, useModeState } from '../../components/mode/DashboardKit'
import { Btn, Card, Meter, Pill } from '../../components/ui'
import type { IntentConfig, Zone } from '../../core/types'
import { rt } from '../../runtime'
import { useConduit } from '../../store'
import { cn } from '../../utils/cn'
import { ACCESSIBILITY_MODE } from './config'
import { ACCESSIBILITY_NOTICE, CONTENT_ITEMS, SETTING_HINTS } from './demoData'

function expanded(zones: Zone[]): Zone[] {
  return zones.map((z) => {
    const cx = (z.x0 + z.x1) / 2
    const cy = (z.y0 + z.y1) / 2
    // widen only: enlarging vertically would make adjacent rail rows overlap and produce an
    // ambiguous hover zone (the engine intentionally picks the first match)
    const w = (z.x1 - z.x0) * 1.12
    const h = z.y1 - z.y0
    return {
      ...z,
      x0: Math.max(0.015, cx - w / 2),
      y0: Math.max(0.015, cy - h / 2),
      x1: Math.min(0.985, cx + w / 2),
      y1: Math.min(0.785, cy + h / 2),
    }
  })
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onCommit: (v: number) => void
  hint: string
}) {
  const [local, setLocal] = useState(value)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-ink/90">{label}</span>
        <span className="font-mono text-[11px] text-accent">{format(local)}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => onCommit(local)}
        onKeyUp={() => onCommit(local)}
        className="w-full accent-[#b18cff]"
      />
      <p className="mt-0.5 text-[10px] leading-snug text-muted">{hint}</p>
    </div>
  )
}

export function AccessibilityDashboard() {
  const state = useModeState()
  const intent = useConduit((s) => s.settings.intent)
  const settings = useConduit((s) => s.settings)
  const zones = useConduit((s) => s.zones)
  const [large, setLarge] = useState(() => zones.some((z) => z.x1 - z.x0 > 0.41))
  if (!state) return null
  const focused = CONTENT_ITEMS[state.focusIndex]

  const commit = (patch: Partial<IntentConfig>) => {
    const next = { ...settings, intent: { ...settings.intent, ...patch } }
    void rt().applySettings(next)
  }

  const setGestures = (key: 'activate' | 'confirm', gesture: string) => {
    const gestures = { ...intent.gestures, [key]: gesture }
    if (gestures.activate === gestures.confirm) {
      if (key === 'confirm') gestures.activate = gesture === 'pinch' ? 'open_palm' : 'open_palm'
      else gestures.confirm = gesture === 'pinch' ? 'point' : 'pinch'
    }
    commit({ gestures })
  }

  const toggleLarge = () => {
    const next = !large
    setLarge(next)
    void rt().setWorkspaceMode('accessibility', next ? expanded(ACCESSIBILITY_MODE.zones) : ACCESSIBILITY_MODE.zones)
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg border border-[#b18cff]/40 bg-[#b18cff]/10 text-[#b18cff]">
            <Accessibility className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink">Adaptive interaction surface</h2>
              <Pill tone="neutral">{ACCESSIBILITY_NOTICE}</Pill>
            </div>
            <p className="mt-1 text-xs text-muted">
              {state.selections} deliberate selection(s) · focus {state.focusIndex + 1}/{CONTENT_ITEMS.length} · configuration applies to the shared Intent Engine
            </p>
          </div>
          <Btn size="sm" onClick={toggleLarge}>
            {large ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            {large ? 'Standard controls' : 'Large controls'}
          </Btn>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ModePanel
            title={state.panel === 'reading' ? `Reading view · ${focused.title}` : 'Demo panels'}
            icon={<Sparkles className="size-4" />}
            right={<Pill tone={state.panel === 'reading' ? 'accent' : 'neutral'}>{state.panel}</Pill>}
          >
            {state.panel === 'reading' ? (
              <div className="space-y-3">
                <p className="text-base leading-relaxed text-ink">{focused.body}</p>
                <p className="text-xs leading-relaxed text-muted">{focused.body}</p>
                <p className="rounded-lg border border-line/70 bg-bg/40 p-2.5 text-[11px] text-muted">
                  The reading view enlarges the same text. It does not synthesise speech (out of scope for this prototype).
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {CONTENT_ITEMS.map((item, i) => (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-lg border p-3',
                      i === state.focusIndex ? 'border-[#b18cff]/70 bg-[#b18cff]/10' : state.panel === 'grid' ? 'border-line/70 bg-bg/40' : 'border-line/50 bg-bg/30',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      {i === state.focusIndex && <Pill tone="accent">focus</Pill>}
                    </div>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted">{item.body}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-snug text-muted">
              <Info className="mt-px size-3.5 shrink-0 text-[#b18cff]" />
              Use NEXT to move focus, SELECT to choose, READ for the larger view and BACK to return. Every action needs the configured confirmation gesture.
            </p>
          </ModePanel>

          <ModePanel title="Configuration checklist" icon={<Settings2 className="size-4" />} right={<Pill tone="neutral">{state.checklistIndex}/{ACCESSIBILITY_MODE.checklist.length}</Pill>}>
            <ul className="space-y-1.5">
              {ACCESSIBILITY_MODE.checklist.map((c, i) => (
                <li key={c} className="flex items-center gap-2 text-[11px] text-muted">
                  <span className={cn('grid size-4 place-items-center rounded-full border text-[9px]', i < state.checklistIndex ? 'border-teal bg-teal/15 text-teal' : 'border-line text-muted')}>{i < state.checklistIndex ? '✓' : i + 1}</span>
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-muted/80">This checklist is a demonstration aid, not an accessibility compliance checklist.</p>
          </ModePanel>
        </div>

        <div className="space-y-4">
          <ModePanel title="Interaction settings" icon={<Settings2 className="size-4" />} right={<Pill tone="accent">live config</Pill>}>
            <div className="space-y-4">
              <Slider
                label="Dwell time"
                value={intent.min_dwell_s}
                min={0.2}
                max={2}
                step={0.05}
                format={(v) => `${v.toFixed(2)} s`}
                hint="How long a still hand must remain in a control before selection."
                onCommit={(v) => commit({ min_dwell_s: v })}
              />
              <Slider
                label="Minimum confidence"
                value={intent.min_confidence}
                min={0.4}
                max={0.95}
                step={0.01}
                format={(v) => v.toFixed(2)}
                hint="Lower accepts weaker evidence; higher rejects more movements."
                onCommit={(v) => commit({ min_confidence: v })}
              />
              <Slider
                label="Hand stability required"
                value={intent.stability_threshold}
                min={0.3}
                max={0.9}
                step={0.01}
                format={(v) => v.toFixed(2)}
                hint="Minimum movement stability at the moment of selection."
                onCommit={(v) => commit({ stability_threshold: v })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-medium text-ink/90">
                  Activation gesture
                  <select
                    className="mt-1 w-full rounded-lg border border-line bg-bg/70 px-2.5 py-2 text-xs text-ink"
                    value={intent.gestures.activate}
                    onChange={(e) => setGestures('activate', e.target.value)}
                  >
                    <option value="open_palm">Open palm</option>
                    <option value="point">Point</option>
                  </select>
                </label>
                <label className="block text-[11px] font-medium text-ink/90">
                  Confirmation gesture
                  <select
                    className="mt-1 w-full rounded-lg border border-line bg-bg/70 px-2.5 py-2 text-xs text-ink"
                    value={intent.gestures.confirm}
                    onChange={(e) => setGestures('confirm', e.target.value)}
                  >
                    <option value="pinch">Pinch</option>
                    <option value="point">Point</option>
                  </select>
                </label>
              </div>
              <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted">
                <MousePointerClick className="mt-px size-3.5 shrink-0 text-[#b18cff]" />
                Cancellation stays on the closed fist. Changes take effect on the running engine — the camera is never restarted.
              </p>
              <div className="space-y-2 rounded-lg border border-line/70 bg-bg/40 p-2.5">
                <Meter label="Confidence threshold" value={intent.min_confidence} tone="accent" hint={intent.min_confidence.toFixed(2)} />
                <Meter label="Dwell" value={(intent.min_dwell_s - 0.2) / 1.8} tone="teal" hint={`${intent.min_dwell_s.toFixed(2)} s`} />
                <Meter label="Stability" value={intent.stability_threshold} tone="warn" hint={intent.stability_threshold.toFixed(2)} />
              </div>
            </div>
          </ModePanel>

          <ModePanel title="Why these settings" icon={<Info className="size-4" />}>
            <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted">
              {SETTING_HINTS.map((h) => (
                <li key={h}>· {h}</li>
              ))}
            </ul>
            <p className="mt-2 border-t border-line/60 pt-2 text-[10px] leading-snug text-muted/80">
              Gesture input is not suitable for everyone. Adjustments here demonstrate configurability, not a validated accessibility assessment.
            </p>
          </ModePanel>
        </div>
      </div>
    </div>
  )
}
