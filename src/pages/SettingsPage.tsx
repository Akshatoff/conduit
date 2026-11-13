import { Camera, Cpu, EyeOff, Gauge, Hand, Link2, RotateCcw, Save, SlidersHorizontal, Waypoints } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Btn, Card, Field, Pill, inputCls } from '../components/ui'
import { DEVICE_SPECS, defaultSettings } from '../core/config'
import type { AppSettings } from '../core/types'
import { rt } from '../runtime'
import { useConduit } from '../store'
import { cn } from '../utils/cn'

function Slider({ label, value, min, max, step, unit = '', hint, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; hint?: string; onChange: (v: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1.5 w-full cursor-pointer" />
        <span className="w-16 shrink-0 text-right font-mono text-xs text-ink">
          {value.toFixed(step < 0.1 ? 2 : step < 1 ? 2 : 0)}
          {unit}
        </span>
      </div>
    </Field>
  )
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} className={cn('relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50', on ? 'border-teal/50 bg-teal/30' : 'border-line bg-bg')}>
      <span className={cn('absolute top-0.5 size-4.5 rounded-full transition-all', on ? 'left-5.5 bg-teal' : 'left-0.5 bg-muted')} />
    </button>
  )
}

const GESTURE_OPTS = [
  ['open_palm', 'Open palm'],
  ['pinch', 'Pinch'],
  ['fist', 'Closed fist'],
  ['point', 'Pointing'],
]

