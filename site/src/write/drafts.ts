import { fetchImage, loadRoadmapRaw } from '../lib/content'
import { genId } from '../lib/layout'
import { LICENSE, MAX_IMAGE_BYTES, checkDoc, checkMeta, slugify } from '../lib/rules.mjs'
import type { Meta, RNode, RoadmapDoc } from '../lib/types'
import { blobToDataUri, dataUriToBlob, extFor, imageName, referencedImages, shrink } from './images'
import { type Draft, type DraftMeta, newDraftId, putDraft, putImage } from './store'
import { makeZip, readZip } from './zip'

export const today = () => new Date().toISOString().slice(0, 10)

/** Accept anything shaped like the builder format and fill in the blanks. */
export function coerceDoc(s: unknown): RoadmapDoc {
  const o = (s && typeof s === 'object' ? s : {}) as Partial<RoadmapDoc>
  const fill = (arr: RNode[] | undefined): RNode[] => (Array.isArray(arr) ? arr : []).map(n => ({
    ...n, id: n.id || genId(), label: n.label || '', links: Array.isArray(n.links) ? n.links : [], children: fill(n.children),
  }))
  return { title: o.title || '', subtitle: o.subtitle || '', updated: o.updated, changelog: Array.isArray(o.changelog) ? o.changelog : [], topics: fill(o.topics) }
}

const blankMeta = (): DraftMeta => ({ audience: '', stages: [], subject: '', lang: 'en', tags: [], authors: [{ name: '' }] })

/** A meta.json, as published or as found in a package, in the shape a draft keeps. */
export function draftMetaFrom(m: Partial<Meta>): DraftMeta {
  const authors = Array.isArray(m.authors) ? m.authors.map(a => ({ ...a })) : []
  return {
    audience: m.audience || '', stages: [...(m.stages || [])], subject: m.subject || '', follows: m.follows, level: m.level,
    lang: m.lang || 'en', tags: [...(m.tags || [])], authors: authors.length ? authors : [{ name: '' }],
  }
}

export async function createBlank(): Promise<Draft> {
  const now = Date.now()
  const d: Draft = { id: newDraftId(), doc: { title: '', subtitle: '', changelog: [], topics: [] }, meta: blankMeta(), slug: '', createdAt: now, updatedAt: now }
  await putDraft(d)
  return d
}

/**
 * Starts a draft from a published roadmap, copying its images into the draft
 * so it keeps working offline and exports exactly what will be submitted.
 */
export async function createFromPublished(slug: string): Promise<Draft> {
  const f = await loadRoadmapRaw(slug)
  const now = Date.now()
  const d: Draft = {
    id: newDraftId(), doc: coerceDoc(f.doc), slug,
    meta: draftMetaFrom(f.meta),
    base: { slug, updated: f.doc.updated || '' }, createdAt: now, updatedAt: now,
  }
  for (const name of referencedImages(d.doc)) await putImage(d.id, name, await fetchImage(slug, name))
  await putDraft(d)
  return d
}

/**
 * Moves inline data: images (as the offline builder exports them) into the
 * draft's image store and rewrites their src to images/<file>. Returns how
 * many were moved.
 */
export async function extractInlineImages(draftId: string, doc: RoadmapDoc): Promise<number> {
  let n = 0
  const walk = async (node: RNode) => {
    for (const im of node.images || []) {
      if (!im.src.startsWith('data:')) continue
      let blob = await dataUriToBlob(im.src)
      const ext = extFor(blob.type)
      if (!ext || blob.size > 500 * 1024) blob = await shrink(blob)
      const name = imageName(extFor(blob.type) || 'jpg')
      await putImage(draftId, name, blob)
      im.src = 'images/' + name
      n++
    }
    for (const c of node.children || []) await walk(c)
  }
  for (const t of doc.topics) await walk(t)
  return n
}

/** Creates a draft from a builder JSON file (inline images included). */
export async function createFromJson(text: string): Promise<Draft> {
  const doc = coerceDoc(JSON.parse(text))
  const d: Draft = { id: newDraftId(), doc, meta: blankMeta(), slug: slugify(doc.title), createdAt: Date.now(), updatedAt: Date.now() }
  await extractInlineImages(d.id, doc)
  await putDraft(d)
  return d
}

