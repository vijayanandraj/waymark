import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Progress, RNode, RoadmapDoc, Status } from '../lib/types'
import { indexTree, layout, type LNode } from '../lib/layout'
import { copyText, esc, mdToHtml } from '../lib/md'
import './viewer.css'

export interface RoadmapViewProps {
  doc: RoadmapDoc
  /** 'reader' shows progress controls and deep links; 'preview' is the builder's live pane. */
  mode: 'reader' | 'preview'
  progress?: Progress
  onProgress?: (nodeId: string, status: Status) => void
  /** builder: called when a node is clicked so the inspector can follow. */
  onSelect?: (id: string) => void
  /** external selection to highlight (builder). */
  selectedId?: string | null
}

const TYPE_LABEL: Record<string, string> = { core: 'Core', alt: 'Alternative', optional: 'Optional' }

function nodeText(nd: RNode): string {
  let s = (nd.label || '') + ' ' + (nd.desc || '')
  for (const f of nd.faq || []) s += ' ' + (f.q || '') + ' ' + (f.a || '')
  for (const l of nd.links || []) s += ' ' + (l.label || '')
  return s.toLowerCase()
}

export default function RoadmapView({ doc, mode, progress = {}, onProgress, onSelect, selectedId }: RoadmapViewProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [view, setView] = useState<'map' | 'list'>('map')
  const [drawer, setDrawer] = useState<{ kind: 'node'; id: string } | { kind: 'changelog' } | null>(null)
  const [lightbox, setLightbox] = useState<{ src: string; cap: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [flashId, setFlashId] = useState<string | null>(null)

  const { byId, parentOf, total } = useMemo(() => indexTree(doc.topics), [doc])

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim().toLowerCase()), 160)
    return () => clearTimeout(t)
  }, [query])

  const matchSet = useMemo(() => {
    const m: Record<string, boolean> = {}
    if (!q) return m
    for (const id in byId) if (nodeText(byId[id]).includes(q)) m[id] = true
    return m
  }, [q, byId])

  const subtreeHasMatch = useCallback((nd: RNode): boolean => {
    if (matchSet[nd.id]) return true
    return (nd.children || []).some(subtreeHasMatch)
  }, [matchSet])

  const isOpen = useCallback((k: RNode): boolean => {
    if (q) return (k.children || []).some(subtreeHasMatch)
    return k.id in expanded ? expanded[k.id] : mode === 'preview'
  }, [q, expanded, mode, subtreeHasMatch])

  const lay = useMemo(() => layout(doc, isOpen), [doc, isOpen])

  const doneCount = useMemo(() => Object.values(progress).filter(v => v === 'done').length, [progress])

  const openNode = useCallback((id: string) => {
    if (!byId[id]) return
    setDrawer({ kind: 'node', id })
    onSelect?.(id)
    if (mode === 'reader') { try { history.replaceState(null, '', '#' + id) } catch { /* ignore */ } }
  }, [byId, onSelect, mode])

  // Deep links: #nodeId expands ancestors, scrolls, flashes and opens the drawer.
  useEffect(() => {
    if (mode !== 'reader') return
    const go = () => {
      const id = (location.hash || '').slice(1)
      if (!id || !byId[id]) return
      setExpanded(prev => {
        const next = { ...prev }
        let p = parentOf[id]
        while (p) { next[p.id] = true; p = parentOf[p.id] }
        return next
      })
      setTimeout(() => {
        const el = scrollRef.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)
        el?.scrollIntoView({ block: 'center' })
        setFlashId(id)
        setTimeout(() => setFlashId(null), 2500)
      }, 50)
      setDrawer({ kind: 'node', id })
    }
    window.addEventListener('hashchange', go)
    if (location.hash) go()
    return () => window.removeEventListener('hashchange', go)
  }, [mode, byId, parentOf])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])

  const nMatch = Object.keys(matchSet).length
  const hasLog = (doc.changelog || []).length > 0

  return (
    <div className="rm">
      <div className="rm-head">
        <h1>{doc.title || 'Untitled roadmap'}</h1>
        {doc.subtitle && <p>{doc.subtitle}</p>}
        <div className="rm-legend">
          <span><i className="k k-topic" />Milestone</span>
          <span><i className="k k-core" />Core</span>
          <span><i className="k k-alt" />Alternative</span>
          <span><i className="k k-opt" />Optional</span>
          {mode === 'reader' && onProgress && <span className="rm-count">{doneCount} of {total} done</span>}
        </div>
        <div className="rm-ctl">
          <input type="search" placeholder="Search this roadmap" aria-label="Search this roadmap" value={query} onChange={e => setQuery(e.target.value)} />
          <span className="rm-mcount">{q ? `${nMatch} match${nMatch === 1 ? '' : 'es'}` : ''}</span>
          <button type="button" className="rm-vbtn" onClick={() => setView(v => v === 'map' ? 'list' : 'map')}>
            {view === 'map' ? 'Checklist view' : 'Map view'}
          </button>
          {(doc.updated || hasLog) && (
            <button type="button" className="rm-upd" disabled={!hasLog} title={hasLog ? 'See what changed' : undefined}
              onClick={() => setDrawer({ kind: 'changelog' })}>
              Updated {doc.updated || doc.changelog?.[0]?.date || ''}
            </button>
          )}
        </div>
      </div>

      <div className="rm-scroll" ref={scrollRef}>
        {view === 'map' ? (
          <div className="rm-canvas" style={{ width: lay.W, height: lay.H }}>
            <div className="rm-svg">
              <svg width={lay.W} height={lay.H} xmlns="http://www.w3.org/2000/svg">
                {lay.spine && <line x1={lay.spine.x} y1={lay.spine.y1} x2={lay.spine.x} y2={lay.spine.y2} className="rm-spine" />}
                {lay.edges.map((e, i) => <path key={i} d={e.d} className={'rm-edge' + (e.dashed ? ' rm-edge-dash' : '')} />)}
              </svg>
            </div>
            {lay.nodes.map(n => (
              <MapNode key={n.id} n={n} status={progress[n.id]} q={q}
                hit={!!matchSet[n.id] || flashId === n.id || selectedId === n.id}
                dim={!!q && !matchSet[n.id] && !subtreeHasMatch(n.ref)}
                onOpen={() => openNode(n.id)}
                onToggle={n.toggle && !q ? () => setExpanded(p => ({ ...p, [n.id]: !isOpen(n.ref) })) : undefined} />
            ))}
          </div>
        ) : (
          <div className="rm-list">
            {doc.topics.map((t, i) => (q && !matchSet[t.id] && !subtreeHasMatch(t)) ? null : (
              <div key={t.id}>
                <div className="rm-l-topic">
                  <span className="num">{i + 1}</span>
                  <button type="button" className="rm-l-btn rm-l-tbtn" onClick={() => openNode(t.id)}>{t.label || 'Untitled'}</button>
                </div>
                <ListKids arr={t.children || []} depth={1} q={q} matchSet={matchSet} subtreeHasMatch={subtreeHasMatch}
                  progress={progress} onProgress={onProgress} onOpen={openNode} />
              </div>
            ))}
          </div>
        )}
      </div>

      {drawer?.kind === 'node' && byId[drawer.id] && (
        <NodeDrawer node={byId[drawer.id]} isTopic={!parentOf[drawer.id]} mode={mode}
          status={progress[drawer.id] || ''} onProgress={onProgress}
          onClose={() => setDrawer(null)} onLightbox={(src, cap) => setLightbox({ src, cap })} />
      )}
      {drawer?.kind === 'changelog' && (
        <div className="rm-drawer">
          <div className="rm-d-top"><span className="rm-d-type">Changelog</span>
            <span className="rm-d-tools"><button type="button" className="rm-d-close" aria-label="Close" onClick={() => setDrawer(null)}>&times;</button></span></div>
          <h2>What changed</h2>
          {(doc.changelog || []).map((en, i) => (
            <div className="rm-cl" key={i}><span className="rm-cl-d">{en.date}</span><div dangerouslySetInnerHTML={{ __html: mdToHtml(en.text || '') }} /></div>
          ))}
        </div>
      )}
      {lightbox && (
        <div className="rm-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.src} alt="" />
          {lightbox.cap && <div className="cap">{lightbox.cap}</div>}
        </div>
      )}
    </div>
  )
}

