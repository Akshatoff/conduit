import type { AppSettings, Zone } from '../core/types'

/** The UI talks only to this interface; it is implemented by the FastAPI backend client and by the in-browser runtime. */
export interface Runtime {
  kind: 'backend' | 'browser'
  init(): Promise<void>
  startVision(): Promise<void>
  stopVision(): Promise<void>
  setInputSource(src: 'camera' | 'pointer'): void
  selectCamera(id: string): void
  attachVideo(host: HTMLElement | null): void
  setPointer(x: number, y: number, visible: boolean): void
  setPointerPinch(down: boolean): void
  activate(): Promise<void>
  deactivate(): Promise<void>
  cancel(): Promise<void>
  setInteractionMode(m: 'conduit' | 'baseline'): Promise<void>
  setWorkspaceMode(mode: string, zones: Zone[]): Promise<void>
  testDevice(id: string, action: string): Promise<void>
  setHardwareMode(m: 'simulation' | 'hardware'): Promise<void>
  connectHardware(): Promise<void>
  simulateFault(offline: boolean): Promise<void>
  applySettings(s: AppSettings): Promise<void>
  refreshAnalytics(): Promise<void>
  startSession(mode: 'baseline' | 'conduit', note: string): Promise<void>
  stopSession(): Promise<void>
  startTrial(label: 'intended' | 'unintended', target: string | null, scenario: string): Promise<void>
  endTrial(): Promise<void>
  exportCsv(): Promise<string>
  clearLocalAnalytics?(): void
}
