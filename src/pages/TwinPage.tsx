import { Cpu, Flashlight, FlaskConical, PlugZap, Server, Smartphone, Unplug, Vibrate, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EventLog } from '../components/EventLog'
import { ModeTwinPanel } from '../components/mode/ModeTwinPanel'
import { getMode } from '../modes/registry'
import { Btn, Card, Pill, type Tone } from '../components/ui'
import type { DeviceTwin } from '../core/types'
import { rt } from '../runtime'
import { useConduit } from '../store'
import { cn } from '../utils/cn'
import { ago } from '../utils/format'

function DeviceArt({ type, on, unknown }: { type: string; on: boolean; unknown: boolean }) {
  const stroke = unknown ? '#8796aa' : on ? '#f5b942' : '#3a4f72'
  if (type === 'display') {
    return (
      <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
        <rect x="38" y="14" width="44" height="80" rx="8" fill="#0f1a2c" stroke={stroke} strokeWidth="2.5" strokeDasharray={unknown ? '4 4' : undefined} />
        <rect x="43" y="20" width="34" height="66" rx="4" fill={on ? '#ffffff' : '#18263d'} opacity={on ? 0.95 : 1} />
        <circle cx="60" cy="91" r="2.5" fill="#3a4f72" />
        <text x="60" y="108" textAnchor="middle" fontSize="9" fill="#8796aa" fontFamily="ui-monospace,monospace">
          {unknown ? 'brightness ?' : on ? 'backlight 255' : 'backlight auto'}
        </text>
      </svg>
    )
  }
  if (type === 'haptic') {
    return (
      <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
        <rect x="40" y="18" width="40" height="72" rx="7" fill="#0f1a2c" stroke={stroke} strokeWidth="2.5" strokeDasharray={unknown ? '4 4' : undefined} />
        {on && !unknown && (
          <>
            <path d="M24 34c-6 8-6 20 0 28" stroke="#42d6c5" strokeWidth="2" fill="none" opacity="0.9" />
            <path d="M15 28c-9 11-9 29 0 40" stroke="#42d6c5" strokeWidth="1.6" fill="none" opacity="0.55" />
            <path d="M96 34c6 8 6 20 0 28" stroke="#42d6c5" strokeWidth="2" fill="none" opacity="0.9" />
            <path d="M105 28c9 11 9 29 0 40" stroke="#42d6c5" strokeWidth="1.6" fill="none" opacity="0.55" />
          </>
        )}
        <text x="60" y="108" textAnchor="middle" fontSize="9" fill="#8796aa" fontFamily="ui-monospace,monospace">
          {unknown ? 'motor ?' : on ? 'pulsing' : 'idle'}
        </text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
      <defs>
        <radialGradient id="torchglow" cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#f5b942" stopOpacity="0" />
        </radialGradient>
      </defs>
      {on && <circle cx="60" cy="74" r="52" fill="url(#torchglow)" />}
      <rect x="24" y="46" width="72" height="22" rx="6" fill="#0f1a2c" stroke={stroke} strokeWidth="2.5" strokeDasharray={unknown ? '4 4' : undefined} />
      <path d="M96 46 L112 40 V74 L96 68 Z" fill={on ? '#ffd877' : '#18263d'} stroke={stroke} strokeWidth="2" />
      <rect x="36" y="52" width="10" height="10" rx="2" fill={on ? '#f5b942' : '#2a3d5c'} />
      <text x="60" y="108" textAnchor="middle" fontSize="9" fill="#8796aa" fontFamily="ui-monospace,monospace">
        {unknown ? 'torch ?' : on ? 'torch on' : 'torch off'}
      </text>
    </svg>
  )
}

const STEPS = ['SENT', 'ACKNOWLEDGED', 'CONFIRMED'] as const

function Lifecycle({ d }: { d: DeviceTwin }) {
  const st = d.last_command?.status
  const idx = st === 'CONFIRMED' ? 3 : st === 'ACKNOWLEDGED' ? 2 : st === 'SENT' ? 1 : d.last_ack && st !== 'FAILED' ? 2 : 0
  const failed = st === 'FAILED' || st === 'DISCONNECTED' || st === 'REJECTED'
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-1.5">
            <div className={cn('h-1.5 flex-1 rounded-full', failed && i === Math.max(0, idx) ? 'bg-danger' : i < idx ? 'bg-teal' : i === idx && d.pending_command_id ? 'animate-soft-pulse bg-accent' : 'bg-line')} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wider text-muted">
        <span>Sent</span>
        <span>Acknowledged</span>
        <span>State confirmed</span>
      </div>
      {failed && <p className="mt-1.5 text-[11px] font-medium text-danger">{st}</p>}
    </div>
  )
}

