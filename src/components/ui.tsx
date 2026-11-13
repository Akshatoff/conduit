import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/cn'

export type Tone = 'neutral' | 'accent' | 'teal' | 'warn' | 'danger'

const toneText: Record<Tone, string> = {
  neutral: 'text-muted',
  accent: 'text-accent',
  teal: 'text-teal',
  warn: 'text-warn',
  danger: 'text-danger',
}
const toneChip: Record<Tone, string> = {
  neutral: 'border-line bg-surface2/60 text-muted',
  accent: 'border-accent/30 bg-accent/10 text-accent',
  teal: 'border-teal/30 bg-teal/10 text-teal',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  danger: 'border-danger/30 bg-danger/10 text-danger',
}
export const toneBar: Record<Tone, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  teal: 'bg-teal',
  warn: 'bg-warn',
  danger: 'bg-danger',
}
export { toneText }

export function Card({ title, icon, right, children, className, pad = true }: { title?: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface/90 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]', className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-ink">
            {icon && <span className="text-muted">{icon}</span>}
            {title}
          </h3>
          {right}
        </header>
      )}
      <div className={cn(pad && 'p-4')}>{children}</div>
    </section>
  )
}

export function Pill({ tone = 'neutral', children, icon, className, pulse }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string; pulse?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none', toneChip[tone], className)}>
      {icon && <span className={cn(pulse && 'animate-soft-pulse')}>{icon}</span>}
      {children}
    </span>
  )
}

export function Btn({ variant = 'default', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'teal'; size?: 'sm' | 'md' }) {
  const v = {
    default: 'border-line bg-surface2 text-ink hover:border-accent/50 hover:bg-surface2/80',
    primary: 'border-accent/60 bg-accent text-[#06101f] hover:bg-accent/90 font-semibold',
    teal: 'border-teal/60 bg-teal text-[#04201d] hover:bg-teal/90 font-semibold',
    danger: 'border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
    ghost: 'border-transparent bg-transparent text-muted hover:text-ink hover:bg-surface2/60',
  }[variant]
  return (
    <button
      {...p}
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40', size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm', v, className)}
    />
  )
}

export function Meter({ label, value, tone = 'accent', marker, hint, height = 'h-1.5' }: { label?: string; value: number; tone?: Tone; marker?: number; hint?: string; height?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div>
      {(label || hint) && (
        <div className="mb-1 flex items-baseline justify-between text-[11px]">
          <span className="text-muted">{label}</span>
          <span className="font-mono text-ink/80">{hint ?? v.toFixed(2)}</span>
        </div>
      )}
      <div className={cn('relative w-full overflow-hidden rounded-full bg-bg/80', height)}>
        <div className={cn('h-full rounded-full transition-[width] duration-150', toneBar[tone])} style={{ width: `${v * 100}%` }} />
        {marker !== undefined && <div className="absolute top-0 h-full w-0.5 bg-ink/70" style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }} />}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink/90">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full rounded-lg border border-line bg-bg/70 px-3 py-2 text-sm text-ink placeholder:text-muted/60 focus:border-accent/60 focus:outline-none'

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <div className="text-muted">{icon}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-xs leading-relaxed text-muted">{children}</div>}
    </div>
  )
}
