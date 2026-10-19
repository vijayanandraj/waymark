import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { NodeType, RNode, Roadmap, RoadmapDoc, Side } from '../lib/types'
import { MAX_DEPTH } from '../lib/types'
import { api, ApiError } from '../lib/api'
import { genId } from '../lib/layout'
import { useToast } from '../components/Toast'
import { useAuth } from '../components/AuthContext'
import RoadmapView from '../viewer/RoadmapView'
import MdEditor from './MdEditor'
import { processAndUpload } from './images'
import { SAMPLE } from './sample'
import './builder.css'

interface Found { node: RNode; depth: number; parent: RNode[]; index: number; parentNode: RNode | null }

function findNode(topics: RNode[], id: string): Found | null {
  let res: Found | null = null
  const walk = (arr: RNode[], depth: number, parentNode: RNode | null): boolean => {
    for (let i = 0; i < arr.length; i++) {
      const n = arr[i]
      if (n.id === id) { res = { node: n, depth, parent: arr, index: i, parentNode }; return true }
      if (n.children?.length && walk(n.children, depth + 1, n)) return true
    }
    return false
  }
  walk(topics, 0, null)
  return res
}

function newNode(label: string, depth: number): RNode {
  const n: RNode = { id: genId(), label, desc: '', links: [], children: [] }
  if (depth >= 1) { n.type = 'core'; if (depth === 1) n.side = 'auto' }
  return n
}

