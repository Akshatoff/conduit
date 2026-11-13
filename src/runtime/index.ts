import { useConduit } from '../store'
import { BackendRuntime, probeBackend } from './backendRuntime'
import { LocalRuntime } from './localRuntime'
import type { Runtime } from './types'

let current: Runtime | null = null

export function rt(): Runtime {
  if (!current) throw new Error('Runtime not initialised')
  return current
}

export function hasRuntime() {
  return current !== null
}

export function defaultBackendUrl(): string {
  const saved = localStorage.getItem('conduit.backendUrl')
  if (saved) return saved
  if (location.protocol.startsWith('http') && location.port === '8000') return location.origin
  return 'http://localhost:8000'
}

/** Probe for the Python backend; fall back to the in-browser runtime (offline demonstration mode). */
export async function initRuntime(forceBrowser = false): Promise<Runtime> {
  const base = defaultBackendUrl()
  useConduit.setState({ runtimeKind: 'probing', backendUrl: base })
  const force = forceBrowser || localStorage.getItem('conduit.forceBrowser') === '1'
  const backendUp = !force && (await probeBackend(base))
  current = backendUp ? new BackendRuntime(base) : new LocalRuntime()
  useConduit.setState({ runtimeKind: current.kind })
  await current.init()
  return current
}

export function backendStreamUrl(): string {
  return `${useConduit.getState().backendUrl}/api/vision/stream`
}
