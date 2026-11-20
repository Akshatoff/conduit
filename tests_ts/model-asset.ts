// Checks for the MediaPipe model loader: validate BEFORE MediaPipe sees the bytes.
//
// Background: when the model URL returns an HTML block page or a truncated download, MediaPipe fails
// with "Unable to open zip archive" and the UI only showed "Camera could not start". The loader now
// rejects such bodies itself and names the URL and the reason.
import { TASK_MIN_BYTES, describeBytes, loadTaskModel, looksLikeTaskModel, pickWasmBase } from '../src/runtime/modelAsset'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
}

function taskModelBytes(prefix = 0, size = TASK_MIN_BYTES + 1024): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x50, 0x4b, 0x03, 0x04], prefix) // "PK\x03\x04" local file header
  bytes.set([0x50, 0x4b, 0x05, 0x06], size - 22) // "PK\x05\x06" end of central directory
  return bytes
}

const valid = taskModelBytes()
check('a full task bundle is accepted', looksLikeTaskModel(valid))
check('the published 2-byte prefix is tolerated', looksLikeTaskModel(taskModelBytes(2)))
check('an HTML page is rejected', !looksLikeTaskModel(new TextEncoder().encode('<!doctype html><title>Blocked</title>')))
check('a short file is rejected', !looksLikeTaskModel(taskModelBytes(0, 4096)))
check('a truncated archive is rejected', !looksLikeTaskModel(valid.slice(0, valid.length - 32)))
check('HTML is described as a web page', /web page/.test(describeBytes(new TextEncoder().encode('  <!doctype html><p>no'))))
check('a Git LFS pointer is named', /Git LFS/.test(describeBytes(new TextEncoder().encode('version https://git-lfs.github.com/spec/v1\n'))))

const body = (content: BodyInit, status = 200) => Promise.resolve(new Response(content, { status }))

async function run() {
  const good = taskModelBytes()
  const urls: string[] = []
  const fakeFetch = (url: string) => {
    urls.push(url)
    if (url === '/mediapipe/hand_landmarker.task') return body('<html>404 Not Found</html>', 404)
    if (url === 'https://cdn.example/model.task') return body(new TextEncoder().encode('<!doctype html><p>Blocked by policy'))
    return body(good)
  }
  const model = await loadTaskModel(['/mediapipe/hand_landmarker.task', 'https://cdn.example/model.task', 'https://ok.example/model.task'], fakeFetch)
  check('the first valid candidate wins', model.url === 'https://ok.example/model.task' && model.bytes.length === good.length, model.url)
  check('all candidates are probed in order', urls.length === 3 && urls[2] === 'https://ok.example/model.task', JSON.stringify(urls))

  try {
    await loadTaskModel(['/mediapipe/hand_landmarker.task', 'https://cdn.example/model.task'], fakeFetch)
    check('an unusable set of URLs throws', false)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check('the error names every URL and the reason', /HTTP 404/.test(msg) && /web page/.test(msg), msg)
    check('the error says how to fix it', /public\/mediapipe\/hand_landmarker\.task/.test(msg) && /fetch_model/.test(msg), msg)
  }

  // WASM runtime probing: a dev server answers a missing file with index.html, which would make
  // FilesetResolver fail much later with an unhelpful error.
  const wasmFetch = (url: string) => {
    if (url.startsWith('https://cdn.example')) return body('<html><body>404</body></html>')
    if (url.startsWith('/mediapipe/wasm')) return body('var Module = {};', 200)
    return body('', 404)
  }
  const base = await pickWasmBase(['https://cdn.example/wasm', '/mediapipe/wasm', 'https://missing.example/wasm'], wasmFetch)
  check('the first usable WASM base wins', base === '/mediapipe/wasm', base)

  try {
    await pickWasmBase(['https://cdn.example/wasm'], wasmFetch)
    check('a web page is not accepted as the WASM runtime', false)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check('the WASM error names the base and the reason', /cdn\.example\/wasm/.test(msg) && /web page/.test(msg), msg)
  }

  console.log(failures === 0 ? 'All model-asset checks passed' : `${failures} model-asset check(s) failed`)
  if (failures) process.exit(1)
}

void run()
