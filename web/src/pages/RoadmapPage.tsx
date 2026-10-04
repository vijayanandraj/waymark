import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Progress, Roadmap, Status } from '../lib/types'
import RoadmapView from '../viewer/RoadmapView'
import { useAuth } from '../components/AuthContext'

/**
 * Reader page. Progress lives on the server for signed-in users and in this
 * browser's localStorage otherwise; signing in later merges the local copy.
 */
export default function RoadmapPage() {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const [rm, setRm] = useState<Roadmap | null | undefined>(undefined)
  const [progress, setProgress] = useState<Progress>({})
  const localKey = 'rmv1:' + slug

  const readLocal = useCallback((): Progress => {
    try { return JSON.parse(localStorage.getItem(localKey) || '{}') } catch { return {} }
  }, [localKey])

  useEffect(() => {
    let live = true
    setRm(undefined)
    api.roadmapBySlug(slug).then(async r => {
      if (!live) return
      let p = readLocal()
      if (user) {
        const remote = await api.progress(r.id).catch(() => ({} as Progress))
        const merged = { ...p, ...remote }
        if (Object.keys(p).length && JSON.stringify(merged) !== JSON.stringify(remote)) {
          await api.setProgress(r.id, merged).catch(() => {})
          try { localStorage.removeItem(localKey) } catch { /* ignore */ }
        }
        p = merged
      }
      // Set progress before the roadmap so a fast first click is never
      // overwritten by the initial load.
      if (live) { setProgress(p); setRm(r) }
    }).catch(() => { if (live) setRm(null) })
    return () => { live = false }
  }, [slug, user, readLocal, localKey])

  const onProgress = (id: string, st: Status) => {
    setProgress(prev => {
      const next = { ...prev }
      if (st) next[id] = st; else delete next[id]
      if (user && rm) {
        // Saved straight away (it is a tiny map) so navigating off the page
        // right after a click cannot lose it.
        api.setProgress(rm.id, next).catch(() => {})
      } else {
        try { localStorage.setItem(localKey, JSON.stringify(next)) } catch { /* ignore */ }
      }
      return next
    })
  }

  if (rm === undefined) return <p className="hint page">Loading…</p>
  if (rm === null || !rm.content) return <div className="page"><h2>Not found</h2><p>This roadmap does not exist or is not published. <Link to="/">Browse roadmaps</Link>.</p></div>

  const canEdit = user && (user.id === rm.ownerId || user.role === 'admin')
  return (
    <div className="reader">
      <div className="reader-bar">
        <Link to="/">← All roadmaps</Link>
        <span className="spacer" />
        {rm.status !== 'published' && <span className="chip on">{rm.status} preview</span>}
        {!user && <span className="hint-inline">Progress is saved in this browser. <Link to="/login">Sign in</Link> to keep it across devices.</span>}
        <a className="ghost btn" href={api.exportUrl(rm.slug, false)} download>JSON</a>
        {canEdit && <Link className="btn" to={`/edit/${rm.id}`}>Edit</Link>}
      </div>
      <RoadmapView doc={rm.content} mode="reader" progress={progress} onProgress={onProgress} />
    </div>
  )
}
