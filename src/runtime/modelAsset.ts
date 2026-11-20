// MediaPipe task-model loading with validation.
//
// A `.task` file is a ZIP archive (the official hand model is ~7.8 MB and may carry a small prefix
// before the first local file header). MediaPipe's C++ loader reports a *cryptic*
// "Unable to open zip archive" when the URL it was given returned something else — an HTML error
// page, a captive-portal page or a truncated download. We therefore fetch the model bytes here,
// check them, and hand MediaPipe a buffer only when it really is a task bundle. That turns the
// failure into a message that says which URL failed and why.

export const TASK_MIN_BYTES = 7_000_000

export interface TaskModel {
  /** The URL the bytes came from (useful in logs and error messages). */
  url: string
  bytes: Uint8Array
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function hasSequence(data: Uint8Array, seq: number[], from: number, to: number): boolean {
  const end = Math.min(to, data.length) - seq.length
  for (let i = Math.max(0, from); i <= end; i++) {
    let hit = true
    for (let j = 0; j < seq.length; j++) {
      if (data[i + j] !== seq[j]) {
        hit = false
        break
      }
    }
    if (hit) return true
  }
  return false
}

const LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04] // "PK\x03\x04"
const END_OF_CENTRAL_DIR = [0x50, 0x4b, 0x05, 0x06] // "PK\x05\x06"

/** True when the bytes are a plausible MediaPipe `.task` bundle. */
export function looksLikeTaskModel(data: Uint8Array): boolean {
  if (data.length < TASK_MIN_BYTES) return false
  // Some published task files start with a couple of bytes before the ZIP header, so allow a small
  // prefix; the central-directory record must still be near the end (a truncated file fails here).
  return (
    hasSequence(data, LOCAL_HEADER, 0, 4096) &&
    hasSequence(data, END_OF_CENTRAL_DIR, Math.max(0, data.length - 4096), data.length)
  )
}

function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Short, human-readable diagnosis of a downloaded body. */
export function describeBytes(data: Uint8Array): string {
  const head = Array.from(data.slice(0, 64))
    .map((b) => String.fromCharCode(b))
    .join('')
    .trimStart()
    .toLowerCase()
  if (head.startsWith('<') || head.startsWith('{') || head.startsWith('version https://git-lfs')) {
    const kind = head.startsWith('version https://git-lfs') ? 'a Git LFS pointer' : head.startsWith('{') ? 'a JSON/text page' : 'a web page'
    return `${sizeLabel(data.length)}, not a model file (it is ${kind})`
  }
  if (looksLikeTaskModel(data)) return `${sizeLabel(data.length)} task bundle`
  return `${sizeLabel(data.length)}, not a complete MediaPipe .task archive`
}

/**
 * Fetch the first usable `.task` model from `urls`.
 *
 * Every candidate is validated before use; the collected failures explain exactly what each URL
 * returned (HTTP status, HTML page, truncated file), which is what the camera error shows.
 */
export async function loadTaskModel(urls: string[], fetchImpl: FetchLike = fetch): Promise<TaskModel> {
  const problems: string[] = []
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { cache: 'no-store' })
      if (!res.ok) {
        problems.push(`${url} returned HTTP ${res.status}`)
        continue
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!looksLikeTaskModel(bytes)) {
        problems.push(`${url} returned ${describeBytes(bytes)}`)
        continue
      }
      return { url, bytes }
    } catch (e) {
      problems.push(`${url} could not be fetched (${e instanceof Error ? e.message : String(e)})`)
    }
  }
  throw new Error(
    `no usable hand_landmarker.task. ${problems.join('; ')}. ` +
      'The model ships in public/mediapipe/hand_landmarker.task — restore it (scripts\\fetch_model.bat) or drop a valid copy there.',
  )
}

/**
 * Pick a MediaPipe WASM runtime directory.
 *
 * `FilesetResolver.forVisionTasks(base)` is happy to return URLs without checking them, so a wrong
 * base path only explodes later inside MediaPipe. Probing the loader script here keeps the failure
 * readable — and an SPA dev server answers a missing file with `index.html`, which is a web page,
 * not JavaScript.
 */
export async function pickWasmBase(bases: string[], fetchImpl: FetchLike = fetch): Promise<string> {
  const problems: string[] = []
  for (const base of bases) {
    try {
      const res = await fetchImpl(`${base}/vision_wasm_internal.js`, { cache: 'no-store' })
      if (!res.ok) {
        problems.push(`${base} returned HTTP ${res.status}`)
        continue
      }
      const head = (await res.text()).slice(0, 256).trimStart().toLowerCase()
      if (head.startsWith('<')) {
        problems.push(`${base} returned a web page instead of the runtime`)
        continue
      }
      if (head.startsWith('version https://git-lfs')) {
        problems.push(`${base} returned a Git LFS pointer`)
        continue
      }
      return base
    } catch (e) {
      problems.push(`${base} could not be fetched (${e instanceof Error ? e.message : String(e)})`)
    }
  }
  throw new Error(`the MediaPipe runtime files could not be loaded: ${problems.join('; ')}`)
}
