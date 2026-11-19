import { Bolt, FlaskConical, Lightbulb, Lock, PlugZap, RotateCw, ShieldCheck, Unplug, Usb } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EventLog } from '../components/EventLog'
import { Btn, Card, Pill, type Tone } from '../components/ui'
import type { DeviceTwin } from '../core/types'
import { rt } from '../runtime'
import { useConduit } from '../store'
import { cn } from '../utils/cn'
import { ago } from '../utils/format'

/** Physical outputs this build can drive. There is no motor or fan. */
const OUTPUTS: { id: string; pin: string; title: string; wiring: string; actions: { action: string; label: string }[] }[] = [
  {
    id: 'lighting',
    pin: 'D3',
    title: 'LED',
    wiring: 'D3 → 220 Ω → LED anode · LED cathode → GND',
    actions: [
      { action: 'ON', label: 'LED ON' },
      { action: 'OFF', label: 'LED OFF' },
    ],
  },
  {
    id: 'access',
    pin: 'D9',
    title: 'Servo',
    wiring: 'Signal → D9 · V+ → external 5 V · GND → common ground',
    actions: [
      { action: 'UNLOCK', label: 'Rotate to 90°' },
      { action: 'LOCK', label: 'Rotate to 0°' },
    ],
  },
]

function stateTone(d: DeviceTwin): Tone {
  if (d.connection === 'disconnected' || d.confirmed_state === 'UNKNOWN') return 'danger'
  if (d.simulated) return 'warn'
  return 'teal'
}

function LedArt({ on, unknown }: { on: boolean; unknown: boolean }) {
  return (
    <div className="relative grid size-24 place-items-center">
      <div className={cn('absolute inset-0 rounded-full transition-opacity', on ? 'opacity-100' : 'opacity-0')} style={{ background: 'radial-gradient(circle, rgba(255,224,138,0.45) 0%, rgba(245,185,66,0) 70%)' }} />
      <Lightbulb className={cn('relative size-14', unknown ? 'text-muted' : on ? 'text-warn drop-shadow-[0_0_14px_rgba(245,185,66,0.8)]' : 'text-line')} strokeWidth={1.4} />
    </div>
  )
}

function ServoArt({ unlocked, unknown }: { unlocked: boolean; unknown: boolean }) {
  const angle = unknown ? 45 : unlocked ? 90 : 0
  return (
    <div className="grid size-24 place-items-center">
      <svg viewBox="0 0 100 100" className="size-24" aria-hidden>
        <circle cx="50" cy="50" r="34" fill="#0f1a2c" stroke={unknown ? '#8796aa' : '#3a4f72'} strokeWidth="2" strokeDasharray={unknown ? '4 4' : undefined} />
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '50px 50px', transition: 'transform 0.45s ease' }}>
          <rect x="47" y="12" width="6" height="40" rx="3" fill={unknown ? '#8796aa' : '#4da3ff'} />
          <circle cx="50" cy="16" r="4" fill={unknown ? '#8796aa' : '#42d6c5'} />
        </g>
        <circle cx="50" cy="50" r="6" fill="#162338" stroke="#8796aa" strokeWidth="2" />
        <text x="50" y="92" textAnchor="middle" fontSize="10" fill="#8796aa" fontFamily="ui-monospace,monospace">
          {unknown ? '?' : `${angle}°`}
        </text>
      </svg>
    </div>
  )
}

function OutputCard({ d, output }: { d: DeviceTwin | undefined; output: (typeof OUTPUTS)[number] }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!d) return null
  const unknown = d.confirmed_state === 'UNKNOWN' || d.connection === 'disconnected'
  const on = d.confirmed_state === 'ON'
  const unlocked = d.confirmed_state === 'UNLOCKED'
  const commands = output.actions

  const press = async (action: string) => {
    setBusy(action)
    try {
      await rt().testDevice(d.id, action)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card
      title={`${output.title} · ${output.pin}`}
      icon={output.id === 'lighting' ? <Lightbulb className="size-4" /> : <RotateCw className="size-4" />}
      right={<Pill tone={stateTone(d)}>{d.simulated ? 'SIMULATED' : d.connection === 'connected' ? 'PHYSICAL' : 'OFFLINE'}</Pill>}
    >
      <div className="flex items-center gap-5">
        {output.id === 'lighting' ? <LedArt on={on} unknown={unknown} /> : <ServoArt unlocked={unlocked} unknown={unknown} />}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted">Read-back state</p>
          <p className={cn('text-2xl font-semibold tracking-tight', unknown ? 'text-muted' : on || unlocked ? 'text-warn' : 'text-ink')}>{d.confirmed_state}</p>
          <p className="mt-1 text-[11px] text-muted">{output.wiring}</p>
          <p className="text-[11px] text-muted">source: {d.state_source === 'device_readback' ? 'Arduino read-back' : d.state_source}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line/60 pt-3">
        {commands.map((a) => {
          const active = a.action === 'ON' ? on : a.action === 'OFF' ? !on && !unknown : a.action === 'UNLOCK' ? unlocked : !unlocked && !unknown
          return (
            <Btn key={a.action} size="sm" variant={active ? 'primary' : 'default'} onClick={() => void press(a.action)} disabled={busy !== null}>
              {busy === a.action ? 'Sending…' : a.label}
            </Btn>
          )
        })}
        <span className="ml-auto self-center text-[11px] text-muted">
          {d.last_command ? `${d.last_command.action} · ${d.last_command.status} · ${ago(d.last_command.at)}` : 'no command yet'}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-[74px_1fr] gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted">Last ack</dt>
        <dd className="font-mono text-ink/90">{d.last_ack ? `${d.last_ack.status} → ${d.last_ack.actual_state ?? '?'}` : '—'}</dd>
        <dt className="text-muted">Command ID</dt>
        <dd className="truncate font-mono text-ink/70">{d.last_command?.command_id.slice(0, 18) ?? '—'}</dd>
        <dt className="text-muted">Error</dt>
        <dd className={cn(d.error ? 'text-danger' : 'text-muted')}>{d.error ?? 'none'}</dd>
      </dl>
    </Card>
  )
}

