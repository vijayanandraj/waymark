// Runs after `vite build`. GitHub Pages serves files, not routes, so this
// writes a real page for every roadmap (dist/r/<slug>/index.html) with its own
// title, description and a plain-HTML outline. Search engines and link
// previews get real content, and readers without JavaScript still see the
// steps and links. URLs end in "/" so Pages serves them without a redirect.
// dist/404.html catches any other route for the SPA.
//
// SITE_URL (e.g. https://user.github.io/openroadmap) enables canonical links,
// sitemap.xml and robots.txt; without it they are skipped.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist', import.meta.url))
const shell = readFileSync(join(dist, 'index.html'), 'utf8')
const index = JSON.parse(readFileSync(join(dist, 'content', 'index.json'), 'utf8'))
const site = (process.env.SITE_URL || '').replace(/\/$/, '')

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function outline(nodes) {
  if (!nodes?.length) return ''
  return '<ul>' + nodes.map(n => {
    const links = (n.links || []).filter(l => /^https?:\/\//i.test(l.url))
      .map(l => `<a href="${esc(l.url)}" rel="noopener">${esc(l.label || l.url)}</a>`).join(', ')
    return `<li>${esc(n.label)}${links ? ' (' + links + ')' : ''}${outline(n.children)}</li>`
  }).join('') + '</ul>'
}

function page({ title, description, path, body }) {
  let head = `<meta property="og:title" content="${esc(title)}" />\n    <meta property="og:description" content="${esc(description)}" />`
  if (site) head += `\n    <link rel="canonical" href="${esc(site + path)}" />\n    <meta property="og:url" content="${esc(site + path)}" />`
  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(description)}" />`)
    .replace('<!--prerender:head-->', head)
    .replace('<!--prerender:body-->', body ? `<noscript>${body}</noscript>` : '')
}

for (const r of index) {
  const { doc, meta } = JSON.parse(readFileSync(join(dist, 'content', `${r.slug}.json`), 'utf8'))
  const description = [doc.subtitle, `For ${meta.audience}.`].filter(Boolean).join(' ')
  const body = `<main class="page"><h1>${esc(doc.title)}</h1><p>${esc(description)}</p>${outline(doc.topics)}</main>`
  const dir = join(dist, 'r', r.slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), page({ title: `${doc.title} · Open Roadmap`, description, path: `/r/${r.slug}/`, body }))
}

const list = `<main class="page"><h1>Open Roadmap</h1><ul>${index.map(r => `<li>${esc(r.title)}: ${esc(r.subtitle)}</li>`).join('')}</ul></main>`
writeFileSync(join(dist, 'index.html'), page({ title: 'Open Roadmap', description: 'Free, community-built learning roadmaps for anyone: what to learn, in what order, and where to learn it.', path: '/', body: list }))
mkdirSync(join(dist, 'about'), { recursive: true })
writeFileSync(join(dist, 'about', 'index.html'), page({ title: 'About · Open Roadmap', description: 'What Open Roadmap is, how your progress is stored, and how to write a roadmap.', path: '/about/', body: '' }))
mkdirSync(join(dist, 'write'), { recursive: true })
writeFileSync(join(dist, 'write', 'index.html'), page({ title: 'Write a roadmap · Open Roadmap', description: 'Write or improve a learning roadmap in your browser. No account needed.', path: '/write/', body: '' }))
writeFileSync(join(dist, '404.html'), page({ title: 'Open Roadmap', description: 'Free, community-built learning roadmaps.', path: '/', body: '' }))

if (site) {
  const urls = ['/', '/about/', '/write/', ...index.map(r => `/r/${r.slug}/`)]
  writeFileSync(join(dist, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u => `  <url><loc>${esc(site + u)}</loc></url>`).join('\n') + '\n</urlset>\n')
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`)
}
console.log(`prerender: ${index.length} roadmap pages${site ? ', sitemap.xml' : ''}`)
