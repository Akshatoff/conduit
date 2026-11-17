import { BarChart3, Box, Camera, CameraOff, Cloud, Hand, LayoutGrid, Layers, Server, Settings2, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { getMode } from '../modes/registry'
import { useConduit, type Page } from '../store'
import { cn } from '../utils/cn'
import { Pill } from './ui'

const NAV: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'modes', label: 'Environments', icon: <LayoutGrid className="size-[18px]" /> },
  { id: 'workspace', label: 'Workspace', icon: <Layers className="size-[18px]" /> },
  { id: 'live', label: 'Live Interaction', icon: <Hand className="size-[18px]" /> },
  { id: 'twin', label: 'Digital Twin', icon: <Box className="size-[18px]" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="size-[18px]" /> },
  { id: 'settings', label: 'System Settings', icon: <Settings2 className="size-[18px]" /> },
]

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 40 40" className="size-9" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4da3ff" />
            <stop offset="1" stopColor="#42d6c5" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="11" fill="#0f1a2c" stroke="url(#lg)" strokeWidth="1.5" />
        <circle cx="11" cy="20" r="3.2" fill="#4da3ff" />
        <circle cx="29" cy="20" r="3.2" fill="#42d6c5" />
        <path d="M14.5 20h11" stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="1 4.2" />
        <path d="M11 13.5c4-4 14-4 18 0M11 26.5c4 4 14 4 18 0" stroke="url(#lg)" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.7" />
      </svg>
      <div className="leading-tight">
        <p className="text-[15px] font-semibold tracking-[0.18em] text-ink">CONDUIT</p>
        <p className="hidden text-[10px] text-muted sm:block">From human intent to physical action</p>
      </div>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const page = useConduit((s) => s.page)
  const kind = useConduit((s) => s.runtimeKind)
  const link = useConduit((s) => s.link)
  const camera = useConduit((s) => s.camera)
  const hw = useConduit((s) => s.hardwareMode)
  const activeMode = useConduit((s) => s.activeMode)
  const mode = getMode(activeMode)
  const notice = useConduit((s) => s.notice)
  const go = (p: Page) => useConduit.setState({ page: p })

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => useConduit.setState({ notice: null }), 5000)
    return () => clearTimeout(t)
  }, [notice])

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div
          className={cn(
            'mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6',
            page === 'workspace' ? 'max-w-[2400px]' : 'max-w-[1500px]',
          )}
        >
          <Logo />
          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => go(n.id)} aria-current={page === n.id ? 'page' : undefined} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors', page === n.id ? 'bg-surface2 text-ink shadow-[inset_0_-2px_0_#4da3ff]' : 'text-muted hover:bg-surface/70 hover:text-ink')}>
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {mode && (
              <button onClick={() => go('workspace')} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface2/60 px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent/50" title="Active operational environment — open workspace">
                <span className="size-2 rounded-full" style={{ background: mode.accent }} aria-hidden />
                {mode.shortName}
              </button>
            )}
            <Pill tone={kind === 'backend' ? (link === 'open' ? 'teal' : 'warn') : kind === 'browser' ? 'warn' : 'neutral'} icon={kind === 'backend' ? <Server className="size-3" /> : <Cloud className="size-3" />}>
              {kind === 'probing' ? 'Detecting backend…' : kind === 'backend' ? (link === 'open' ? 'Python backend · live' : 'Backend reconnecting…') : 'Browser runtime'}
            </Pill>
            <Pill tone={hw === 'simulation' ? 'warn' : 'teal'}>{hw === 'simulation' ? 'Simulation' : 'Hardware'}</Pill>
            {camera.active ? (
              <Pill tone="danger" pulse icon={<Camera className="size-3" />}>
                Camera active
              </Pill>
            ) : (
              <Pill tone="neutral" icon={<CameraOff className="size-3" />}>
                Camera off
              </Pill>
            )}
          </div>
        </div>
      </header>

      <main
        className={cn(
          'mx-auto w-full flex-1 px-4 pb-24 md:pb-10 lg:px-6',
          page === 'workspace' ? 'max-w-[2400px] pt-3' : 'max-w-[1500px] pt-5',
        )}
      >
        {children}
      </main>

      <footer
        className={cn(
          'mx-auto hidden w-full px-6 pb-6 text-[11px] leading-relaxed text-muted md:block',
          page === 'workspace' ? 'max-w-[2400px]' : 'max-w-[1500px]',
        )}
      >
        Conduit is a research prototype for isolated low-voltage demonstration electronics. It is not a certified medical, industrial or safety-critical control system and makes no claims about infection prevention or sterility. Camera data is processed locally and never recorded.
      </footer>

      {/* mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-bg/95 backdrop-blur md:hidden" aria-label="Main">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => go(n.id)} className={cn('flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium', page === n.id ? 'text-accent' : 'text-muted')}>
            {n.icon}
            {n.id === 'modes' ? 'Modes' : n.id === 'workspace' ? 'Space' : n.label.split(' ')[0]}
          </button>
        ))}
      </nav>

      {notice && (
        <div role="status" className="animate-rise fixed bottom-20 right-4 z-40 flex max-w-sm items-start gap-3 rounded-xl border border-line bg-surface2 px-4 py-3 text-sm text-ink shadow-2xl md:bottom-6">
          <p className="flex-1 leading-snug">{notice}</p>
          <button aria-label="Dismiss" onClick={() => useConduit.setState({ notice: null })} className="text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
