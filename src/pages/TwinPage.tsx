import { Cpu, FlaskConical, Lightbulb, Lock, PlugZap, Server, Unplug, Wifi, WifiOff, Wind } from 'lucide-react'
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

function BulbArt({ on, unknown }: { on: boolean; unknown: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
      <defs>
        <radialGradient id="glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#ffe9a8" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f5b942" stopOpacity="0" />
        </radialGradient>
      </defs>
      {on && <circle cx="60" cy="52" r="52" fill="url(#glow)" />}
      <path d="M60 18c-17 0-29 12-29 28 0 11 6 18 12 25 3 4 5 8 5 13h24c0-5 2-9 5-13 6-7 12-14 12-25 0-16-12-28-29-28z" fill={on ? '#ffd877' : '#18263d'} stroke={unknown ? '#8796aa' : on ? '#f5b942' : '#3a4f72'} strokeWidth="2.5" strokeDasharray={unknown ? '4 4' : undefined} />
      <rect x="48" y="86" width="24" height="7" rx="3" fill="#2a3d5c" />
      <rect x="51" y="95" width="18" height="7" rx="3" fill="#2a3d5c" />
    </svg>
  )
}

function FanArt({ on, unknown }: { on: boolean; unknown: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
      <circle cx="60" cy="60" r="50" fill="#0f1a2c" stroke={unknown ? '#8796aa' : on ? '#42d6c5' : '#3a4f72'} strokeWidth="2.5" strokeDasharray={unknown ? '4 4' : undefined} />
      <g className={cn(on && 'animate-fan')} style={{ transformOrigin: '60px 60px' }}>
        {[0, 120, 240].map((a) => (
          <path key={a} transform={`rotate(${a} 60 60)`} d="M60 60C52 40 54 22 66 16c10 8 8 28-6 44z" fill={on ? '#42d6c5' : '#2a3d5c'} opacity={on ? 0.9 : 1} />
        ))}
      </g>
      <circle cx="60" cy="60" r="7" fill="#162338" stroke="#8796aa" />
    </svg>
  )
}

function LatchArt({ locked, unknown }: { locked: boolean; unknown: boolean }) {
  const col = unknown ? '#8796aa' : locked ? '#4da3ff' : '#f5b942'
  return (
    <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
      <rect x="14" y="30" width="30" height="60" rx="6" fill="#0f1a2c" stroke="#3a4f72" strokeWidth="2.5" />
      <rect x="76" y="30" width="30" height="60" rx="6" fill="#0f1a2c" stroke="#3a4f72" strokeWidth="2.5" />
      <rect x="40" y="52" width="46" height="16" rx="5" fill={col} style={{ transform: `translateX(${locked && !unknown ? 0 : -26}px)`, transition: 'transform 0.5s ease' }} opacity={unknown ? 0.4 : 1} />
      <circle cx="29" cy="78" r="3" fill="#8796aa" />
      <text x="60" y="108" textAnchor="middle" fontSize="9" fill="#8796aa" fontFamily="ui-monospace,monospace">SG90 · model latch</text>
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
  const locked = d.confirmed_state === 'LOCKED'
  const conn = connTone(d.connection)
  const Icon = d.type === 'led' ? Lightbulb : d.type === 'fan' ? Wind : Lock
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
        {d.type === 'led' && <BulbArt on={on} unknown={unknown} />}
        {d.type === 'fan' && <FanArt on={on} unknown={unknown} />}
        {d.type === 'servo_latch' && <LatchArt locked={locked} unknown={unknown} />}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted">Confirmed state</p>
          <p className={cn('text-2xl font-semibold tracking-tight', unknown ? 'text-muted' : on || d.confirmed_state === 'UNLOCKED' ? 'text-warn' : 'text-ink')}>{d.confirmed_state}</p>
          <p className="mt-1 text-[11px] text-muted">{d.hardware}</p>
          <p className="text-[11px] text-muted">source: {d.state_source === 'device_readback' ? 'device read-back' : d.state_source}</p>
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
              <p className="text-sm font-semibold text-ink">{simulated ? 'Simulation node' : `ESP32 node ${info.host ? `· ${info.host}:${info.port}` : '(not configured)'}`}</p>
              <p className="text-xs text-muted">
                {simulated
                  ? 'All device states shown are SIMULATED. Commands use the same validation, acknowledgement and read-back path as real hardware.'
                  : anyDisc
                    ? 'Node unreachable — states are UNKNOWN. No acknowledgement is ever simulated in hardware mode; firmware failsafe returns outputs to safe state.'
                    : 'Physical states are read back from the device after each acknowledgement.'}
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
        <div className="grid gap-4 lg:grid-cols-3">
          {list.map((d) => (
            <DeviceCard key={d.id} d={d} tick={tick} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <EventLog title="Command & acknowledgement log" max="max-h-80" />
        <Card title="Safety notes">
          <ul className="space-y-2 text-xs leading-relaxed text-muted">
            <li>• The twin changes <b className="text-ink">only</b> after an acknowledgement <i>and</i> an independent state read-back agree. Sending a command never updates it.</li>
            <li>• Demonstration hardware is isolated low-voltage only: LED, small DC fan, SG90 servo with a model latch.</li>
            <li>• Never connect Conduit to mains power, real door locks, medical or industrial equipment.</li>
            <li>• ESP32 firmware returns outputs to a safe state (LED off, fan off, latch locked) when host contact is lost.</li>
            {kind === 'browser' && <li>• Browser runtime talks to the ESP32 directly over HTTP; this needs the page to be served over http/file (not https).</li>}
          </ul>
        </Card>
      </div>
    </div>
  )
}