function MapNode({ n, status, hit, dim, onOpen, onToggle }: {
  n: LNode; status?: Status; q: string; hit: boolean; dim: boolean; onOpen: () => void; onToggle?: () => void
}) {
  const cls = ['rm-node', n.kind === 'topic' ? 'rm-topic' : `rm-child rm-t-${n.type}`,
    status === 'done' ? 'rm-done' : '', status === 'prog' ? 'rm-prog' : '', hit ? 'rm-hit' : '', dim ? 'rm-dim' : ''].filter(Boolean).join(' ')
  return (
    <>
      <button type="button" className={cls} data-id={n.id} onClick={onOpen}
        style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>{n.label}</button>
      {n.toggle && onToggle && (
        <button type="button" className={'rm-x' + (n.toggle.open ? ' open' : '')} aria-expanded={n.toggle.open}
          title={`${n.toggle.open ? 'Hide' : 'Show'} ${n.toggle.count} item${n.toggle.count > 1 ? 's' : ''} under "${n.label}"`}
          style={{ top: n.cy - 10, left: n.side === 'left' ? n.x - 10 : n.x + n.w - 10 }}
          onClick={e => { e.stopPropagation(); onToggle() }}>
          {n.toggle.open ? '−' : '+' + n.toggle.count}
        </button>
      )}
    </>
  )
}

