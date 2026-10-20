import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { REPO_URL, loadCatalog, loadRequests, loadSubjects } from '../lib/content'
import { readProgress } from '../lib/progress'
import { STAGES } from '../lib/rules.mjs'
import type { CatalogEntry, Progress, RoadmapRequest, Subject } from '../lib/types'
import Thumb from '../components/Thumb'

const LEVEL_LABEL: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all: 'All levels' }
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function matches(r: CatalogEntry, q: string): boolean {
  if (!q) return true
  const hay = [r.title, r.subtitle, r.audience, r.follows || '', ...r.tags, ...r.authors.map(a => a.name)].join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w))
}

const scrollToBrowse = () => document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function Home() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const stage = params.get('stage') || ''
  const subject = params.get('subject') || ''
  const level = params.get('level') || ''
  const [all, setAll] = useState<CatalogEntry[] | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [requests, setRequests] = useState<RoadmapRequest[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    loadCatalog().then(setAll).catch(() => setFailed(true))
    loadSubjects().then(setSubjects).catch(() => {})
    loadRequests().then(setRequests).catch(() => {})
  }, [])

  const set = (k: string, v: string) => setParams(p => { if (v) p.set(k, v); else p.delete(k); return p }, { replace: true })

  const list = useMemo(() => (all || []).filter(r =>
    matches(r, q)
    // A roadmap for anyone is also a roadmap for a school student.
    && (!stage || r.stages.includes(stage) || r.stages.includes('anyone'))
    && (!subject || r.subject === subject)
    && (!level || r.level === level)), [all, q, stage, subject, level])

  const subjectOf = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects])
  const filtered = !!(q || stage || subject || level)

  return (
    <div className="home">
      <section className="hero2">
        <div className="hero-text">
          <p className="eyebrow">Free learning roadmaps, written by people who learned it</p>
          <h1>Know exactly what to learn&nbsp;next.</h1>
          <p className="pitch">
            Waymark breaks a big subject (Class 9 maths, programming, cybersecurity) into a map of small steps
            in the right order. Every step tells you <b>why it matters</b>, <b>where people get stuck</b>, and
            the <b>best free resources</b> to learn it from.
          </p>
          <form className="bigsearch" role="search" onSubmit={e => { e.preventDefault(); scrollToBrowse() }}>
            <input type="search" placeholder='Try "maths", "python" or "security"' aria-label="Search roadmaps" value={q} onChange={e => set('q', e.target.value)} />
            <button type="submit">Find a roadmap</button>
          </form>
          <div className="stagerow" role="group" aria-label="I am">
            <span>I am</span>
            {STAGES.map(s => (
              <button key={s.id} className={'chip' + (stage === s.id ? ' on' : '')} aria-pressed={stage === s.id}
                onClick={() => { set('stage', stage === s.id ? '' : s.id); if (stage !== s.id) scrollToBrowse() }}>{lower(s.label)}</button>
            ))}
          </div>
          <p className="promise">No account. No ads. Nothing to install.</p>
        </div>
        <Anatomy />
      </section>

      <section className="how">
        <div><b>1</b><h3>Find your roadmap</h3><p>By subject, or by where you are: school, college, a first job.</p></div>
        <div><b>2</b><h3>Follow the steps</h3><p>Open any step for what to learn, why, the usual mistakes, and free videos, books and practice.</p></div>
        <div><b>3</b><h3>Tick them off</h3><p>Your progress is saved on your device. Come back any time and pick up where you stopped.</p></div>
      </section>

      <section id="browse" className="browse">
        <div className="browsehead">
          <h2>Browse roadmaps</h2>
          <select aria-label="Level" value={level} onChange={e => set('level', e.target.value)}>
            <option value="">Any level</option>
            {Object.entries(LEVEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="subjects">
          {subjects.filter(s => s.count > 0).map(s => (
            <button key={s.id} className={'subject' + (subject === s.id ? ' on' : '')} aria-pressed={subject === s.id} title={s.about}
              onClick={() => set('subject', subject === s.id ? '' : s.id)}>
              <span className="ic" aria-hidden="true">{s.icon}</span>
              <span className="nm">{s.name}</span>
              <span className="ct">{s.count}</span>
            </button>
          ))}
        </div>
        {filtered && (
          <p className="filters">
            Showing {list.length} of {all?.length ?? 0}
            {stage && <> for people <b>{lower(STAGES.find(s => s.id === stage)?.label || stage)}</b></>}
            {subject && <> in <b>{subjectOf.get(subject)?.name || subject}</b></>}
            {q && <> matching <b>“{q}”</b></>}
            {' '}<button className="linkish" onClick={() => setParams({}, { replace: true })}>Clear</button>
          </p>
        )}
        {failed ? <p className="hint">Could not load the roadmap list. Check your connection and reload.</p>
          : all === null ? <p className="hint">Loading…</p>
          : list.length === 0 ? (
            <div className="empty">
              <p><b>No roadmap for that yet.</b> It could be yours: write it in your browser, or ask for it and someone may pick it up.</p>
              <div className="row"><Link className="btn" to="/write">Write it</Link>
                <a className="btn ghost" href={`${REPO_URL}/issues/new?template=propose-roadmap.yml`} target="_blank" rel="noopener">Ask for it</a></div>
            </div>
          ) : (
            <div className="cards">
              {list.map(r => <Card key={r.slug} r={r} subject={subjectOf.get(r.subject)} />)}
            </div>
          )}
      </section>

      {requests.length > 0 && (
        <section className="asks">
          <h2>People are asking for</h2>
          <p className="sub">Give a 👍 to the ones you want, or write one. Each request is a GitHub issue.</p>
          <ul>
            {requests.map(r => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noopener"><span className="v">👍 {r.votes}</span>{r.title}</a>
                {r.audience && <span className="aud">for {lower(r.audience)}</span>}
                {r.writing && <span className="badge">being written</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bands">
        <div className="band write">
          <h2>Know a subject well? Write the roadmap you wish you'd had.</h2>
          <p>Teachers, seniors, working people: write in your browser, with no account and no code. A reviewer checks it, then it is free for everyone.</p>
          <div className="row">
            <Link className="btn" to="/write">Write a roadmap</Link>
            <a className="btn ghost" href={`${REPO_URL}/issues/new?template=propose-roadmap.yml`} target="_blank" rel="noopener">Ask for one instead</a>
          </div>
        </div>
        <div className="band open">
          <h2>Free and open, for good.</h2>
          <p>
            Every roadmap is shared under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA</a> and
            the code is MIT licensed. No ads, no paywall, no accounts. Anyone can copy the whole project, content included, so it can never be locked up.
          </p>
          <div className="row"><a className="btn ghost" href={REPO_URL} target="_blank" rel="noopener">See the source</a><Link className="btn ghost" to="/about">About</Link></div>
        </div>
      </section>
    </div>
  )
}

function Card({ r, subject }: { r: CatalogEntry; subject?: Subject }) {
  const progress: Progress = readProgress(r.slug)
  const done = Object.values(progress).filter(s => s === 'done').length
  return (
    <Link className="card rcard" to={`/r/${r.slug}/`}>
      <div className="thumbbox"><Thumb shape={r.shape} progress={progress} /></div>
      <div className="body">
        {subject && <p className="subj"><span aria-hidden="true">{subject.icon}</span> {subject.name}</p>}
        <h3>{r.title}</h3>
        <p className="aud">For {lower(r.audience)}</p>
        {r.follows && <p className="follows">Follows: {r.follows}</p>}
        <div className="meta">
          {r.level && <span>{LEVEL_LABEL[r.level]}</span>}
          <span>{r.milestones} milestones · {r.nodeCount} steps</span>
          {r.updated && <span>updated {r.updated}</span>}
        </div>
        {done > 0 && <div className="mine"><i style={{ width: `${Math.min(100, (done / r.nodeCount) * 100)}%` }} /><span>{done} of {r.nodeCount} done</span></div>}
      </div>
    </Link>
  )
}

// The hero picture: the shape of a roadmap with one step opened, so a first
// visit shows what a "roadmap" is here before any reading.
const DEMO: CatalogEntry['shape'] = [
  { id: 'm1', steps: [['a1', 'core', 'auto'], ['a2', 'core', 'auto'], ['a3', 'optional', 'auto'], ['a4', 'core', 'auto']] },
  { id: 'm2', steps: [['b1', 'core', 'auto'], ['b2', 'core', 'auto'], ['b3', 'alt', 'auto']] },
  { id: 'm3', steps: [['c1', 'core', 'auto'], ['c2', 'core', 'auto'], ['c3', 'core', 'auto'], ['c4', 'optional', 'auto']] },
  { id: 'm4', steps: [['d1', 'core', 'auto'], ['d2', 'core', 'auto']] },
  { id: 'm5', steps: [['e1', 'core', 'auto'], ['e2', 'alt', 'auto'], ['e3', 'core', 'auto']] },
  { id: 'm6', steps: [['f1', 'core', 'auto'], ['f2', 'optional', 'auto']] },
]
const DEMO_PROGRESS: Progress = { a1: 'done', a2: 'done', a3: 'done', a4: 'done', b1: 'done', b3: 'prog' }

function Anatomy() {
  return (
    <figure className="anatomy" aria-label="Example: one step of a maths roadmap, opened">
      <div className="map"><Thumb shape={DEMO} progress={DEMO_PROGRESS} highlight="b2" fit /></div>
      <div className="stepcard">
        <p className="k">Step · Class 9 maths</p>
        <h3>Linear equations in two variables</h3>
        <dl>
          <dt>Why it matters</dt>
          <dd>Every graph you draw from here on starts with this.</dd>
          <dt>Where people get stuck</dt>
          <dd>“How can one equation have infinitely many answers?”</dd>
          <dt>Free resources</dt>
          <dd><span className="res">NCERT textbook, chapter 4</span><span className="res">Practice: 20 graphing problems</span></dd>
        </dl>
        <span className="done">✓ Mark as done</span>
      </div>
    </figure>
  )
}