export function SettingsPage() {
  const stored = useConduit((s) => s.settings)
  const kind = useConduit((s) => s.runtimeKind)
  const cameras = useConduit((s) => s.cameras)
  const backendUrl = useConduit((s) => s.backendUrl)
  const [s, setS] = useState<AppSettings>(() => structuredClone(stored))
  const [url, setUrl] = useState(backendUrl)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setS(structuredClone(stored))
  }, [stored, dirty])

  const upd = (fn: (d: AppSettings) => void) => {
    const d = structuredClone(s)
    fn(d)
    setS(d)
    setDirty(true)
  }
  const save = async () => {
    await rt().applySettings(s)
    setDirty(false)
  }
  const i = s.intent

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <p className="text-sm text-muted">{dirty ? 'You have unsaved changes.' : 'Settings are saved' + (kind === 'backend' ? ' on the backend.' : ' in this browser.')}</p>
        <div className="ml-auto flex gap-2">
          <Btn size="sm" variant="ghost" onClick={() => { setS(defaultSettings()); setDirty(true) }}>
            <RotateCcw className="size-3.5" /> Defaults
          </Btn>
          <Btn size="sm" variant="primary" disabled={!dirty} onClick={() => void save()}>
            <Save className="size-3.5" /> Save changes
          </Btn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Intent thresholds" icon={<Gauge className="size-4" />}>
          <div className="space-y-4">
            <Slider label="Minimum confidence" value={i.min_confidence} min={0.4} max={0.99} step={0.01} hint="Commands below this score are never executed." onChange={(v) => upd((d) => void (d.intent.min_confidence = v))} />
            <Slider label="Minimum dwell duration" value={i.min_dwell_s} min={0.2} max={2.5} step={0.05} unit=" s" hint="Time the hand must stay in a zone before it can be selected." onChange={(v) => upd((d) => void (d.intent.min_dwell_s = v))} />
            <Slider label="Movement stability threshold" value={i.stability_threshold} min={0.2} max={0.95} step={0.01} hint="1 = perfectly still. Higher rejects shaky hands." onChange={(v) => upd((d) => void (d.intent.stability_threshold = v))} />
            <Slider label="Confirmation timeout" value={i.confirmation_timeout_s} min={2} max={20} step={0.5} unit=" s" hint="Selection is cancelled if no pinch arrives in time." onChange={(v) => upd((d) => void (d.intent.confirmation_timeout_s = v))} />
            <Slider label="Cooldown after execution" value={i.cooldown_s} min={0} max={10} step={0.5} unit=" s" hint="Blocks new selections after a command." onChange={(v) => upd((d) => void (d.intent.cooldown_s = v))} />
            <details className="rounded-lg border border-line/70 bg-bg/40 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-ink">
                <SlidersHorizontal className="size-3.5 text-muted" /> Score weights (advanced)
              </summary>
              <div className="mt-3 space-y-3">
                {Object.keys(i.weights).map((k) => (
                  <Slider key={k} label={k} value={i.weights[k]} min={0} max={0.5} step={0.01} onChange={(v) => upd((d) => void (d.intent.weights[k] = v))} />
                ))}
                <p className="text-[11px] text-muted">Weights are normalised, so only their ratios matter.</p>
              </div>
            </details>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Gesture mapping" icon={<Hand className="size-4" />}>
            <div className="grid gap-3 sm:grid-cols-3">
              {([['activate', 'Activate / deactivate'], ['confirm', 'Confirm selection'], ['cancel', 'Cancel']] as const).map(([k, label]) => (
                <Field key={k} label={label}>
                  <select className={inputCls} value={i.gestures[k]} onChange={(e) => upd((d) => void (d.intent.gestures[k] = e.target.value))}>
                    {GESTURE_OPTS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">Selection is always movement into a control zone — never a gesture alone.</p>
          </Card>

          <Card title="Device mappings" icon={<Waypoints className="size-4" />}>
            <div className="space-y-2">
              {i.zones.map((z, idx) => (
                <div key={z.id} className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Field label={`Zone ${idx + 1} label`}>
                    <input className={inputCls} value={z.label} onChange={(e) => upd((d) => void (d.intent.zones[idx].label = e.target.value))} />
                  </Field>
                  <Field label="Controls device">
                    <select className={inputCls} value={z.device} onChange={(e) => upd((d) => void (d.intent.zones[idx].device = e.target.value))}>
                      {Object.values(DEVICE_SPECS).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.hardware})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="font-mono text-[10px] text-muted sm:pb-2.5">x {z.x0.toFixed(2)}–{z.x1.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card title="Camera" icon={<Camera className="size-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Camera device" hint={kind === 'backend' ? 'Index as seen by OpenCV on the backend machine.' : 'Chosen in the browser; applied when the camera starts.'}>
              {cameras.length ? (
                <select className={inputCls} value={kind === 'backend' ? String(s.camera.index) : undefined} onChange={(e) => (kind === 'backend' ? upd((d) => void (d.camera.index = Number(e.target.value))) : rt().selectCamera(e.target.value))}>
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={inputCls} type="number" min={0} max={9} value={s.camera.index} onChange={(e) => upd((d) => void (d.camera.index = Number(e.target.value)))} />
              )}
            </Field>
            <Field label="Resolution (4:3 keeps overlay aligned)">
              <select className={inputCls} value={`${s.camera.width}x${s.camera.height}`} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); upd((d) => { d.camera.width = w; d.camera.height = h }) }}>
                {['640x480', '800x600', '1024x768'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Slider label="Landmark smoothing" value={s.camera.smoothing_alpha} min={0.1} max={1} step={0.05} hint="Lower = smoother but laggier. 1 = no smoothing." onChange={(v) => upd((d) => void (d.camera.smoothing_alpha = v))} />
            </div>
          </div>
        </Card>

        <Card title="Simulation & ESP32" icon={<Cpu className="size-4" />} right={<Pill tone={s.hardware_mode === 'simulation' ? 'warn' : 'teal'}>{s.hardware_mode === 'simulation' ? 'Simulation' : 'Real hardware'}</Pill>}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-bg/40 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-ink">Simulation mode</p>
                <p className="text-[11px] text-muted">Virtual devices; same validation and acknowledgement path. Always available.</p>
              </div>
              <Toggle label="Simulation mode" on={s.hardware_mode === 'simulation'} onChange={(v) => upd((d) => void (d.hardware_mode = v ? 'simulation' : 'hardware'))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_90px_100px]">
              <Field label="ESP32 IP / host">
                <input className={inputCls} placeholder="192.168.1.50" value={s.esp32.host} onChange={(e) => upd((d) => void (d.esp32.host = e.target.value.trim()))} />
              </Field>
              <Field label="Port">
                <input className={inputCls} type="number" value={s.esp32.port} onChange={(e) => upd((d) => void (d.esp32.port = Number(e.target.value)))} />
              </Field>
              <Field label="Timeout (s)">
                <input className={inputCls} type="number" step={0.5} min={0.5} max={10} value={s.esp32.timeout_s} onChange={(e) => upd((d) => void (d.esp32.timeout_s = Number(e.target.value)))} />
              </Field>
            </div>
            <Btn size="sm" onClick={() => void rt().connectHardware()} disabled={dirty}>
              Test connection {dirty && '(save first)'}
            </Btn>
            <p className="text-[11px] leading-relaxed text-muted">The IP address is printed on the ESP32 serial monitor after boot. Isolated low-voltage demo electronics only.</p>
          </div>
        </Card>

        <Card title="Privacy" icon={<EyeOff className="size-4" />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Show camera preview</p>
                <p className="text-[11px] text-muted">{kind === 'backend' ? 'Local MJPEG preview from the backend. Turn off to show landmarks only.' : 'Browser runtime always keeps video on-device.'}</p>
              </div>
              <Toggle label="Camera preview" on={s.privacy.preview_stream} disabled={kind !== 'backend'} onChange={(v) => upd((d) => void (d.privacy.preview_stream = v))} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Store video</p>
                <p className="text-[11px] text-muted">Locked off. No code path records or uploads frames.</p>
              </div>
              <Toggle label="Store video" on={false} disabled onChange={() => undefined} />
            </div>
            <ul className="space-y-1 border-t border-line/60 pt-3 text-[11px] leading-relaxed text-muted">
              <li>• All camera processing is local; nothing is sent to a cloud service.</li>
              <li>• A red “CAMERA ACTIVE” indicator is shown whenever the camera is on.</li>
              <li>• Only structured events (state, confidence, reason) are logged — no images.</li>
            </ul>
          </div>
        </Card>

        <Card title="Connection" icon={<Link2 className="size-4" />} className="lg:col-span-2">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Backend URL">
              <input className={cn(inputCls, 'w-72')} value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <Btn size="sm" onClick={() => { localStorage.setItem('conduit.backendUrl', url); localStorage.removeItem('conduit.forceBrowser'); location.reload() }}>
              Reconnect
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => { localStorage.setItem('conduit.forceBrowser', '1'); location.reload() }}>
              Use browser runtime
            </Btn>
            <Pill tone={kind === 'backend' ? 'teal' : 'warn'}>{kind === 'backend' ? 'Using Python backend' : 'Using in-browser runtime (offline fallback)'}</Pill>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The UI auto-detects the FastAPI backend at this address on load. Without it, Conduit runs the same Intent Engine, device simulation and analytics inside this tab so a demo never depends on a server.
          </p>
        </Card>
      </div>
    </div>
  )
}
