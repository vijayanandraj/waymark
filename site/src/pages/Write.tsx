import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { loadCatalog } from '../lib/content'
import type { CatalogEntry } from '../lib/types'
import { useToast } from '../components/Toast'
import Editor, { ImportButton } from '../write/Editor'
import { type Draft, getDraft, getImages, listDrafts, requestPersistence } from '../write/store'
import { createBlank, createFromJson, createFromPublished } from '../write/drafts'

/** /write: this browser's drafts, and ways to start a new one. */
export function Drafts() {
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const from = params.get('from')
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [pick, setPick] = useState('')
  const [failed, setFailed] = useState(false)
  const [working, setWorking] = useState(false)
  const opened = useRef(false)

  useEffect(() => {
    listDrafts().then(setDrafts).catch(() => setFailed(true))
    loadCatalog().then(setCatalog).catch(() => {})
  }, [])

  const start = async (make: () => Promise<Draft>) => {
    setWorking(true)
    try {
      requestPersistence()
      const d = await make()
      nav(`/write/${d.id}`, { replace: !!from })
    } catch (e) {
      toast('Could not start the draft: ' + (e as Error).message)
      setWorking(false)
    }
  }

  // "Suggest changes" on a roadmap lands here with ?from=<slug>: reopen this
  // browser's draft of it if there is one, otherwise start one.
  useEffect(() => {
    if (!from || drafts === null || opened.current) return
    opened.current = true // once, even when React runs effects twice in development
    const existing = drafts.find(d => d.base?.slug === from)
    if (existing) nav(`/write/${existing.id}`, { replace: true })
    else start(() => createFromPublished(from))
  }, [from, drafts])

  if (failed) return (
    <div className="page prose">
      <h1>Write a roadmap</h1>
      <p>This browser is not letting the site store drafts. Private or incognito windows often block it; try a normal window.</p>
    </div>
  )
  if (from || working) return <p className="hint page">Opening the editor…</p>

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Write a roadmap</h1>
      </div>
      <p className="lede">
        No account needed to write. Drafts are saved in this browser as you type, and nothing is sent anywhere until you submit.
        A reviewer checks every submission before it is published.
      </p>

      <div className="startrow">
        <button disabled={working} onClick={() => start(createBlank)}>New roadmap</button>
        <span className="or">or improve a published one:</span>
        <select aria-label="Published roadmap" value={pick} onChange={e => setPick(e.target.value)}>
          <option value="">Choose a roadmap…</option>
          {catalog.map(r => <option key={r.slug} value={r.slug}>{r.title}</option>)}
        </select>
        <button className="ghost" disabled={!pick || working} onClick={() => {
          const existing = drafts?.find(d => d.base?.slug === pick)
          if (existing) nav(`/write/${existing.id}`)
          else start(() => createFromPublished(pick))
        }}>Edit</button>
        <span className="or">or</span>
        <ImportButton label="Import a JSON file" onText={text => start(() => createFromJson(text))} />
      </div>

      <h2>Your drafts in this browser</h2>
      {drafts === null ? <p className="hint">Loading…</p> : drafts.length === 0 ? (
        <p className="hint">None yet.</p>
      ) : (
        <div className="cards">
          {drafts.map(d => (
            <Link className="card" key={d.id} to={`/write/${d.id}`}>
              <h3>{d.doc.title || 'Untitled roadmap'}</h3>
              {d.meta.audience && <p className="aud">For {d.meta.audience.charAt(0).toLowerCase() + d.meta.audience.slice(1)}</p>}
              <div className="meta">
                <span>{d.base ? `edit of /r/${d.base.slug}` : 'new roadmap'}</span>
                <span>edited {new Date(d.updatedAt).toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <p className="hint">
        Drafts live only in this browser. Clearing site data removes them; use <b>More → Download package</b> in the editor
        to keep a copy, or to carry a draft to another computer (import the JSON there).
      </p>
    </div>
  )
}

/** /write/:id: the editor for one draft. */
export function EditDraft() {
  const { id = '' } = useParams()
  const [state, setState] = useState<{ draft: Draft; images: Map<string, Blob> } | null | undefined>(undefined)
  useEffect(() => {
    setState(undefined)
    Promise.all([getDraft(id), getImages(id)])
      .then(([draft, images]) => setState(draft ? { draft, images } : null))
      .catch(() => setState(null))
  }, [id])
  if (state === undefined) return <p className="hint page">Loading…</p>
  if (state === null) return <div className="page"><h2>Draft not found</h2><p>It may have been deleted, or written in another browser. <Link to="/write">Your drafts</Link>.</p></div>
  return <Editor key={id} initial={state.draft} initialImages={state.images} />
}
