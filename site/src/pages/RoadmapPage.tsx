import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { REPO_URL, issueUrl, loadRoadmap } from '../lib/content'
import { readProgress, writeProgress } from '../lib/progress'
import type { Progress, RoadmapFile, Status } from '../lib/types'
import RoadmapView from '../viewer/RoadmapView'

export default function RoadmapPage() {
  const { slug = '' } = useParams()
  const [rm, setRm] = useState<RoadmapFile | null | undefined>(undefined)
  const [progress, setProgress] = useState<Progress>({})

  useEffect(() => {
    let live = true
    setRm(undefined)
    loadRoadmap(slug).then(r => {
      if (!live) return
      // Progress first, so a fast first click is never overwritten by the load.
      setProgress(readProgress(slug))
      setRm(r)
      document.title = `${r.doc.title} · Waymark`
    }).catch(() => { if (live) setRm(null) })
    return () => { live = false }
  }, [slug])

  const onProgress = (id: string, st: Status) => {
    setProgress(prev => {
      const next = { ...prev }
      if (st) next[id] = st; else delete next[id]
      writeProgress(slug, next)
      return next
    })
  }

  if (rm === undefined) return <p className="hint page">Loading…</p>
  if (rm === null) return <div className="page"><h2>Not found</h2><p>There is no roadmap at this address. <Link to="/">Browse roadmaps</Link>.</p></div>

  const { meta, doc } = rm
  return (
    <div className="reader">
      <div className="reader-bar">
        <Link to="/">← All roadmaps</Link>
        <span className="who">
          by {meta.authors.map((a, i) => (
            <span key={i}>{i > 0 && ', '}{a.url ? <a href={a.url} target="_blank" rel="noopener">{a.name}</a> : a.name}</span>
          ))}
        </span>
        <span className="spacer" />
        <span className="hint-inline">Progress is saved in this browser.</span>
        <Link className="ghost btn" to={`/write?from=${encodeURIComponent(slug)}`} title="Open this roadmap in the editor and propose changes">Suggest changes</Link>
        <a className="ghost btn" href={issueUrl(slug, doc.title)} target="_blank" rel="noopener">Report a problem</a>
        <a className="ghost btn" href={`${REPO_URL}/tree/main/roadmaps/${slug}`} target="_blank" rel="noopener">Source</a>
      </div>
      <RoadmapView doc={doc} mode="reader" progress={progress} onProgress={onProgress} />
      <footer className="licence">
        For {meta.audience.charAt(0).toLowerCase() + meta.audience.slice(1)}. Content licensed{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a> by its authors:
        share and adapt it with attribution, under the same licence.
      </footer>
    </div>
  )
}
