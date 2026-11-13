// Runs a bundled UI test inside jsdom.  Usage:
//   node tests_ts/jsdom-harness.cjs <bundle.cjs> [url]
// Needs (dev only, not part of the app):  npm i --no-save jsdom ws
const path = require('path')
const { JSDOM } = require('jsdom')
const bundle = path.resolve(process.argv[2])
const url = process.argv[3] || 'http://localhost/'
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url, pretendToBeVisual: true })
const w = dom.window
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
for (const k of ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'Node', 'Element', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'location', 'Event', 'CustomEvent', 'HTMLVideoElement', 'SVGElement', 'DocumentFragment', 'HTMLInputElement', 'HTMLSelectElement', 'KeyboardEvent', 'MouseEvent', 'PointerEvent']) {
  try { set(k, w[k]) } catch { /* ignore */ }
}
set('navigator', w.navigator)
set('WebSocket', require('ws'))
class RO { observe() {} disconnect() {} unobserve() {} }
set('ResizeObserver', RO)
w.ResizeObserver = RO
const ctx = new Proxy({}, { get: (_t, p) => (p === 'measureText' ? () => ({ width: 40 }) : typeof p === 'string' ? () => {} : undefined), set: () => true })
w.HTMLCanvasElement.prototype.getContext = () => ctx
w.HTMLMediaElement.prototype.play = () => Promise.resolve()
w.confirm = () => true
require(bundle)