export default function Builder({ roadmap: initial }: { roadmap: Roadmap }) {
  const toast = useToast()
  const nav = useNavigate()
  const { user, settings } = useAuth()
  const [rm, setRm] = useState<Roadmap>(initial)
  const [doc, setDoc] = useState<RoadmapDoc>(() => ({
    title: initial.title, subtitle: initial.subtitle, topics: [], changelog: [], ...(initial.content || {}),
  }))
  const [tags, setTags] = useState(initial.tags.join(', '))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [modal, setModal] = useState<null | 'json' | 'changelog' | 'history' | 'delete'>(null)
  const [busy, setBusy] = useState(false)
  const docRef = useRef(doc)
  docRef.current = doc

  /** Mutate a deep copy of the document and commit it. */
  const update = useCallback((fn: (d: RoadmapDoc) => void) => {
    setDoc(prev => { const next = structuredClone(prev); fn(next); return next })
    setDirty(true)
  }, [])

  const save = useCallback(async (autosave: boolean, note = '') => {
    const d = docRef.current
    setSaving('saving')
    try {
      const updated = await api.updateRoadmap(rm.id, {
        title: d.title, subtitle: d.subtitle, content: d, note, autosave,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      })
      setRm(updated)
      // The server may have replaced ids / normalised types; adopt its copy
      // only if the user has not typed in the meantime.
      if (docRef.current === d && updated.content) setDoc(updated.content)
      setDirty(false)
      setSaving('saved')
      if (!autosave) toast('Saved.')
    } catch (e) {
      setSaving('error')
      toast('Save failed: ' + (e as Error).message)
    }
  }, [rm.id, tags, toast])

  // Autosave 1.5 s after the last change.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => save(true), 1500)
    return () => clearTimeout(t)
  }, [doc, tags, dirty, save])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(false) }
    }
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault() } }
    document.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onUnload) }
  }, [save, dirty])

  // Paste a screenshot from the clipboard onto the selected node.
  const addImages = useCallback(async (nodeId: string, blobs: Blob[]) => {
    const imgs = blobs.filter(b => b.type.startsWith('image/'))
    if (!imgs.length) return
    setBusy(true)
    let n = 0
    for (const b of imgs) {
      try {
        const url = await processAndUpload(b)
        update(d => { const f = findNode(d.topics, nodeId); if (f) { f.node.images = f.node.images || []; f.node.images.push({ src: url, caption: '' }) } })
        n++
      } catch (e) { toast('Upload failed: ' + (e as Error).message) }
    }
    setBusy(false)
    if (n) toast(n === 1 ? 'Screenshot added.' : `${n} screenshots added.`)
  }, [update, toast])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (modal) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (!selectedId) return
      const blobs: Blob[] = []
      for (const it of Array.from(e.clipboardData?.items || [])) if (it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) blobs.push(f) }
      if (blobs.length) { e.preventDefault(); addImages(selectedId, blobs) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [selectedId, modal, addImages])

  const found = useMemo(() => selectedId ? findNode(doc.topics, selectedId) : null, [doc, selectedId])

  const transition = async (fn: () => Promise<Roadmap>, msg: string) => {
    if (dirty) await save(false)
    try { setRm(await fn()); toast(msg) } catch (e) { toast((e as Error).message) }
  }

  const canPublishDirectly = user?.role === 'admin' || !settings?.requireReview

  return (
    <div className="bld">
      <div className="bld-top">
        <input className="bld-title" placeholder="Roadmap title" value={doc.title} onChange={e => update(d => { d.title = e.target.value })} />
        <input className="bld-sub" placeholder="One-line subtitle (optional)" value={doc.subtitle} onChange={e => update(d => { d.subtitle = e.target.value })} />
        <input className="bld-tags" placeholder="tags, comma separated" value={tags} onChange={e => { setTags(e.target.value); setDirty(true) }} title="Tags help people find this roadmap" />
        <span className="spacer" />
        <span className={'bld-status st-' + rm.status} title={rm.reviewNote ? 'Reviewer note: ' + rm.reviewNote : undefined}>
          {rm.status}{rm.reviewNote ? ' (see note)' : ''}
        </span>
        <span className="bld-save">{saving === 'saving' ? 'saving…' : saving === 'error' ? 'save failed' : dirty ? 'unsaved' : 'saved'}</span>
        <button onClick={() => save(false)} title="Ctrl+S">Save</button>
        {rm.status !== 'published' && (
          <button onClick={() => transition(() => api.submit(rm.id), canPublishDirectly ? 'Published.' : 'Submitted for review.')}
            disabled={rm.status === 'review'}>
            {canPublishDirectly ? 'Publish' : rm.status === 'review' ? 'In review' : 'Submit for review'}
          </button>
        )}
        {rm.status === 'published' && <>
          <a className="btn" href={`/r/${rm.slug}`} target="_blank" rel="noopener">View live</a>
          <button className="ghost" onClick={() => transition(() => api.unpublish(rm.id), 'Unpublished; now a draft.')}>Unpublish</button>
        </>}
        <details className="bld-more">
          <summary>More</summary>
          <div className="bld-menu" onClick={e => { (e.currentTarget.parentElement as HTMLDetailsElement).open = false }}>
            <button className="ghost" onClick={() => setModal('changelog')}>Changelog</button>
            <button className="ghost" onClick={() => setModal('json')}>Edit JSON</button>
            <button className="ghost" onClick={() => setModal('history')}>History</button>
            <a className="btn ghost" href={api.exportUrl(rm.slug, false)} download>Download JSON</a>
            <a className="btn ghost" href={api.exportUrl(rm.slug, true)} download title="Screenshots embedded, for the offline single-file builder">Download JSON (inline images)</a>
            <ImportButton onImport={d => { update(x => { Object.assign(x, { topics: d.topics, changelog: d.changelog || [] }); if (d.title) x.title = d.title; if (d.subtitle) x.subtitle = d.subtitle }); setSelectedId(null); toast('Imported. Inline screenshots are uploaded on save.') }} />
            {!doc.topics.length && <button className="ghost" onClick={() => { update(d => { Object.assign(d, structuredClone(SAMPLE), { title: d.title || SAMPLE.title }) }); toast('Sample loaded.') }}>Load sample</button>}
            <button className="danger" onClick={() => setModal('delete')}>Delete roadmap</button>
          </div>
        </details>
      </div>

      {rm.reviewNote && rm.status === 'draft' && <div className="bld-note">Reviewer note: {rm.reviewNote}</div>}

      <div className="bld-app">
        <div className="bld-editor">
          <div className="bld-outline">
            {!doc.topics.length && <div className="hint">No topics yet. A topic is a milestone on the central spine; subtopics branch off it, up to {MAX_DEPTH} levels deep. Or load the sample from the More menu.</div>}
            {doc.topics.map((t, ti) => (
              <div className="o-topic" key={t.id}>
                <OutlineRow n={t} depth={0} idx={ti} selectedId={selectedId} onSelect={setSelectedId} update={update} setSelectedId={setSelectedId} />
                <div className="o-kids">
                  <Kids arr={t.children || []} depth={1} selectedId={selectedId} onSelect={setSelectedId} update={update} setSelectedId={setSelectedId} />
                  <button className="addbtn" onClick={() => { const n = newNode('New subtopic', 1); update(d => { d.topics[ti].children.push(n) }); setSelectedId(n.id) }}>+ subtopic</button>
                </div>
              </div>
            ))}
            <button className="addbtn" onClick={() => { const n = newNode('New topic', 0); update(d => { d.topics.push(n) }); setSelectedId(n.id) }}>+ topic</button>
          </div>
          <div className="bld-inspector">
            {found ? <Inspector f={found} update={update} onAddImages={blobs => addImages(found.node.id, blobs)} busy={busy} />
              : <div className="hint">Select a topic or subtopic to edit it. With a node selected you can paste a screenshot straight from the clipboard.</div>}
          </div>
        </div>
        <div className="bld-preview">
          {doc.topics.length || doc.title
            ? <RoadmapView doc={doc} mode="preview" onSelect={setSelectedId} selectedId={selectedId} />
            : <div className="hint" style={{ textAlign: 'center', marginTop: 60 }}>Preview appears here. Start adding topics, or load the sample.</div>}
        </div>
      </div>

      {modal === 'json' && <JsonModal doc={doc} onClose={() => setModal(null)} onApply={d => { setDoc(d); setDirty(true); setSelectedId(null); setModal(null); toast('Applied.') }} />}
      {modal === 'changelog' && <ChangelogModal doc={doc} onClose={() => setModal(null)} onApply={entries => { update(d => { d.changelog = entries; d.updated = new Date().toISOString().slice(0, 10) }); setModal(null) }} />}
      {modal === 'history' && <HistoryModal rm={rm} onClose={() => setModal(null)} onRestore={d => { setDoc(d); setDirty(true); setModal(null); toast('Restored into the editor. Save to keep it.') }} />}
      {modal === 'delete' && (
        <Modal onClose={() => setModal(null)}>
          <h3>Delete this roadmap?</h3>
          <p className="prose">This removes “{rm.title}” and its history for everyone. There is no undo.</p>
          <div className="row"><button className="ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="danger" onClick={async () => { await api.deleteRoadmap(rm.id); toast('Deleted.'); nav('/me') }}>Delete</button></div>
        </Modal>
      )}
    </div>
  )
}

