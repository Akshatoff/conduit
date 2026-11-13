import { Check } from 'lucide-react'
import { useConduit } from '../store'
import { cn } from '../utils/cn'

/** Live view of the Conduit pipeline: hand tracked → … → execution verified. */
export function PipelineRibbon() {
  const frame = useConduit((s) => s.frame)
  const intent = useConduit((s) => s.intent)
  const traj = useConduit((s) => s.traj)
  const devices = useConduit((s) => s.devices)
  const st = intent.state
  const hand = !!frame?.hand_detected
  const moving = hand && (traj.speed > 0.03 || st !== 'IDLE')
  const ctx = !!intent.target || !!intent.hovered_zone
  const evaluating = ['SELECTING', 'AWAITING_CONFIRMATION', 'CONFIRMING', 'EXECUTING', 'COMPLETED'].includes(st)
  const validated = ['EXECUTING', 'COMPLETED'].includes(st)
  const dev = intent.target ? devices[intent.target] : undefined
  const acked = validated && !!dev?.last_ack && dev.last_ack.command_id === dev.last_command?.command_id
  const steps = [
    { label: 'Hand tracked', done: hand },
    { label: 'Movement analysed', done: moving },
    { label: 'Context', done: ctx },
    { label: 'Intent evaluated', done: evaluating },
    { label: 'Validated', done: validated },
    { label: 'Device ACK', done: acked },
    { label: 'Verified', done: st === 'COMPLETED' },
  ]
  const active = steps.findIndex((s) => !s.done)
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-xl border border-line bg-surface/70 px-3 py-2.5">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1">
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
              s.done ? 'border-teal/40 bg-teal/10 text-teal' : i === active && hand ? 'border-accent/40 bg-accent/10 text-accent' : 'border-line text-muted',
            )}
          >
            {s.done ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current opacity-60" />}
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-0.5 h-px w-3 bg-line" />}
        </li>
      ))}
    </ol>
  )
}
