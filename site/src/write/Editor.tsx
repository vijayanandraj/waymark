import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { NodeType, RNode, RoadmapDoc, Side } from '../lib/types'
import { LEVELS, MAX_DEPTH, slugify } from '../lib/rules.mjs'
import { genId } from '../lib/layout'
import { REPO_URL, loadCatalog } from '../lib/content'
import { useToast } from '../components/Toast'
import RoadmapView from '../viewer/RoadmapView'
import MdEditor from './MdEditor'
import { SAMPLE } from './sample'
import { imageName, referencedImages, shrink, withImageUrls } from './images'
import { type Draft, deleteDraft, deleteImage, getImages, putDraft, putImage } from './store'
import { type CheckResult, type Problem, checkDraft, coerceDoc, exportInline, exportPackage, extractInlineImages, parseTags, saveAs, today } from './drafts'
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

type Modal = null | 'json' | 'changelog' | 'details' | 'check' | 'submit' | 'delete'

/**
 * The roadmap editor. Everything is saved to this browser (IndexedDB) a
 * moment after each change; nothing leaves the browser until the author
 * downloads or submits.
 */
export default function Editor({ initial, initialImages }: { initial: Draft; initialImages: Map<string, Blob> }) {
  const toast = useToast()
  const nav = useNavigate()
  const [draft, setDraft] = useState<Draft>(initial)
  const [images, setImages] = useState(initialImages)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState<'saved' | 'saving' | 'error'>('saved')
  const [modal, setModal] = useState<Modal>(initial.meta.audience || initial.base ? null : 'details')
  const [busy, setBusy] = useState(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  /** Mutate a deep copy of the document and commit it. */
  const update = useCallback((fn: (d: RoadmapDoc) => void) => {
    setDraft(prev => { const doc = structuredClone(prev.doc); fn(doc); return { ...prev, doc } })
    setDirty(true)
  }, [])
  const updateDraft = useCallback((fn: (d: Draft) => Draft) => { setDraft(fn); setDirty(true) }, [])

  const save = useCallback(async () => {
    const d = { ...draftRef.current, updatedAt: Date.now() }
    setSaving('saving')
    try {
      await putDraft(d)
      // Drop screenshots no node uses any more.
      const used = referencedImages(d.doc)
      const unused = [...images.keys()].filter(k => !used.has(k))
      if (unused.length) {
        await Promise.all(unused.map(k => deleteImage(d.id, k)))
        setImages(prev => { const m = new Map(prev); unused.forEach(k => m.delete(k)); return m })
      }
      if (draftRef.current.doc === d.doc && draftRef.current.meta === d.meta) setDirty(false)
      setSaving('saved')
    } catch (e) {
      setSaving('error')
      toast('Could not save in this browser: ' + (e as Error).message)
    }
  }, [images, toast])

  // Save 600 ms after the last change, and right away when the tab is hidden.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 600)
    const onHide = () => { if (document.visibilityState === 'hidden') save() }
    document.addEventListener('visibilitychange', onHide)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onHide) }
  }, [draft, dirty, save])

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  // In-memory URLs for the draft's screenshots, for the preview.
  // Created in the effect, not a memo, so they are recreated whenever the
  // cleanup has revoked them (React runs effects twice in development).
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const m = new Map([...images].map(([k, b]) => [k, URL.createObjectURL(b)]))
    setUrls(m)
    return () => m.forEach(u => URL.revokeObjectURL(u))
  }, [images])
  const shownDoc = useMemo(() => withImageUrls(draft.doc, urls), [draft.doc, urls])

  const addImages = useCallback(async (nodeId: string, blobs: Blob[]) => {
    const imgs = blobs.filter(b => b.type.startsWith('image/'))
    if (!imgs.length) return
    setBusy(true)
    let n = 0
    for (const b of imgs) {
      try {
        const small = await shrink(b)
        const name = imageName('jpg')
        await putImage(draftRef.current.id, name, small)
        setImages(prev => new Map(prev).set(name, small))
        update(d => { const f = findNode(d.topics, nodeId); if (f) { f.node.images = f.node.images || []; f.node.images.push({ src: 'images/' + name, caption: '' }) } })
        n++
      } catch (e) { toast('Could not add that image: ' + (e as Error).message) }
    }
    setBusy(false)
    if (n) toast(n === 1 ? 'Screenshot added.' : `${n} screenshots added.`)
  }, [update, toast])

  // Paste a screenshot from the clipboard onto the selected node.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (modal || !selectedId) return
      const t = e.target as HTMLElement
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      const blobs: Blob[] = []
      for (const it of Array.from(e.clipboardData?.items || [])) if (it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) blobs.push(f) }
      if (blobs.length) { e.preventDefault(); addImages(selectedId, blobs) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [selectedId, modal, addImages])

  const found = useMemo(() => selectedId ? findNode(draft.doc.topics, selectedId) : null, [draft.doc, selectedId])
  const check = useMemo(() => checkDraft(draft, new Set(images.keys())), [draft, images])
  const detailsIncomplete = check.errors.some(p => p.msg.startsWith('Details'))

  const goTo = (p: Problem) => {
    setModal(p.msg.startsWith('Details') ? 'details' : null)
    if (p.nodeId) setSelectedId(p.nodeId)
  }

  const importJson = async (text: string) => {
    try {
      const doc = coerceDoc(JSON.parse(text))
      const moved = await extractInlineImages(draft.id, doc)
      setImages(await getImages(draft.id))
      update(x => { Object.assign(x, { topics: doc.topics, changelog: doc.changelog || [] }); if (doc.title) x.title = doc.title; if (doc.subtitle) x.subtitle = doc.subtitle })
      setSelectedId(null)
      toast(moved ? `Imported, with ${moved} screenshot${moved > 1 ? 's' : ''}.` : 'Imported.')
    } catch { toast('Could not read that JSON file.') }
  }

  const doc = draft.doc
  return (
    <div className="bld">
      <div className="bld-top">
        <Link to="/write" className="mini" title="All drafts">←</Link>
        <input className="bld-title" placeholder="Roadmap title" value={doc.title} onChange={e => {
          const title = e.target.value
          // A new roadmap's web address follows its title until the author sets one.
          updateDraft(p => ({
            ...p, doc: { ...p.doc, title },
            slug: !p.base && (!p.slug || p.slug === slugify(p.doc.title)) ? slugify(title) : p.slug,
          }))
        }} />
        <input className="bld-sub" placeholder="One-line subtitle (optional)" value={doc.subtitle} onChange={e => update(d => { d.subtitle = e.target.value })} />
        <button className={'ghost' + (detailsIncomplete ? ' attn' : '')} onClick={() => setModal('details')} title="Who it is for, tags, language, author">Details{detailsIncomplete ? ' •' : ''}</button>
        <span className="spacer" />
        {draft.base && <span className="bld-base" title="Your changes will be proposed as an edit to the published roadmap">editing /r/{draft.base.slug}</span>}
        <span className="bld-save" title="Drafts are kept in this browser only">{saving === 'saving' ? 'saving…' : saving === 'error' ? 'not saved!' : dirty ? 'unsaved' : 'saved in this browser'}</span>
        <button className="ghost" onClick={() => setModal('check')} title="The same checks reviewers run">
          Check {check.errors.length ? <b className="cnt err">{check.errors.length}</b> : <b className="cnt ok">✓</b>}
        </button>
        <button onClick={() => setModal('submit')}>Submit…</button>
        <details className="bld-more">
          <summary>More</summary>
          <div className="bld-menu" onClick={e => { (e.currentTarget.parentElement as HTMLDetailsElement).open = false }}>
            <button className="ghost" onClick={() => setModal('changelog')}>Changelog</button>
            <button className="ghost" onClick={() => setModal('json')}>Edit JSON</button>
            <button className="ghost" onClick={async () => saveAs(await exportPackage(draft, images), `${draft.slug || 'roadmap'}.zip`)}>Download package (.zip)</button>
            <button className="ghost" title="Screenshots embedded; opens in tools/roadmap-builder.html" onClick={async () => saveAs(await exportInline(draft, images), `${draft.slug || 'roadmap'}.roadmap.json`)}>Download JSON (inline images)</button>
            <ImportButton onText={importJson} />
            {!doc.topics.length && <button className="ghost" onClick={() => { update(d => { Object.assign(d, structuredClone(SAMPLE), { title: d.title || SAMPLE.title }) }); toast('Sample loaded.') }}>Load sample</button>}
            <button className="danger" onClick={() => setModal('delete')}>Delete draft</button>
          </div>
        </details>
      </div>

      <div className="bld-app">
        <div className="bld-editor">
          <div className="bld-outline">
            {!doc.topics.length && <div className="hint">No milestones yet. A milestone sits on the central spine ("you can now do X"); the steps to reach it branch off it, up to {MAX_DEPTH} levels deep. Or load the sample from the More menu.</div>}
            {doc.topics.map((t, ti) => (
              <div className="o-topic" key={t.id}>
                <OutlineRow n={t} depth={0} idx={ti} selectedId={selectedId} onSelect={setSelectedId} update={update} setSelectedId={setSelectedId} />
                <div className="o-kids">
                  <Kids arr={t.children || []} depth={1} selectedId={selectedId} onSelect={setSelectedId} update={update} setSelectedId={setSelectedId} />
                  <button className="addbtn" onClick={() => { const n = newNode('New step', 1); update(d => { d.topics[ti].children.push(n) }); setSelectedId(n.id) }}>+ step</button>
                </div>
              </div>
            ))}
            <button className="addbtn" onClick={() => { const n = newNode('New milestone', 0); update(d => { d.topics.push(n) }); setSelectedId(n.id) }}>+ milestone</button>
          </div>
          <div className="bld-inspector">
            {found ? <Inspector f={found} update={update} urls={urls} onAddImages={blobs => addImages(found.node.id, blobs)} busy={busy}
              problems={[...check.errors, ...check.warnings].filter(p => p.nodeId === found.node.id)} />
              : <div className="hint">Select a milestone or step to edit it. With one selected you can paste a screenshot straight from the clipboard.</div>}
          </div>
        </div>
        <div className="bld-preview">
          {doc.topics.length || doc.title
            ? <RoadmapView doc={shownDoc} mode="preview" onSelect={setSelectedId} selectedId={selectedId} />
            : <div className="hint" style={{ textAlign: 'center', marginTop: 60 }}>The preview appears here. Start adding milestones, or load the sample.</div>}
        </div>
      </div>

      {modal === 'details' && <DetailsModal draft={draft} onClose={() => setModal(null)} onApply={next => { updateDraft(() => next); setModal(null) }} />}
      {modal === 'check' && <CheckModal check={check} onClose={() => setModal(null)} onGo={goTo} />}
      {modal === 'submit' && <SubmitModal draft={draft} check={check} images={images} onClose={() => setModal(null)} onGo={goTo}
        onLog={text => update(d => { d.changelog = [{ date: today(), text }, ...(d.changelog || [])]; d.updated = today() })} />}
      {modal === 'json' && <JsonModal doc={doc} onClose={() => setModal(null)} onApply={d => { updateDraft(x => ({ ...x, doc: d })); setSelectedId(null); setModal(null); toast('Applied.') }} />}
      {modal === 'changelog' && <ChangelogModal doc={doc} onClose={() => setModal(null)} onApply={entries => { update(d => { d.changelog = entries; d.updated = today() }); setModal(null) }} />}
      {modal === 'delete' && (
        <ModalBox onClose={() => setModal(null)}>
          <h3>Delete this draft?</h3>
          <p className="prose">This removes “{doc.title || 'Untitled'}” and its screenshots from this browser. {draft.base ? 'The published roadmap is not affected.' : ''} There is no undo.</p>
          <div className="row"><button className="ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="danger" onClick={async () => { setDirty(false); await deleteDraft(draft.id); toast('Draft deleted.'); nav('/write') }}>Delete</button></div>
        </ModalBox>
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
        <button className="mini" title={`Add a step under this (level ${depth + 1})`} onClick={() => {
          const g = newNode('New step', depth + 1)
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

function Inspector({ f, update, urls, onAddImages, busy, problems }: {
  f: Found; update: Update; urls: Map<string, string>; onAddImages: (b: Blob[]) => void; busy: boolean; problems: Problem[]
}) {
  const n = f.node
  const id = n.id
  const set = (fn: (node: RNode) => void) => update(d => { const x = findNode(d.topics, id); if (x) fn(x.node) })
  const fileIn = useRef<HTMLInputElement>(null)
  const srcOf = (src: string) => src.startsWith('images/') ? urls.get(src.slice(7)) || '' : src
  return (
    <div>
      <div className="ins-kind">{f.depth === 0 ? 'milestone' : `step, level ${f.depth} · under ${f.parentNode?.label || 'Untitled'}`}</div>
      {problems.length > 0 && (
        <ul className="ins-problems">{problems.map((p, i) => <li key={i}>{p.short || p.msg}</li>)}</ul>
      )}
      <label className="f">Label</label>
      <input type="text" value={n.label} onChange={e => set(x => { x.label = e.target.value })} />
      {f.depth >= 1 && <>
        <label className="f">Type</label>
        <select value={n.type || 'core'} onChange={e => set(x => { x.type = e.target.value as NodeType })}>
          <option value="core">Core: everyone should learn this</option><option value="alt">Alternative: instead of a sibling</option><option value="optional">Optional: nice to have</option>
        </select>
      </>}
      {f.depth === 1 && <>
        <label className="f">Side of spine</label>
        <select value={n.side || 'auto'} onChange={e => set(x => { x.side = e.target.value as Side })}>
          <option value="auto">Auto</option><option value="left">Left</option><option value="right">Right</option>
        </select>
      </>}
      <label className="f">Description</label>
      <MdEditor key={id} value={n.desc || ''} placeholder="What to learn here and why. Shown when a reader clicks this step." onChange={v => set(x => { x.desc = v })} />

      <label className="f">Free resources</label>
      {(n.links || []).map((l, i) => (
        <div className="linkrow" key={i}>
          <input type="text" placeholder="Label" value={l.label} onChange={e => set(x => { x.links[i].label = e.target.value })} />
          <input type="text" placeholder="https://..." value={l.url} onChange={e => set(x => { x.links[i].url = e.target.value })}
            onBlur={e => { const v = e.target.value.trim(); if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) set(x => { x.links[i].url = 'https://' + v.replace(/^\/+/, '') }) }} />
          <button className="mini" onClick={() => set(x => { x.links.splice(i, 1) })}>&times;</button>
        </div>
      ))}
      <button className="addbtn" onClick={() => set(x => { x.links.push({ label: '', url: '' }) })}>+ link</button>

      <label className="f">Common issues</label>
      {(n.faq || []).map((q, i) => (
        <div className="faqbox" key={i}>
          <div className="faqtop">
            <input type="text" placeholder="The question or problem" value={q.q} onChange={e => set(x => { x.faq![i].q = e.target.value })} />
            <button className="mini" title="Remove" onClick={() => set(x => { x.faq!.splice(i, 1) })}>&times;</button>
          </div>
          <MdEditor key={id + ':' + i} value={q.a} minHeight={48} placeholder="The answer. Use the code-block button for commands." onChange={v => set(x => { x.faq![i].a = v })} />
        </div>
      ))}
      <button className="addbtn" onClick={() => set(x => { x.faq = x.faq || []; x.faq.push({ q: '', a: '' }) })}>+ issue</button>

      <label className="f">Screenshots</label>
      {(n.images || []).map((im, i) => (
        <div className="imgrow" key={im.src + i}>
          <img src={srcOf(im.src)} alt="" title="Open" onClick={() => window.open(srcOf(im.src), '_blank')} />
          <input type="text" placeholder="Caption (optional)" value={im.caption || ''} onChange={e => set(x => { x.images![i].caption = e.target.value })} />
          <button className="mini" title="Remove" onClick={() => set(x => { x.images!.splice(i, 1) })}>&times;</button>
        </div>
      ))}
      <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={e => { onAddImages(Array.from(e.target.files || [])); e.target.value = '' }} />
      <button className="addbtn" disabled={busy} onClick={() => fileIn.current?.click()}>{busy ? 'adding…' : '+ screenshot'}</button>
      <div className="imghint">Tip: with this step selected, paste a screenshot straight from the clipboard. Large images are resized to fit.</div>
    </div>
  )
}

/* ---------- modals ---------- */

export function ModalBox({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
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

const LANGS: [string, string][] = [
  ['en', 'English'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ta', 'Tamil'], ['te', 'Telugu'], ['mr', 'Marathi'],
  ['gu', 'Gujarati'], ['kn', 'Kannada'], ['ml', 'Malayalam'], ['pa', 'Punjabi'], ['or', 'Odia'], ['ur', 'Urdu'],
]

function DetailsModal({ draft, onClose, onApply }: { draft: Draft; onClose: () => void; onApply: (d: Draft) => void }) {
  const m = draft.meta
  const [audience, setAudience] = useState(m.audience)
  const [level, setLevel] = useState(m.level || '')
  const [lang, setLang] = useState(m.lang || 'en')
  const [tags, setTags] = useState(m.tags.join(', '))
  const [authorName, setAuthorName] = useState(m.authors[0]?.name || '')
  const [authorUrl, setAuthorUrl] = useState(m.authors[0]?.url || '')
  const [slug, setSlug] = useState(draft.slug || slugify(draft.doc.title))
  const others = m.authors.slice(1)
  const langs = LANGS.some(([c]) => c === lang) ? LANGS : [...LANGS, [lang, lang] as [string, string]]
  return (
    <ModalBox onClose={onClose}>
      <h3>About this roadmap</h3>
      <div className="form">
        <label className="f">Who is it for? <i>required</i></label>
        <input type="text" value={audience} maxLength={200} placeholder="e.g. Class 9 students revising for the final exam" onChange={e => setAudience(e.target.value)} />
        <div className="grid2">
          <div>
            <label className="f">Level</label>
            <select value={level} onChange={e => setLevel(e.target.value)}>
              <option value="">Not specified</option>
              {LEVELS.map(l => <option key={l} value={l}>{l === 'all' ? 'All levels' : l[0].toUpperCase() + l.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="f">Language</label>
            <select value={lang} onChange={e => setLang(e.target.value)}>{langs.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          </div>
        </div>
        <label className="f">Tags <i>1 to 8, comma separated</i></label>
        <input type="text" value={tags} placeholder="maths, cbse, class 9" onChange={e => setTags(e.target.value)} />
        <div className="grid2">
          <div>
            <label className="f">Your name, as shown on the roadmap <i>required</i></label>
            <input type="text" value={authorName} maxLength={80} placeholder="A display name, not an email address" onChange={e => setAuthorName(e.target.value)} />
          </div>
          <div>
            <label className="f">Link to you <i>optional</i></label>
            <input type="text" value={authorUrl} placeholder="https://..." onChange={e => setAuthorUrl(e.target.value)} />
          </div>
        </div>
        {others.length > 0 && <p className="hint">Also credited: {others.map(a => a.name).join(', ')}.</p>}
        <label className="f">Web address</label>
        {draft.base
          ? <p className="hint">/r/{draft.base.slug}/ (an existing roadmap keeps its address)</p>
          : <div className="slugrow"><span>/r/</span><input type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} onBlur={() => setSlug(slugify(slug))} /><span>/</span></div>}
      </div>
      <div className="row"><button className="ghost" onClick={onClose}>Cancel</button>
        <button onClick={() => onApply({
          ...draft,
          slug: draft.base ? draft.base.slug : slugify(slug),
          meta: {
            audience, lang, tags: parseTags(tags),
            level: (level || undefined) as Draft['meta']['level'],
            authors: [{ name: authorName, url: authorUrl || undefined }, ...others],
          },
        })}>Done</button></div>
    </ModalBox>
  )
}

function ProblemList({ items, kind, onGo }: { items: Problem[]; kind: 'err' | 'warn'; onGo: (p: Problem) => void }) {
  return (
    <ul className={'problems ' + kind}>
      {items.map((p, i) => (
        <li key={i}>{p.nodeId || p.msg.startsWith('Details') ? <button className="linkish" onClick={() => onGo(p)}>{p.msg}</button> : p.msg}</li>
      ))}
    </ul>
  )
}

function CheckModal({ check, onClose, onGo }: { check: CheckResult; onClose: () => void; onGo: (p: Problem) => void }) {
  return (
    <ModalBox onClose={onClose}>
      <h3>Check</h3>
      <p className="prose">The same checks that run when a roadmap is submitted. Click a problem to go to it.</p>
      <div className="scroll">
        {check.errors.length === 0 && check.warnings.length === 0 && <p className="prose">No problems found.</p>}
        {check.errors.length > 0 && <><h4>Must fix ({check.errors.length})</h4><ProblemList items={check.errors} kind="err" onGo={onGo} /></>}
        {check.warnings.length > 0 && <><h4>Worth a look ({check.warnings.length})</h4><ProblemList items={check.warnings} kind="warn" onGo={onGo} /></>}
      </div>
      <div className="row"><button onClick={onClose}>Close</button></div>
    </ModalBox>
  )
}

function SubmitModal({ draft, check, images, onClose, onGo, onLog }: {
  draft: Draft; check: CheckResult; images: Map<string, Blob>; onClose: () => void; onGo: (p: Problem) => void; onLog: (text: string) => void
}) {
  const [taken, setTaken] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const [logged, setLogged] = useState(false)
  useEffect(() => {
    if (draft.base) { setTaken(false); return }
    loadCatalog().then(c => setTaken(c.some(r => r.slug === draft.slug))).catch(() => setTaken(false))
  }, [draft.base, draft.slug])

  const needsLog = !logged && (draft.base || !(draft.doc.changelog || []).length)
  const title = `${draft.base ? 'Update' : 'New roadmap'}: ${draft.doc.title || draft.slug}`
  const issue = `${REPO_URL}/issues/new?${new URLSearchParams({ template: 'submit-roadmap.yml', title, roadmap: `/r/${draft.slug}/` })}`

  return (
    <ModalBox onClose={onClose}>
      <h3>Submit for review</h3>
      <div className="scroll">
        {check.errors.length > 0 ? (
          <>
            <p className="prose">A few things need fixing before this can be submitted. Click one to go to it.</p>
            <ProblemList items={check.errors} kind="err" onGo={onGo} />
          </>
        ) : taken ? (
          <p className="prose">The web address <b>/r/{draft.slug}/</b> is already used by a published roadmap. Pick another under <button className="linkish" onClick={() => onGo({ msg: 'Details' })}>Details</button>, or start from that roadmap to suggest changes to it.</p>
        ) : needsLog ? (
          <>
            <p className="prose">{draft.base ? 'In a sentence, what did you change? This goes in the roadmap’s changelog, which readers see.' : 'One line for the changelog, which readers see.'}</p>
            <input type="text" autoFocus value={note} placeholder={draft.base ? 'e.g. Added a step on recursion; replaced two dead links' : 'First version.'} onChange={e => setNote(e.target.value)} />
            <div className="row"><button disabled={!draft.base ? false : !note.trim()} onClick={() => { onLog(note.trim() || 'First version.'); setLogged(true) }}>Continue</button></div>
          </>
        ) : (
          <>
            <p className="prose">
              Everything checks out{check.warnings.length ? `, with ${check.warnings.length} suggestion${check.warnings.length > 1 ? 's' : ''} you may want to look at` : ''}.
              One-click submission is coming soon. Until then, it takes two steps and a free GitHub account:
            </p>
            <ol className="steps">
              <li><button onClick={async () => saveAs(await exportPackage(draft, images), `${draft.slug}.zip`)}>Download the package</button> <span className="hint-inline">{draft.slug}.zip</span></li>
              <li><a className="btn" href={issue} target="_blank" rel="noopener">Open a submission</a> and drag the zip file into it.</li>
            </ol>
            <p className="prose dim">
              A reviewer will check it and may ask for changes in the same place. Keep this draft until your roadmap is published.
              By submitting you agree to share it under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.
            </p>
          </>
        )}
      </div>
      <div className="row"><button className="ghost" onClick={onClose}>Close</button></div>
    </ModalBox>
  )
}

function JsonModal({ doc, onClose, onApply }: { doc: RoadmapDoc; onClose: () => void; onApply: (d: RoadmapDoc) => void }) {
  const [text, setText] = useState(() => JSON.stringify(doc, null, 2))
  const toast = useToast()
  return (
    <ModalBox onClose={onClose}>
      <h3>Edit roadmap JSON</h3>
      <textarea value={text} spellCheck={false} onChange={e => setText(e.target.value)} />
      <div className="row"><button className="ghost" onClick={onClose}>Cancel</button>
        <button onClick={() => { try { onApply(coerceDoc(JSON.parse(text))) } catch (e) { toast('Invalid JSON: ' + (e as Error).message) } }}>Apply</button></div>
    </ModalBox>
  )
}

function ChangelogModal({ doc, onClose, onApply }: { doc: RoadmapDoc; onClose: () => void; onApply: (e: { date: string; text: string }[]) => void }) {
  const [text, setText] = useState(() => (doc.changelog || []).map(e => `${e.date}: ${e.text}`).join('\n'))
  return (
    <ModalBox onClose={onClose}>
      <h3>Changelog</h3>
      <p className="prose">One entry per line, newest first: <code>{today()}: Added the recursion section</code>. Readers see these under the “Updated” chip.</p>
      <textarea value={text} spellCheck={false} placeholder={`${today()}: First version.`} onChange={e => setText(e.target.value)} />
      <div className="row"><button className="ghost" onClick={onClose}>Cancel</button>
        <button onClick={() => onApply(text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const m = l.match(/^(\d{4}-\d{2}-\d{2})\s*:\s*(.+)$/)
          return m ? { date: m[1], text: m[2] } : { date: today(), text: l }
        }))}>Apply</button></div>
    </ModalBox>
  )
}

export function ImportButton({ onText, label = 'Import JSON' }: { onText: (text: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={ref} type="file" accept="application/json,.json" hidden onChange={async e => {
        const f = e.target.files?.[0]; if (!f) return
        onText(await f.text()); e.target.value = ''
      }} />
      <button className="ghost" onClick={() => ref.current?.click()}>{label}</button>
    </>
  )
}