function ListKids({ arr, depth, q, matchSet, subtreeHasMatch, progress, onProgress, onOpen }: {
  arr: RNode[]; depth: number; q: string; matchSet: Record<string, boolean>; subtreeHasMatch: (n: RNode) => boolean
  progress: Progress; onProgress?: (id: string, s: Status) => void; onOpen: (id: string) => void
}) {
  return (
    <>
      {arr.map(k => (q && !matchSet[k.id] && !subtreeHasMatch(k)) ? null : (
        <div key={k.id}>
          <div className={'rm-l-row' + (progress[k.id] === 'done' ? ' rm-l-done' : '')} data-id={k.id} style={{ paddingLeft: depth * 22 }}>
            {onProgress && (
              <input type="checkbox" checked={progress[k.id] === 'done'} aria-label={'Done: ' + (k.label || '')}
                onChange={e => onProgress(k.id, e.target.checked ? 'done' : '')} />
            )}
            <button type="button" className="rm-l-btn" onClick={() => onOpen(k.id)}>{k.label || 'Untitled'}</button>
            <span className="rm-l-tag">{({ core: 'core', alt: 'alt', optional: 'opt' } as Record<string, string>)[k.type || 'core']}</span>
          </div>
          <ListKids arr={k.children || []} depth={depth + 1} q={q} matchSet={matchSet} subtreeHasMatch={subtreeHasMatch}
            progress={progress} onProgress={onProgress} onOpen={onOpen} />
        </div>
      ))}
    </>
  )
}

function NodeDrawer({ node, isTopic, mode, status, onProgress, onClose, onLightbox }: {
  node: RNode; isTopic: boolean; mode: 'reader' | 'preview'; status: Status
  onProgress?: (id: string, s: Status) => void; onClose: () => void; onLightbox: (src: string, cap: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Wire the Copy buttons that mdToHtml emits inside code blocks.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const handler = (e: Event) => {
      const btn = (e.target as HTMLElement).closest('.rm-copy') as HTMLElement | null
      if (!btn) return
      const pre = btn.parentElement?.querySelector('pre')
      if (pre) copyText(pre.textContent || '', btn)
    }
    root.addEventListener('click', handler)
    return () => root.removeEventListener('click', handler)
  }, [node])

  const typeLabel = isTopic ? 'Milestone' : TYPE_LABEL[node.type || 'core'] || 'Core'
  const linkBtn = useRef<HTMLButtonElement>(null)
  return (
    <div className="rm-drawer" ref={ref}>
      <div className="rm-d-top">
        <span className="rm-d-type">{typeLabel}</span>
        <span className="rm-d-tools">
          {mode === 'reader' && (
            <button type="button" ref={linkBtn} className="rm-linkbtn" title="Copy a direct link to this item"
              onClick={() => copyText(location.href.split('#')[0] + '#' + node.id, linkBtn.current)}>Copy link</button>
          )}
          <button type="button" className="rm-d-close" aria-label="Close" onClick={onClose}>&times;</button>
        </span>
      </div>
      <h2>{node.label || 'Untitled'}</h2>
      {node.desc && <div className="rm-d-desc" dangerouslySetInnerHTML={{ __html: mdToHtml(node.desc) }} />}
      {(node.images || []).length > 0 && (
        <>
          <h3>Screenshots</h3>
          {node.images!.map((im, i) => (
            <figure className="rm-d-fig" key={i}>
              <img src={im.src} alt={im.caption || `Screenshot ${i + 1}`} onClick={() => onLightbox(im.src, im.caption || '')} />
              {im.caption && <figcaption>{im.caption}</figcaption>}
            </figure>
          ))}
        </>
      )}
      {(node.faq || []).length > 0 && (
        <>
          <h3>Common issues</h3>
          {node.faq!.map((f, i) => (
            <details className="rm-faq" key={i}>
              <summary>{f.q || 'Issue'}</summary>
              <div dangerouslySetInnerHTML={{ __html: mdToHtml(f.a || '') }} />
            </details>
          ))}
        </>
      )}
      {(node.links || []).length > 0 && (
        <>
          <h3>Resources</h3>
          <ul className="rm-d-links">
            {node.links.map((l, i) => (
              <li key={i}><a href={l.url} target="_blank" rel="noopener" dangerouslySetInnerHTML={{ __html: esc(l.label || l.url) }} /></li>
            ))}
          </ul>
        </>
      )}
      {onProgress && (
        <>
          <h3>Progress</h3>
          <div className="rm-d-status" role="group" aria-label="Progress">
            {([['', 'Not started'], ['prog', 'In progress'], ['done', 'Done']] as [Status, string][]).map(([st, label]) => (
              <button type="button" key={st} className={status === st ? 'on' : ''} onClick={() => onProgress(node.id, st)}>{label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
