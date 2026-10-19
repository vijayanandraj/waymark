import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Roadmap } from '../lib/types'
import { useAuth } from '../components/AuthContext'

export default function Home() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const tag = params.get('tag') || ''
  const [list, setList] = useState<Roadmap[] | null>(null)
  const { settings, user } = useAuth()

  useEffect(() => {
    let live = true
    api.listRoadmaps(q, tag).then(l => { if (live) setList(l) }).catch(() => setList([]))
    return () => { live = false }
  }, [q, tag])

  const tags = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of list || []) for (const t of r.tags) c[t] = (c[t] || 0) + 1
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [list])

  return (
    <div className="page">
      {settings?.needsSetup && (
        <div className="callout">
          <strong>Fresh install.</strong> The first account created becomes the administrator. <Link to="/register">Create it now</Link>.
        </div>
      )}
      <div className="hero">
        <h1>Learning roadmaps, built by people who walked them</h1>
        <p>{settings?.tagline || 'Pick a roadmap, click any node for what to learn and where, and tick things off as you go.'}</p>
        <div className="searchrow">
          <input type="search" placeholder="Search roadmaps" value={q} onChange={e => setParams(p => { e.target.value ? p.set('q', e.target.value) : p.delete('q'); return p })} />
          {user && <Link className="btn" to="/me?new=1">Create a roadmap</Link>}
        </div>
        {tags.length > 0 && (
          <div className="tagrow">
            {tag && <button className="chip on" onClick={() => setParams(p => { p.delete('tag'); return p })}>{tag} ×</button>}
            {tags.filter(([t]) => t !== tag).map(([t, n]) => (
              <button className="chip" key={t} onClick={() => setParams(p => { p.set('tag', t); return p })}>{t} <span>{n}</span></button>
            ))}
          </div>
        )}
      </div>
      {list === null ? <p className="hint">Loading…</p> : list.length === 0 ? (
        <p className="hint">{q || tag ? 'Nothing matches.' : 'No published roadmaps yet.'}{user ? ' Be the first: create one from My roadmaps.' : ''}</p>
      ) : (
        <div className="cards">
          {list.map(r => (
            <Link className="card" key={r.id} to={`/r/${r.slug}`}>
              <h3>{r.title}</h3>
              {r.subtitle && <p>{r.subtitle}</p>}
              <div className="meta">
                <span>{r.nodeCount} items</span>
                {r.ownerName && <span>by {r.ownerName}</span>}
                <span>updated {new Date(r.updatedAt).toLocaleDateString()}</span>
              </div>
              {r.tags.length > 0 && <div className="tags">{r.tags.map(t => <span key={t}>{t}</span>)}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