function connTone(c: DeviceTwin['connection']): { tone: Tone; label: string } {
  if (c === 'connected') return { tone: 'teal', label: 'Connected' }
  if (c === 'simulated') return { tone: 'warn', label: 'Simulated node' }
  return { tone: 'danger', label: 'Disconnected' }
}

function DeviceCard({ d, tick }: { d: DeviceTwin; tick: number }) {
  void tick
  const unknown = d.confirmed_state === 'UNKNOWN'
  const on = d.confirmed_state === 'ON'
  const conn = connTone(d.connection)
  const Icon = d.type === 'display' ? Smartphone : d.type === 'haptic' ? Vibrate : Flashlight
  return (
    <Card
      title={d.name}
      icon={<Icon className="size-4" />}
      right={
        <div className="flex items-center gap-1.5">
          {d.simulated && <Pill tone="warn">SIMULATED STATE</Pill>}
          <Pill tone={conn.tone} icon={d.connection === 'disconnected' ? <WifiOff className="size-3" /> : <Wifi className="size-3" />}>
            {conn.label}
          </Pill>
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <DeviceArt type={d.type} on={on} unknown={unknown} />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted">{d.verified || d.simulated ? 'Confirmed state' : 'Acknowledged state'}</p>
          <p className={cn('text-2xl font-semibold tracking-tight', unknown ? 'text-muted' : on ? 'text-warn' : 'text-ink')}>{d.confirmed_state}</p>
          <p className="mt-1 text-[11px] text-muted">{d.hardware}</p>
          <p className="text-[11px] text-muted">source: {d.state_source === 'device_readback' ? 'device read-back' : d.state_source === 'node_ack' ? 'node ack (no read-back)' : d.state_source}</p>
          {d.readback_note && <p className="mt-1 text-[10px] leading-snug text-muted/80">{d.readback_note}</p>}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <Lifecycle d={d} />
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted">Last command</dt>
          <dd className="truncate font-mono text-ink/90">{d.last_command ? `${d.last_command.action} · ${d.last_command.source.replace('conduit_intent_engine', 'intent').replace('baseline_gesture', 'baseline').replace('manual_test', 'MANUAL TEST')} · ${ago(d.last_command.at)}` : '—'}</dd>
          <dt className="text-muted">Command ID</dt>
          <dd className="truncate font-mono text-ink/70">{d.last_command?.command_id.slice(0, 18) ?? '—'}</dd>
          <dt className="text-muted">Last ack</dt>
          <dd className="font-mono text-ink/90">{d.last_ack ? `${d.last_ack.status} → ${d.last_ack.actual_state ?? '?'} · ${ago(d.last_ack.at)}` : '—'}</dd>
          <dt className="text-muted">Error</dt>
          <dd className={cn('text-xs', d.error ? 'text-danger' : 'text-muted')}>{d.error ?? 'none'}</dd>
        </dl>
        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <FlaskConical className="size-3.5" /> Manual test (bypasses gestures)
          </span>
          <div className="ml-auto flex gap-1.5">
            {d.actions.map((a) => (
              <Btn key={a} size="sm" onClick={() => void rt().testDevice(d.id, a)}>
                {a}
              </Btn>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function TwinPage() {
  const devices = useConduit((s) => s.devices)
  const mode = useConduit((s) => s.hardwareMode)
  const info = useConduit((s) => s.hardwareInfo)
  const kind = useConduit((s) => s.runtimeKind)
  const active = useConduit((s) => s.activeMode)
  const activeMode = getMode(active)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000) // refresh "x s ago"
    return () => clearInterval(i)
  }, [])
  const list = Object.values(devices)
  const simulated = mode === 'simulation'
  const anyDisc = list.some((d) => d.connection === 'disconnected')

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('grid size-10 place-items-center rounded-lg border', simulated ? 'border-warn/30 bg-warn/10 text-warn' : anyDisc ? 'border-danger/30 bg-danger/10 text-danger' : 'border-teal/30 bg-teal/10 text-teal')}>
              {simulated ? <Server className="size-5" /> : <Cpu className="size-5" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">{simulated ? 'Simulation node' : `Phone node ${info.model ? `· ${info.model}` : ''}${info.serial ? ` (${info.serial})` : ' (serial not set)'}`}</p>
              <p className="text-xs text-muted">
                {simulated
                  ? 'All device states shown are SIMULATED. Commands use the same validation, acknowledgement and read-back path as real hardware.'
                  : anyDisc
                    ? 'Phone unreachable — states are UNKNOWN. No acknowledgement is ever simulated in hardware mode; the node stops every pulse and releases the torch.'
                    : 'States come back from the phone: screen brightness is read back, torch and vibration are acknowledged only.'}
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {activeMode && <Pill tone="accent">{activeMode.shortName} environment</Pill>}
            <div className="flex rounded-lg border border-line bg-bg/60 p-0.5 text-xs">
              {(['simulation', 'hardware'] as const).map((m) => (
                <button key={m} onClick={() => void rt().setHardwareMode(m)} className={cn('rounded-md px-3 py-1.5 capitalize', mode === m ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink')}>
                  {m}
                </button>
              ))}
            </div>
            {mode === 'hardware' ? (
              <Btn size="sm" onClick={() => void rt().connectHardware()}>
                <PlugZap className="size-3.5" /> Test connection
              </Btn>
            ) : (
              <>
                <Btn size="sm" variant="danger" onClick={() => void rt().simulateFault(true)} disabled={anyDisc}>
                  <Unplug className="size-3.5" /> Simulate link failure
                </Btn>
                <Btn size="sm" onClick={() => void rt().simulateFault(false)} disabled={!anyDisc}>
                  <PlugZap className="size-3.5" /> Restore link
                </Btn>
              </>
            )}
          </div>
        </div>
      </Card>

      <ModeTwinPanel />

      {list.length === 0 ? (
        <p className="text-sm text-muted">Waiting for device registration…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((d) => (
            <DeviceCard key={d.id} d={d} tick={tick} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <EventLog title="Command & acknowledgement log" max="max-h-80" />
        <Card title="Safety notes">
          <ul className="space-y-2 text-xs leading-relaxed text-muted">
            <li>• The twin changes <b className="text-ink">only</b> after an acknowledgement; it is marked <b className="text-ink">CONFIRMED</b> only when an independent state read-back agrees. Sending a command never updates it.</li>
            <li>• Demonstration hardware is the phone itself: rear torch, screen backlight and vibration motor. Nothing else is actuated.</li>
            <li>• Never connect Conduit to mains power, real door locks, medical or industrial equipment.</li>
            <li>• On loss of contact the node stops every vibration pulse and releases the torch; the screen returns to its saved brightness.</li>
            {kind === 'browser' && <li>• A browser cannot run adb: hardware mode needs the Python backend on the same machine as the phone.</li>}
          </ul>
        </Card>
      </div>
    </div>
  )
}
