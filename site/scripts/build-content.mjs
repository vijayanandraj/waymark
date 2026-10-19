// Turns roadmaps/ into the static data the site fetches:
//
//   public/content/index.json             catalog for the browse page
//   public/content/<slug>.json            { slug, meta, nodeCount, doc }
//   public/content/<slug>/images/<file>   screenshots, copied as-is
//
// Refuses to build if any roadmap is invalid, so a broken main never deploys.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRoadmaps } from './roadmaps.mjs'

const root = fileURLToPath(new URL('../../roadmaps', import.meta.url))
const out = fileURLToPath(new URL('../public/content', import.meta.url))

const { roadmaps, errors } = loadRoadmaps(root)
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`)
  console.error(`\n${errors.length} errors; run \`npm run validate\` for details. Not building.`)
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

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
    ...meta,
  })
}
index.sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.title.localeCompare(b.title))
writeFileSync(join(out, 'index.json'), JSON.stringify(index))
console.log(`content: ${index.length} roadmaps written to site/public/content`)
