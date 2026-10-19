import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadCatalog } from '../lib/content'
import { readProgress } from '../lib/progress'
import type { CatalogEntry } from '../lib/types'

const LEVEL_LABEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all: 'All levels' }

function matches(r: CatalogEntry, q: string): boolean {
  if (!q) return true
  const hay = [r.title, r.subtitle, r.audience, ...r.tags, ...r.authors.map(a => a.name)].join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w))
}

export default function Home() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const tag = params.get('tag') || ''
  const level = params.get('level') || ''
  const [all, setAll] = useState<CatalogEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => { loadCatalog().then(setAll).catch(() => setFailed(true)) }, [])

  const set = (k: string, v: string) => setParams(p => { if (v) p.set(k, v); else p.delete(k); return p }, { replace: true })

  const list = useMemo(() => (all || []).filter(r =>
    matches(r, q) && (!tag || r.tags.includes(tag)) && (!level || r.level === level)), [all, q, tag, level])

  const tags = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of all || []) for (const t of r.tags) c[t] = (c[t] || 0) + 1
    return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 24)
  }, [all])

  return (
    <div className="page">
      <div className="hero">
        <h1>Learning roadmaps, built by people who walked them</h1>
        <p>Pick a roadmap, click any step for what to learn and the free resources to learn it from, and tick things off as you go. No account needed.</p>
        <div className="searchrow">
          <input type="search" placeholder="Search roadmaps, subjects, audiences" aria-label="Search roadmaps" value={q} onChange={e => set('q', e.target.value)} />
          <select aria-label="Level" value={level} onChange={e => set('level', e.target.value)}>
            <option value="">Any level</option>
            {Object.entries(LEVEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {tags.length > 0 && (
          <div className="tagrow">
            {tag && <button className="chip on" onClick={() => set('tag', '')}>{tag} ×</button>}
            {tags.filter(([t]) => t !== tag).map(([t, n]) => (
              <button className="chip" key={t} onClick={() => set('tag', t)}>{t} <span>{n}</span></button>
            ))}
          </div>
        )}
      </div>
      {failed ? <p className="hint">Could not load the roadmap list. Check your connection and reload.</p>
        : all === null ? <p className="hint">Loading…</p>
        : list.length === 0 ? <p className="hint">Nothing matches. <Link to="/about">Write the roadmap you were looking for</Link>.</p>
        : (
          <div className="cards">
            {list.map(r => {
              const done = Object.values(readProgress(r.slug)).filter(s => s === 'done').length
              return (
                <Link className="card" key={r.slug} to={`/r/${r.slug}/`}>
                  <h3>{r.title}</h3>
                  <p className="aud">For {r.audience.charAt(0).toLowerCase() + r.audience.slice(1)}</p>
                  {r.subtitle && <p>{r.subtitle}</p>}
                  <div className="meta">
                    {r.level && <span>{LEVEL_LABEL[r.level]}</span>}
                    <span>{r.milestones} milestones · {r.nodeCount} steps</span>
                    {r.updated && <span>updated {r.updated}</span>}
                  </div>
                  {done > 0 && <div className="mine"><i style={{ width: `${Math.min(100, (done / r.nodeCount) * 100)}%` }} /><span>{done} done</span></div>}
                  <div className="tags">{r.tags.map(t => <span key={t}>{t}</span>)}</div>
                </Link>
              )
            })}
          </div>
        )}
    </div>
  )
}