export function HardwarePage() {
  const devices = useConduit((s) => s.devices)
  const mode = useConduit((s) => s.hardwareMode)
  const info = useConduit((s) => s.hardwareInfo)
  const kind = useConduit((s) => s.runtimeKind)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(i)
  }, [])
  void tick

  const simulated = mode === 'simulation'
  const anyDisc = Object.values(devices).some((d) => d.connection === 'disconnected')
  const configured = Boolean(info?.port)

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('grid size-10 place-items-center rounded-lg border', simulated ? 'border-warn/30 bg-warn/10 text-warn' : anyDisc ? 'border-danger/30 bg-danger/10 text-danger' : 'border-teal/30 bg-teal/10 text-teal')}>
              <Usb className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">
                {simulated ? 'Arduino Uno · simulated outputs' : `Arduino Uno ${configured ? `· ${info?.port} @ ${info?.baud}` : '(serial port not set)'}`}
              </p>
              <p className="max-w-2xl text-xs leading-relaxed text-muted">
                {simulated
                  ? 'Bench mode: the two outputs are virtual. Commands use the same validation, acknowledgement and read-back path as the real board.'
                  : anyDisc
                    ? 'The board is not answering. States are UNKNOWN and no acknowledgement is ever invented. Check the cable, the port, that the sketch is flashed and that the Arduino Serial Monitor is closed.'
                    : 'Each button sends one manual_test command: SENT → ACK → independent read-back → CONFIRMED. The state below only changes when all three agree.'}
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-line bg-bg/60 p-0.5 text-xs">
              {(['simulation', 'hardware'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => void rt().setHardwareMode(m)}
                  className={cn('rounded-md px-3 py-1.5 capitalize', mode === m ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink')}
                >
                  {m}
                </button>
              ))}
            </div>
            <Btn size="sm" onClick={() => void rt().connectHardware()}>
              <PlugZap className="size-3.5" /> Test link
            </Btn>
            {!simulated && (
              <Btn size="sm" variant="ghost" onClick={() => void rt().setHardwareMode('simulation')}>
                <Unplug className="size-3.5" /> Back to simulation
              </Btn>
            )}
          </div>
        </div>
        {kind === 'browser' && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
            Browser runtime: a browser cannot open the Arduino USB serial port. Start the Python backend (scripts/run.bat) to drive real hardware.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {OUTPUTS.map((o) => (
          <OutputCard key={o.id} d={devices[o.id]} output={o} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <EventLog title="Bench command & acknowledgement log" max="max-h-72" />
        <Card title="Bench rules" icon={<ShieldCheck className="size-4" />}>
          <ul className="space-y-2 text-[11px] leading-relaxed text-muted">
            <li className="flex gap-2">
              <Bolt className="mt-px size-3.5 shrink-0 text-teal" /> Only two outputs exist: LED on D3 and an SG90 servo on D9. No motor, fan or mains device.
            </li>
            <li className="flex gap-2">
              <FlaskConical className="mt-px size-3.5 shrink-0 text-teal" /> Bench buttons are <span className="font-mono text-ink">manual_test</span> commands. Mode screens still go through the Intent Engine only.
            </li>
            <li className="flex gap-2">
              <Lock className="mt-px size-3.5 shrink-0 text-teal" /> Firmware failsafe: 5 s without a host PING → LED off, servo back to 0° (LOCKED).
            </li>
            <li className="flex gap-2">
              <Usb className="mt-px size-3.5 shrink-0 text-teal" /> One program per serial port: close the Arduino Serial Monitor before using Conduit.
            </li>
          </ul>
          <p className="mt-3 border-t border-line/60 pt-3 text-[10px] leading-relaxed text-muted/80">
            Power the servo from its own 5 V supply with a shared ground. Isolated low-voltage demonstration only.
          </p>
        </Card>
      </div>
    </div>
  )
}
