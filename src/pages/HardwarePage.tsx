import { Bolt, CircleAlert, FlaskConical, Flashlight, Info, PlugZap, ShieldCheck, Smartphone, SunMedium, Unplug, Usb, Vibrate } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EventLog } from '../components/EventLog'
import { Btn, Card, Pill, type Tone } from '../components/ui'
import type { DeviceTwin } from '../core/types'
import { rt } from '../runtime'
import type { PhoneInventory } from '../runtime/types'
import { useConduit } from '../store'
import { cn } from '../utils/cn'
import { ago } from '../utils/format'

/** The three physical outputs. They live on the phone: no motor, no latch, no mains. */
const OUTPUTS: {
  id: string
  title: string
  subtitle: string
  adb: string
  actions: { action: string; label: string }[]
}[] = [
  {
    id: 'torch',
    title: 'Torch',
    subtitle: 'Rear camera LED. Driven by `cmd torch`; if the phone does not expose it, the node uses a full-brightness screen flash instead and says so.',
    adb: 'adb shell cmd torch set on|off',
    actions: [
      { action: 'ON', label: 'Torch on' },
      { action: 'OFF', label: 'Torch off' },
    ],
  },
  {
    id: 'screen',
    title: 'Screen flash',
    subtitle: 'Backlight at maximum + wake. Brightness is read back from the phone, so this output can reach CONFIRMED.',
    adb: 'adb shell settings put system screen_brightness 255',
    actions: [
      { action: 'ON', label: 'Flash on' },
      { action: 'OFF', label: 'Restore' },
    ],
  },
  {
    id: 'vibration',
    title: 'Vibration',
    subtitle: 'Repeating haptic pulse while ON. The motor has no readable state over ADB, so this output stops at ACKNOWLEDGED.',
    adb: 'adb shell cmd vibrator vibrate 700',
    actions: [
      { action: 'ON', label: 'Buzz' },
      { action: 'OFF', label: 'Silence' },
    ],
  },
]

function stateTone(d: DeviceTwin): Tone {
  if (d.connection === 'disconnected' || d.confirmed_state === 'UNKNOWN') return 'danger'
  if (d.simulated) return 'warn'
  return d.verified ? 'teal' : 'accent'
}

function TorchArt({ on, unknown }: { on: boolean; unknown: boolean }) {
  return (
    <div className="relative grid size-24 place-items-center">
      <div className={cn('absolute inset-0 rounded-full transition-opacity', on ? 'opacity-100' : 'opacity-0')} style={{ background: 'radial-gradient(circle, rgba(255,232,150,0.5) 0%, rgba(245,185,66,0) 70%)' }} />
      <Flashlight className={cn('relative size-14', unknown ? 'text-muted' : on ? 'text-warn drop-shadow-[0_0_14px_rgba(245,185,66,0.8)]' : 'text-line')} strokeWidth={1.4} />
    </div>
  )
}

function ScreenArt({ on, unknown }: { on: boolean; unknown: boolean }) {
  return (
    <div className="grid size-24 place-items-center">
      <div className={cn('relative h-20 w-12 rounded-md border-2 transition-colors', unknown ? 'border-muted/50' : on ? 'border-accent' : 'border-line')}>
        <div className={cn('absolute inset-1 rounded-sm transition-all', on ? 'bg-white shadow-[0_0_22px_6px_rgba(255,255,255,0.55)]' : 'bg-surface2')} />
        <span className={cn('absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono text-[9px]', on ? 'text-accent' : 'text-muted')}>{unknown ? '?' : on ? '255' : 'auto'}</span>
      </div>
    </div>
  )
}

function VibrationArt({ on, unknown }: { on: boolean; unknown: boolean }) {
  return (
    <div className="relative grid size-24 place-items-center">
      {on && !unknown && (
        <>
          <span className="absolute size-16 animate-ping rounded-full border border-accent/40" />
          <span className="absolute size-20 rounded-full border border-accent/20" />
        </>
      )}
      <Vibrate className={cn('relative size-14', unknown ? 'text-muted' : on ? 'text-accent' : 'text-line')} strokeWidth={1.4} />
    </div>
  )
}

