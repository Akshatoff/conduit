// Remembered CAM 2 (object camera) choice for the signature screens. The capture itself lives in
// the signature view; Settings only stores which browser video device should be used.

export const OBJECT_CAMERA_KEY = 'conduit.objectCamera'
export const OBJECT_CAMERA_EVENT = 'conduit:object-camera'

export function readObjectCameraId(): string {
  try {
    return localStorage.getItem(OBJECT_CAMERA_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeObjectCameraId(id: string): void {
  try {
    localStorage.setItem(OBJECT_CAMERA_KEY, id)
  } catch {
    /* storage can be unavailable */
  }
  window.dispatchEvent(new CustomEvent<string>(OBJECT_CAMERA_EVENT, { detail: id }))
}

export function subscribeObjectCamera(cb: (id: string) => void): () => void {
  const onCustom = (e: Event) => cb((e as CustomEvent<string>).detail ?? '')
  const onStorage = (e: StorageEvent) => {
    if (e.key === OBJECT_CAMERA_KEY) cb(e.newValue ?? '')
  }
  window.addEventListener(OBJECT_CAMERA_EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(OBJECT_CAMERA_EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}
