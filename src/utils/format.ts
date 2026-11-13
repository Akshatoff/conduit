export const pct = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)
export const ms = (v: number | null | undefined) => (v == null ? '—' : v < 10 ? `${v.toFixed(2)} ms` : `${v.toFixed(0)} ms`)
export const num = (v: number | null | undefined) => (v == null ? '—' : String(v))

export function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour12: false })
}

export function ago(tSeconds: number | null | undefined): string {
  if (!tSeconds) return '—'
  const d = Date.now() / 1000 - tSeconds
  if (d < 2) return 'just now'
  if (d < 60) return `${Math.floor(d)} s ago`
  if (d < 3600) return `${Math.floor(d / 60)} min ago`
  return new Date(tSeconds * 1000).toLocaleTimeString()
}

export function download(filename: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