/* ---------- outline ---------- */

type Update = (fn: (d: RoadmapDoc) => void) => void

function Kids({ arr, depth, selectedId, onSelect, update, setSelectedId }: {
  arr: RNode[]; depth: number; selectedId: string | null; onSelect: (id: string) => void; update: Update; setSelectedId: (id: string | null) => void
}) {
  return (
    <>
      {arr.map((k, ki) => (
        <div key={k.id}>
          <OutlineRow n={k} depth={depth} idx={ki} selectedId={selectedId} onSelect={onSelect} update={update} setSelectedId={setSelectedId} />
          {(k.children || []).length > 0 && (
            <div className="o-kids"><Kids arr={k.children} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} update={update} setSelectedId={setSelectedId} /></div>
          )}
        </div>
      ))}
    </>
  )
}

function OutlineRow({ n, depth, idx, selectedId, onSelect, update, setSelectedId }: {
  n: RNode; depth: number; idx: number; selectedId: string | null; onSelect: (id: string) => void; update: Update; setSelectedId: (id: string | null) => void
}) {
  // All structural edits locate the sibling array again inside the fresh copy.
  const siblings = (d: RoadmapDoc): RNode[] | null => {
    if (depth === 0) return d.topics
    const f = findNode(d.topics, n.id)
    return f ? f.parent : null
  }
  const move = (delta: number) => update(d => {
    const s = siblings(d); if (!s) return
    const j = idx + delta; if (j < 0 || j >= s.length) return
    ;[s[idx], s[j]] = [s[j], s[idx]]
  })
  return (
    <div className={'o-row ' + (depth === 0 ? 'topic' : 'child') + (n.id === selectedId ? ' sel' : '')}>
      <span className="lbl" onClick={() => onSelect(n.id)}>{n.label || 'Untitled'}</span>
      {depth >= 1 && <span className="tag">{n.type || 'core'}</span>}
      {depth >= 1 && depth < MAX_DEPTH && (
        <button className="mini" title={`Add item under this (level ${depth + 1})`} onClick={() => {
          const g = newNode('New item', depth + 1)
          update(d => { const f = findNode(d.topics, n.id); if (f) { f.node.children = f.node.children || []; f.node.children.push(g) } })
          setSelectedId(g.id)
        }}>+</button>
      )}
      <button className="mini" title="Move up" onClick={() => move(-1)}>&uarr;</button>
      <button className="mini" title="Move down" onClick={() => move(1)}>&darr;</button>
      <button className="mini" title="Delete (and everything under it)" onClick={() => {
        update(d => { const s = siblings(d); if (s) s.splice(idx, 1) })
        if (selectedId === n.id) setSelectedId(null)
      }}>&times;</button>
    </div>
  )
}

