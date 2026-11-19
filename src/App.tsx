import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { HardwarePage } from './pages/HardwarePage'
import { LivePage } from './pages/LivePage'
import { ModeSelectPage } from './pages/ModeSelectPage'
import { SettingsPage } from './pages/SettingsPage'
import { TwinPage } from './pages/TwinPage'
import { WorkspacePage } from './pages/WorkspacePage'
import { hasRuntime, initRuntime } from './runtime'
import { useConduit } from './store'

let booted = false

export default function App() {
  const page = useConduit((s) => s.page)
  const kind = useConduit((s) => s.runtimeKind)

  useEffect(() => {
    if (booted) return
    booted = true
    void initRuntime()
  }, [])

  const ready = kind !== 'probing' && hasRuntime()

  return (
    <Layout>
      {!ready ? (
        <div className="grid h-[60vh] place-items-center text-sm text-muted">
          <span className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-accent" /> Detecting Conduit backend…
          </span>
        </div>
      ) : (
        <>
          {page === 'modes' && <ModeSelectPage />}
          {page === 'workspace' && <WorkspacePage />}
          {page === 'live' && <LivePage />}
          {page === 'twin' && <TwinPage />}
          {page === 'hardware' && <HardwarePage />}
          {page === 'analytics' && <AnalyticsPage />}
          {page === 'settings' && <SettingsPage />}
        </>
      )}
    </Layout>
  )
}
