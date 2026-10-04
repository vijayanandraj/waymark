import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Roadmap } from '../lib/types'
import { useToast } from '../components/Toast'
import { coerceDoc } from '../builder/Builder'

export default function MyRoadmaps() {
  const [list, setList] = useState<Roadmap[] | null>(null)
  const [params, setParams] = useSearchParams()
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(params.get('new') === '1')
  const nav = useNavigate()
  const toast = useToast()
  const fileIn = useRef<HTMLInputElement>(null)

  useEffect(() => { api.myRoadmaps().then(setList).catch(() => setList([])) }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const r = await api.createRoadmap(title.trim())
    nav(`/edit/${r.id}`)
  }

  return (
    <div className="page">
      <div className="pagehead">
        <h1>My roadmaps</h1>
        <span className="spacer" />
        <input ref={fileIn} type="file" accept="application/json,.json" hidden onChange={e => {
          const f = e.target.files?.[0]; if (!f) return
          const r = new FileReader()
          r.onload = async () => {
            try {
              const rm = await api.importRoadmap(coerceDoc(JSON.parse(String(r.result))))
              toast('Imported.'); nav(`/edit/${rm.id}`)
            } catch (x) { toast('Import failed: ' + (x as Error).message) }
          }
          r.readAsText(f); e.target.value = ''
        }} />
        <button className="ghost" onClick={() => fileIn.current?.click()} title="A .roadmap.json from the single-file builder, screenshots included">Import JSON</button>
        <button onClick={() => { setCreating(true); setParams(p => { p.set('new', '1'); return p }) }}>New roadmap</button>
      </div>
      {creating && (
        <form className="newbox" onSubmit={create}>
          <input autoFocus placeholder="Title, e.g. Class 9 CBSE Maths" value={title} onChange={e => setTitle(e.target.value)} />
          <button>Create</button>
          <button type="button" className="ghost" onClick={() => { setCreating(false); setParams(p => { p.delete('new'); return p }) }}>Cancel</button>
        </form>
      )}
      {list === null ? <p className="hint">Loading…</p> : list.length === 0 ? (
        <p className="hint">Nothing yet. Create a roadmap, or import a JSON file from the offline builder.</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Title</th><th>Status</th><th>Items</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.id}>
                <td><Link to={`/edit/${r.id}`}>{r.title}</Link>{r.reviewNote && r.status === 'draft' && <div className="note">Reviewer: {r.reviewNote}</div>}</td>
                <td><span className={'chip st-' + r.status}>{r.status}</span></td>
                <td>{r.nodeCount}</td>
                <td>{new Date(r.updatedAt).toLocaleString()}</td>
                <td className="actions">
                  <Link className="btn ghost" to={`/edit/${r.id}`}>Edit</Link>
                  {r.status === 'published' && <Link className="btn ghost" to={`/r/${r.slug}`}>View</Link>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