/* ---------- inspector ---------- */

function Inspector({ f, update, onAddImages, busy }: { f: Found; update: Update; onAddImages: (b: Blob[]) => void; busy: boolean }) {
  const n = f.node
  const id = n.id
  const set = (fn: (node: RNode) => void) => update(d => { const x = findNode(d.topics, id); if (x) fn(x.node) })
  const fileIn = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div className="ins-kind">{f.depth === 0 ? 'milestone topic' : `level ${f.depth} · under ${f.parentNode?.label || 'Untitled'}`}</div>
      <label className="f">Label</label>
      <input type="text" value={n.label} onChange={e => set(x => { x.label = e.target.value })} />
      {f.depth >= 1 && <>
        <label className="f">Type</label>
        <select value={n.type || 'core'} onChange={e => set(x => { x.type = e.target.value as NodeType })}>
          <option value="core">Core</option><option value="alt">Alternative</option><option value="optional">Optional</option>
        </select>
      </>}
      {f.depth === 1 && <>
        <label className="f">Side of spine</label>
        <select value={n.side || 'auto'} onChange={e => set(x => { x.side = e.target.value as Side })}>
          <option value="auto">Auto</option><option value="left">Left</option><option value="right">Right</option>
        </select>
      </>}
      <label className="f">Description</label>
      <MdEditor key={id} value={n.desc || ''} placeholder="Shown in the detail panel when a reader clicks this node." onChange={v => set(x => { x.desc = v })} />

      <label className="f">Screenshots</label>
      {(n.images || []).map((im, i) => (
        <div className="imgrow" key={im.src + i}>
          <img src={im.src} alt="" title="Preview" onClick={() => window.open(im.src, '_blank')} />
          <input type="text" placeholder="Caption (optional)" value={im.caption || ''} onChange={e => set(x => { x.images![i].caption = e.target.value })} />
          <button className="mini" title="Remove" onClick={() => set(x => { x.images!.splice(i, 1) })}>&times;</button>
        </div>
      ))}
      <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={e => { onAddImages(Array.from(e.target.files || [])); e.target.value = '' }} />
      <button className="addbtn" disabled={busy} onClick={() => fileIn.current?.click()}>{busy ? 'uploading…' : '+ screenshot'}</button>
      <div className="imghint">Tip: with this node selected, paste a screenshot straight from the clipboard. Large images are resized before upload.</div>

      <label className="f">Common issues</label>
      {(n.faq || []).map((q, i) => (
        <div className="faqbox" key={i}>
          <div className="faqtop">
            <input type="text" placeholder="Issue / question" value={q.q} onChange={e => set(x => { x.faq![i].q = e.target.value })} />
            <button className="mini" title="Remove" onClick={() => set(x => { x.faq!.splice(i, 1) })}>&times;</button>
          </div>
          <MdEditor key={id + ':' + i} value={q.a} minHeight={48} placeholder="Resolution. Use the code-block button for runnable commands." onChange={v => set(x => { x.faq![i].a = v })} />
        </div>
      ))}
      <button className="addbtn" onClick={() => set(x => { x.faq = x.faq || []; x.faq.push({ q: '', a: '' }) })}>+ issue</button>

      <label className="f">Resource links</label>
      {(n.links || []).map((l, i) => (
        <div className="linkrow" key={i}>
          <input type="text" placeholder="Label" value={l.label} onChange={e => set(x => { x.links[i].label = e.target.value })} />
          <input type="text" placeholder="https://..." value={l.url} onChange={e => set(x => { x.links[i].url = e.target.value })} />
          <button className="mini" onClick={() => set(x => { x.links.splice(i, 1) })}>&times;</button>
        </div>
      ))}
      <button className="addbtn" onClick={() => set(x => { x.links.push({ label: '', url: '' }) })}>+ link</button>
    </div>
  )
}

