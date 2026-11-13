import { ScrollText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useConduit } from '../store'
import { cn } from '../utils/cn'
import { clock } from '../utils/format'
import { Btn, Card } from './ui'

const levelCls = { info: 'bg-accent', ok: 'bg-teal', warn: 'bg-warn', error: 'bg-danger' } as const

export function EventLog({ max = 'max-h-80', title = 'Event log' }: { max?: string; title?: string }) {
  const log = useConduit((s) => s.log)
  const [ch, setCh] = useState<'all' | 'intent' | 'command' | 'system'>('all')
  const rows = ch === 'all' ? log : log.filter((l) => l.channel === ch)
  return (
    <Card
      title={title}
      icon={<ScrollText className="size-4" />}
      pad={false}
      right={
        <div className="flex items-center gap-1">
          {(['all', 'intent', 'command', 'system'] as const).map((c) => (
            <button key={c} onClick={() => setCh(c)} className={cn('rounded-md px-2 py-1 text-[11px] capitalize', ch === c ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink')}>
              {c}
            </button>
          ))}
          <Btn variant="ghost" size="sm" aria-label="Clear log" onClick={() => useConduit.setState({ log: [] })}>
            <Trash2 className="size-3.5" />
          </Btn>
        </div>
      }
    >
      <ul className={cn('divide-y divide-line/50 overflow-y-auto', max)}>
        {rows.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">No events yet. Every accepted or rejected interaction is logged here with its reason.</li>}
        {rows.map((r) => (
          <li key={r.id} className="animate-rise flex gap-3 px-4 py-2.5">
            <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', levelCls[r.level])} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium capitalize text-ink">{r.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">{clock(r.at)}</span>
              </div>
              <p className="text-xs leading-snug text-muted">{r.detail}</p>
              {r.code && <span className="mt-1 inline-block rounded bg-bg/70 px-1.5 py-0.5 font-mono text-[10px] text-muted">{r.code}</span>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
