import type { Progress } from './types'

// Progress lives only in this browser (ADR 0001: learners have no accounts).
// The key matches the self-hosted app so the two can share an origin.
const key = (slug: string) => 'rmv1:' + slug

export function readProgress(slug: string): Progress {
  try { return JSON.parse(localStorage.getItem(key(slug)) || '{}') } catch { return {} }
}

export function writeProgress(slug: string, p: Progress) {
  try { localStorage.setItem(key(slug), JSON.stringify(p)) } catch { /* storage blocked or full */ }
}

/** Every roadmap's progress, for the export file. */
export function exportAll(): Record<string, Progress> {
  const out: Record<string, Progress> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('rmv1:')) out[k.slice(5)] = JSON.parse(localStorage.getItem(k) || '{}')
    }
  } catch { /* ignore */ }
  return out
}

/** Merges an export file into this browser; "done" wins over "in progress". */
export function importAll(data: unknown): number {
  if (!data || typeof data !== 'object') throw new Error('not a progress file')
  let n = 0
  for (const [slug, p] of Object.entries(data as Record<string, Progress>)) {
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !p || typeof p !== 'object') continue
    const cur = readProgress(slug)
    for (const [id, st] of Object.entries(p)) {
      if (st !== 'done' && st !== 'prog') continue
      if (cur[id] !== 'done') cur[id] = st
    }
    writeProgress(slug, cur)
    n++
  }
  return n
}
