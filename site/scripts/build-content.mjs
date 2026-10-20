// Turns roadmaps/ into the static data the site fetches:
//
//   public/content/index.json             catalog for the home page
//   public/content/subjects.json          subjects, with how many roadmaps each has
//   public/content/requests.json          most-wanted roadmap proposals (GitHub issues)
//   public/content/<slug>.json            { slug, meta, nodeCount, doc }
//   public/content/<slug>/images/<file>   screenshots, copied as-is
//
// Refuses to build if any roadmap is invalid, so a broken main never deploys.
// The requests list is best-effort: without network access it is just empty.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRoadmaps } from './roadmaps.mjs'

const root = fileURLToPath(new URL('../../roadmaps', import.meta.url))
const out = fileURLToPath(new URL('../public/content', import.meta.url))

const { roadmaps, subjects, errors } = loadRoadmaps(root)
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`)
  console.error(`\n${errors.length} errors; run \`npm run validate\` for details. Not building.`)
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// Milestones and their direct steps, without text: enough for the home page
// to draw a thumbnail of the roadmap's real shape. [id, type, side] per step.
const shape = doc => doc.topics.map(t => ({
  id: t.id,
  steps: (t.children || []).map(c => [c.id, c.type || 'core', c.side || 'auto']),
}))

const index = []
for (const r of roadmaps) {
  const { doc, meta, slug, nodeCount } = r
  writeFileSync(join(out, `${slug}.json`), JSON.stringify({ slug, meta, nodeCount, doc }))
  if (r.images.length) cpSync(join(root, slug, 'images'), join(out, slug, 'images'), { recursive: true })
  index.push({
    slug,
    title: doc.title,
    subtitle: doc.subtitle || '',
    updated: doc.updated || doc.changelog?.[0]?.date || '',
    nodeCount,
    milestones: doc.topics.length,
    shape: shape(doc),
    ...meta,
  })
}
index.sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.title.localeCompare(b.title))
writeFileSync(join(out, 'index.json'), JSON.stringify(index))
writeFileSync(join(out, 'subjects.json'), JSON.stringify(subjects.map(s => ({ ...s, count: index.filter(r => r.subject === s.id).length }))))

writeFileSync(join(out, 'requests.json'), JSON.stringify(await requests()))
console.log(`content: ${index.length} roadmaps written to site/public/content`)

/**
 * Open "Propose a roadmap" issues, most thumbs-up first. The site build runs
 * daily (site.yml), so this stays fresh without readers calling the GitHub
 * API, which allows only 60 anonymous requests an hour.
 */
async function requests() {
  const repo = process.env.GITHUB_REPOSITORY
    || (process.env.VITE_REPO_URL || 'https://github.com/vijayanandraj/waymark').replace(/^https:\/\/github\.com\//, '')
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'openroadmap-build' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues?labels=new-roadmap&state=open&per_page=100`,
      { headers, signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const issues = await res.json()
    // Issue forms render each field as "### <label>\n\n<answer>".
    const field = (body, label) => {
      const m = new RegExp(`### ${label}\\s*\\n+([^\\n]+)`).exec(body || '')
      return m && m[1].trim() !== '_No response_' ? m[1].trim() : ''
    }
    return issues.filter(i => !i.pull_request).map(i => ({
      title: field(i.body, 'Subject') || i.title,
      audience: field(i.body, 'Who is it for\\?'),
      writing: field(i.body, 'Will you write it\\?').startsWith('Yes'),
      votes: i.reactions?.['+1'] || 0,
      url: i.html_url,
    })).sort((a, b) => b.votes - a.votes).slice(0, 6)
  } catch (e) {
    console.log(`content: no roadmap requests (${e.message})`)
    return []
  }
}