/* ---------- modals ---------- */

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box">{children}</div>
    </div>
  )
}

function JsonModal({ doc, onClose, onApply }: { doc: RoadmapDoc; onClose: () => void; onApply: (d: RoadmapDoc) => void }) {
  const [text, setText] = useState(() => JSON.stringify(doc, null, 2))
  const toast = useToast()
  return (
    <Modal onClose={onClose}>
      <h3>Edit roadmap JSON</h3>
      <textarea value={text} spellCheck={false} onChange={e => setText(e.target.value)} />
      <div className="row"><button className="ghost" onClick={onClose}>Cancel</button>
        <button onClick={() => { try { onApply(coerceDoc(JSON.parse(text))) } catch (e) { toast('Invalid JSON: ' + (e as Error).message) } }}>Apply</button></div>
    </Modal>
  )
}

function ChangelogModal({ doc, onClose, onApply }: { doc: RoadmapDoc; onClose: () => void; onApply: (e: { date: string; text: string }[]) => void }) {
  const [text, setText] = useState(() => (doc.changelog || []).map(e => `${e.date}: ${e.text}`).join('\n'))
  return (
    <Modal onClose={onClose}>
      <h3>Changelog</h3>
      <p className="prose">One entry per line, newest first: <code>2026-09-17: Added the recursion section</code>. Readers see these under the “Updated” chip.</p>
      <textarea value={text} spellCheck={false} placeholder="2026-09-17: Initial release" onChange={e => setText(e.target.value)} />
      <div className="row"><button className="ghost" onClick={onClose}>Cancel</button>
        <button onClick={() => onApply(text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const m = l.match(/^(\S+)\s*:\s*(.+)$/)
          return m ? { date: m[1], text: m[2] } : { date: '', text: l }
        }))}>Apply</button></div>
    </Modal>
  )
}

function HistoryModal({ rm, onClose, onRestore }: { rm: Roadmap; onClose: () => void; onRestore: (d: RoadmapDoc) => void }) {
  const [revs, setRevs] = useState<{ n: number; note: string; createdAt: string }[] | null>(null)
  useEffect(() => { api.revisions(rm.id).then(setRevs).catch(() => setRevs([])) }, [rm.id])
  return (
    <Modal onClose={onClose}>
      <h3>History</h3>
      <p className="prose">A revision is recorded each time you press Save (autosaves are not). Restoring loads that version into the editor.</p>
      <div className="hist">
        {revs === null ? 'Loading…' : revs.length === 0 ? 'No saved revisions yet.' : revs.map(r => (
          <div className="hist-row" key={r.n}>
            <span className="mono">#{r.n}</span><span className="mono dim">{new Date(r.createdAt).toLocaleString()}</span>
            <span className="grow">{r.note}</span>
            <button className="ghost" onClick={async () => { const full = await api.revision(rm.id, r.n); onRestore(coerceDoc(full.content)) }}>Restore</button>
          </div>
        ))}
      </div>
      <div className="row"><button onClick={onClose}>Close</button></div>
    </Modal>
  )
}

function ImportButton({ onImport }: { onImport: (d: RoadmapDoc) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const toast = useToast()
  return (
    <>
      <input ref={ref} type="file" accept="application/json,.json" hidden onChange={e => {
        const f = e.target.files?.[0]; if (!f) return
        const r = new FileReader()
        r.onload = () => { try { onImport(coerceDoc(JSON.parse(String(r.result)))) } catch { toast('Could not parse that JSON file.') } }
        r.readAsText(f); e.target.value = ''
      }} />
      <button className="ghost" onClick={() => ref.current?.click()}>Import JSON</button>
    </>
  )
}

/** Accept anything shaped like the builder format and fill in the blanks. */
export function coerceDoc(s: unknown): RoadmapDoc {
  const o = (s && typeof s === 'object' ? s : {}) as Partial<RoadmapDoc>
  const fill = (arr: RNode[] | undefined): RNode[] => (Array.isArray(arr) ? arr : []).map(n => ({
    ...n, id: n.id || genId(), label: n.label || '', links: Array.isArray(n.links) ? n.links : [], children: fill(n.children),
  }))
  return { title: o.title || '', subtitle: o.subtitle || '', updated: o.updated, changelog: Array.isArray(o.changelog) ? o.changelog : [], topics: fill(o.topics) }
}

export { ApiError }