/** A .zip by name, or a file whose bytes start like one whatever it is called. */
export async function isZipFile(f: File): Promise<boolean> {
  if (/\.zip$/i.test(f.name)) return true
  const b = new Uint8Array(await f.slice(0, 4).arrayBuffer())
  return b.length === 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6)
}

export interface PackageImport {
  doc: RoadmapDoc
  /** From meta.json, when the package has one. */
  meta?: DraftMeta
  /** The folder holding roadmap.json, e.g. "cbse-class-9-circles"; empty when it sits at the top of the zip. */
  folder: string
  /** Pictures now in the draft's image store, from images/ and inline data: URIs. */
  pictures: number
  /** Toast text, e.g. "Imported, with 10 pictures." */
  message: string
}

const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Reads a package zip (roadmap.json, meta.json, images/) into the draft's
 * image store and returns the document. roadmap.json may sit at the top of
 * the zip, one folder down (the roadmap's folder zipped again), or under
 * roadmaps/<slug>/ as the package download writes it. Nothing is stored
 * until every check passes.
 */
export async function importPackage(draftId: string, data: ArrayBuffer): Promise<PackageImport> {
  const entries = await readZip(data)
  const roots = entries.map(e => e.name.match(/^((?:roadmaps\/)?[^/]+\/)?roadmap\.json$/)).filter(m => m !== null).map(m => m[1] || '')
  if (!roots.length) throw new Error('the zip has no roadmap.json; it needs roadmap.json, meta.json and an images/ folder')
  if (roots.length > 1) throw new Error(`the zip holds ${roots.length} roadmaps (${roots.map(r => r + 'roadmap.json').join(', ')}); zip one at a time`)
  const root = roots[0]
  const file = (name: string) => entries.find(e => e.name === root + name)
  const dec = new TextDecoder()

  let doc: RoadmapDoc
  try { doc = coerceDoc(JSON.parse(dec.decode(file('roadmap.json')!.data))) } catch (e) { throw new Error('roadmap.json is not valid JSON: ' + (e as Error).message) }
  let meta: DraftMeta | undefined
  const metaFile = file('meta.json')
  if (metaFile) {
    try { meta = draftMetaFrom(JSON.parse(dec.decode(metaFile.data))) } catch (e) { throw new Error('meta.json is not valid JSON: ' + (e as Error).message) }
  }

  const inZip = new Map<string, Uint8Array>()
  for (const e of entries) {
    const m = e.name.startsWith(root + 'images/') && e.name.slice(root.length + 7)
    if (m && !m.includes('/')) inZip.set(m, e.data)
  }
  const used = referencedImages(doc)
  const missing = [...used].filter(n => !inZip.has(n))
  if (missing.length) {
    const more = missing.length > 5 ? ` and ${missing.length - 5} more` : ''
    throw new Error(`roadmap.json uses ${plural(missing.length, 'picture')} that the zip does not have: ${missing.slice(0, 5).join(', ')}${more}`)
  }
  const unused = [...inZip.keys()].filter(n => !used.has(n))

  // Resize anything over the limit, as pasted screenshots are. It comes back as a
  // JPEG, so it gets a .jpg name and the steps that show it are pointed there.
  const store = new Map<string, Blob>()
  const renamed = new Map<string, string>()
  for (const name of [...used].sort()) {
    const ext = name.split('.').pop()!.toLowerCase()
    let blob = new Blob([inZip.get(name)! as BlobPart], { type: IMAGE_TYPES[ext] || 'application/octet-stream' })
    let as = name
    if (blob.size > MAX_IMAGE_BYTES) {
      try { blob = await shrink(blob) } catch { throw new Error(`images/${name} is over ${MAX_IMAGE_BYTES / 1024} KB even after resizing; crop it and zip again`) }
      if (ext !== 'jpg' && ext !== 'jpeg') {
        as = name.replace(/\.[^.]+$/, '.jpg')
        if (used.has(as) || store.has(as)) as = imageName('jpg')
        renamed.set(name, as)
      }
    }
    store.set(as, blob)
  }
  if (renamed.size) {
    const walk = (n: RNode) => {
      for (const im of n.images || []) { const to = renamed.get(im.src.slice(7)); if (im.src.startsWith('images/') && to) im.src = 'images/' + to }
      for (const c of n.children || []) walk(c)
    }
    doc.topics.forEach(walk)
  }

  for (const [name, blob] of store) await putImage(draftId, name, blob)
  const pictures = store.size + await extractInlineImages(draftId, doc)
  let message = pictures ? `Imported, with ${plural(pictures, 'picture')}.` : 'Imported.'
  if (unused.length) message += ` Skipped ${plural(unused.length, 'picture')} no step uses: ${unused.slice(0, 5).join(', ')}${unused.length > 5 ? '…' : ''}.`
  return { doc, meta, folder: root.replace(/^roadmaps\//, '').replace(/\/$/, ''), pictures, message }
}

/** Creates a draft from a package zip. */
export async function createFromZip(file: Blob): Promise<{ draft: Draft; message: string }> {
  const id = newDraftId()
  const pkg = await importPackage(id, await file.arrayBuffer())
  const now = Date.now()
  const slug = pkg.folder && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(pkg.folder) ? pkg.folder : slugify(pkg.doc.title)
  const d: Draft = { id, doc: pkg.doc, meta: pkg.meta || blankMeta(), slug, createdAt: now, updatedAt: now }
  await putDraft(d)
  return { draft: d, message: pkg.message }
}

/** meta.json as it will be written to the repository. */
export function toMeta(m: DraftMeta): Meta {
  const out: Meta = {
    audience: m.audience.trim(),
    stages: m.stages || [],
    subject: m.subject || '',
    lang: m.lang,
    tags: m.tags,
    authors: m.authors.map(a => (a.url?.trim() ? { name: a.name.trim(), url: a.url.trim() } : { name: a.name.trim() })),
    license: LICENSE,
  }
  if (m.follows?.trim()) out.follows = m.follows.trim()
  if (m.level) out.level = m.level
  return out
}

export function parseTags(s: string): string[] {
  return [...new Set(s.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))]
}

/** short is the message without the "Roadmap > milestone > step:" path. */
export interface Problem { msg: string; nodeId?: string; short?: string }
export interface CheckResult { errors: Problem[]; warnings: Problem[] }

/** The same checks the pull request runs, against the draft in this browser. */
export function checkDraft(d: Draft, imageNames: Set<string>, subjectIds?: Set<string>): CheckResult {
  const res: CheckResult = { errors: [], warnings: [] }
  const report = {
    error: (msg: string, nodeId?: string, short?: string) => res.errors.push({ msg, nodeId, short }),
    warn: (msg: string, nodeId?: string, short?: string) => res.warnings.push({ msg, nodeId, short }),
  }
  checkDoc(d.doc, 'Roadmap', imageNames, report)
  checkMeta(toMeta(d.meta), 'Details', report, subjectIds)
  if (!d.base && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug))
    report.error('Details: the web address needs lowercase words joined by hyphens, e.g. cbse-class-9-maths')
  return res
}

function cleanDoc(doc: RoadmapDoc): RoadmapDoc {
  return JSON.parse(JSON.stringify(doc)) // drops undefined fields
}

/**
 * The contribution package: a zip holding roadmaps/<slug>/ exactly as it will
 * sit in the repository.
 */
export async function exportPackage(d: Draft, images: Map<string, Blob>): Promise<Blob> {
  const enc = new TextEncoder()
  const dir = `roadmaps/${d.slug}/`
  const entries = [
    { name: dir + 'roadmap.json', data: enc.encode(JSON.stringify(cleanDoc(d.doc), null, 2) + '\n') },
    { name: dir + 'meta.json', data: enc.encode(JSON.stringify(toMeta(d.meta), null, 2) + '\n') },
  ]
  for (const name of [...referencedImages(d.doc)].sort()) {
    const b = images.get(name)
    if (b) entries.push({ name: dir + 'images/' + name, data: new Uint8Array(await b.arrayBuffer()) })
  }
  return makeZip(entries)
}

/** A single JSON file with images inlined, for the offline builder. */
export async function exportInline(d: Draft, images: Map<string, Blob>): Promise<Blob> {
  const doc = cleanDoc(d.doc)
  const walk = async (n: RNode) => {
    for (const im of n.images || []) {
      const b = im.src.startsWith('images/') ? images.get(im.src.slice(7)) : undefined
      if (b) im.src = await blobToDataUri(b)
    }
    for (const c of n.children || []) await walk(c)
  }
  for (const t of doc.topics) await walk(t)
  return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
}

export function saveAs(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