function OutputCard({ d, output }: { d: DeviceTwin | undefined; output: (typeof OUTPUTS)[number] }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!d) return null
  const unknown = d.confirmed_state === 'UNKNOWN' || d.connection === 'disconnected'
  const on = d.confirmed_state === 'ON'
  const art =
    output.id === 'torch' ? <TorchArt on={on} unknown={unknown} /> : output.id === 'screen' ? <ScreenArt on={on} unknown={unknown} /> : <VibrationArt on={on} unknown={unknown} />
  const Icon = output.id === 'torch' ? Flashlight : output.id === 'screen' ? SunMedium : Vibrate

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
      title={output.title}
      icon={<Icon className="size-4" />}
      right={<Pill tone={stateTone(d)}>{d.simulated ? 'SIMULATED' : d.connection === 'connected' ? (d.verified ? 'PHYSICAL' : 'PHYSICAL · ACK') : 'OFFLINE'}</Pill>}
    >
      <div className="flex items-center gap-5">
        {art}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted">{d.verified || d.simulated ? 'Read-back state' : 'Acknowledged state'}</p>
          <p className={cn('text-2xl font-semibold tracking-tight', unknown ? 'text-muted' : on ? 'text-warn' : 'text-ink')}>{d.confirmed_state}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{output.subtitle}</p>
          <p className="mt-1 font-mono text-[10px] text-muted/80">{output.adb}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line/60 pt-3">
        {output.actions.map((a) => {
          const active = a.action === 'ON' ? on : !on && !unknown
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
        <dt className="text-muted">Verified</dt>
        <dd className={cn(d.verified ? 'text-teal' : 'text-muted')}>{d.verified ? 'independent read-back' : 'ack only (no read-back)'}</dd>
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
  const settings = useConduit((s) => s.settings)
  const [inventory, setInventory] = useState<PhoneInventory | null>(null)
  const [scanning, setScanning] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(i)
  }, [])
  void tick

  const scan = async () => {
    if (kind !== 'backend') return
    setScanning(true)
    try {
      setInventory(await rt().phoneInventory())
    } finally {
      setScanning(false)
    }
  }
  useEffect(() => {
    if (kind === 'backend') void scan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  const simulated = mode === 'simulation'
  const anyDisc = Object.values(devices).some((d) => d.connection === 'disconnected')
  const phone = inventory?.devices.find((d) => d.state === 'device') ?? inventory?.devices[0]
  const caps = info.capabilities ?? {}
  const model = info.model ?? phone?.model ?? null
  const serial = info.serial || phone?.serial || settings.phone.serial

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('grid size-10 place-items-center rounded-lg border', simulated ? 'border-warn/30 bg-warn/10 text-warn' : anyDisc ? 'border-danger/30 bg-danger/10 text-danger' : 'border-teal/30 bg-teal/10 text-teal')}>
              <Smartphone className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">
                {simulated ? 'Phone node · simulated outputs' : model ? `Phone · ${model}${serial ? ` (${serial})` : ''}` : 'Phone · not detected'}
              </p>
              <p className="max-w-2xl text-xs leading-relaxed text-muted">
                {simulated
                  ? 'Bench mode: the three phone outputs are virtual. Commands use the same validation, acknowledgement and read-back path as the real phone.'
                  : anyDisc
                    ? 'The phone is not answering adb. States are UNKNOWN and no acknowledgement is ever invented. Check the USB data cable, Developer options → USB debugging, and the "Allow USB debugging" prompt.'
                    : 'Each button sends one manual_test command: SENT → ACK → independent read-back where the phone exposes it. Torch and vibration can only be acknowledged.'}
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
            <Btn size="sm" variant="ghost" onClick={() => void scan()} disabled={kind !== 'backend' || scanning}>
              <Usb className={cn('size-3.5', scanning && 'animate-pulse')} /> {scanning ? 'Scanning…' : 'Find phones'}
            </Btn>
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

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'adb', value: inventory?.version ?? (inventory?.adb ? inventory.adb : info.adb ?? 'not found'), ok: Boolean(inventory?.adb ?? info.adb) },
            { label: 'Serial', value: serial || 'first ready device', ok: Boolean(serial) },
            { label: 'Android', value: info.android ?? '—', ok: Boolean(info.android) },
            { label: 'Capabilities', value: `torch ${caps.torch ? 'yes' : 'no'} · buzz ${caps.vibration ? 'yes' : 'no'} · screen ${caps.screen ? 'yes' : 'no'}`, ok: Boolean(caps.torch || caps.vibration || caps.screen) },
          ].map((f) => (
            <div key={f.label} className="rounded-lg border border-line/70 bg-bg/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted">{f.label}</p>
              <p className={cn('truncate font-mono text-[11px]', f.ok ? 'text-ink/90' : 'text-muted')} title={f.value}>{f.value}</p>
            </div>
          ))}
        </div>

        {inventory?.error && (
          <p className="mt-3 flex gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
            <CircleAlert className="mt-px size-3.5 shrink-0" /> {inventory.error}
          </p>
        )}
        {inventory?.hint && !inventory.error && (
          <p className="mt-3 flex gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
            <Info className="mt-px size-3.5 shrink-0" /> {inventory.hint}
          </p>
        )}
        {!simulated && inventory && inventory.devices.length > 0 && (
          <p className="mt-3 flex gap-2 rounded-lg border border-line/70 bg-bg/40 px-3 py-2 text-[11px] leading-relaxed text-muted">
            <Info className="mt-px size-3.5 shrink-0" />
            {phone?.state === 'device' ? 'Phone ready for adb commands.' : `adbd reports "${phone?.state}" — accept the debugging prompt on the phone.`}
            {caps.torch_reason && !caps.torch ? ` Torch unavailable (${caps.torch_reason}); the torch output drives the screen flash instead.` : ''}
          </p>
        )}
        {kind === 'browser' && (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[11px] leading-relaxed text-warn">
            Browser runtime: a browser cannot run adb. Start the Python backend (scripts/run.bat) with the phone on USB to drive real hardware.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {OUTPUTS.map((o) => (
          <OutputCard key={o.id} d={devices[o.id]} output={o} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <EventLog title="Bench command & acknowledgement log" max="max-h-72" />
        <Card title="Bench rules" icon={<ShieldCheck className="size-4" />}>
          <ul className="space-y-2 text-[11px] leading-relaxed text-muted">
            <li className="flex gap-2">
              <Bolt className="mt-px size-3.5 shrink-0 text-teal" /> Exactly three outputs exist: the rear torch, the screen backlight and the vibration motor. Nothing else is actuated.
            </li>
            <li className="flex gap-2">
              <FlaskConical className="mt-px size-3.5 shrink-0 text-teal" /> Bench buttons are <span className="font-mono text-ink">manual_test</span> commands. Mode screens still go through the Intent Engine only.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-teal" /> Torch and vibration cannot be queried over ADB: those commands stop at ACKNOWLEDGED and are labelled “ack only”. Nothing is dressed up as CONFIRMED.
            </li>
            <li className="flex gap-2">
              <Smartphone className="mt-px size-3.5 shrink-0 text-teal" /> No root, no app install: adb + USB debugging. Reboot the phone and the outputs return to the system defaults.
            </li>
          </ul>
          <p className="mt-3 border-t border-line/60 pt-3 text-[10px] leading-relaxed text-muted/80">
            Use a USB data cable (some cables are charge-only). The phone can stay locked; the torch, screen flash and vibration work without unlocking.
          </p>
        </Card>
      </div>
    </div>
  )
}
