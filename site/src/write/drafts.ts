import { fetchImage, loadRoadmapRaw } from '../lib/content'
import { genId } from '../lib/layout'
import { LICENSE, checkDoc, checkMeta, slugify } from '../lib/rules.mjs'
import type { Meta, RNode, RoadmapDoc } from '../lib/types'
import { blobToDataUri, dataUriToBlob, extFor, imageName, referencedImages, shrink } from './images'
import { type Draft, type DraftMeta, newDraftId, putDraft, putImage } from './store'
import { makeZip } from './zip'

export const today = () => new Date().toISOString().slice(0, 10)

/** Accept anything shaped like the builder format and fill in the blanks. */
export function coerceDoc(s: unknown): RoadmapDoc {
  const o = (s && typeof s === 'object' ? s : {}) as Partial<RoadmapDoc>
  const fill = (arr: RNode[] | undefined): RNode[] => (Array.isArray(arr) ? arr : []).map(n => ({
    ...n, id: n.id || genId(), label: n.label || '', links: Array.isArray(n.links) ? n.links : [], children: fill(n.children),
  }))
  return { title: o.title || '', subtitle: o.subtitle || '', updated: o.updated, changelog: Array.isArray(o.changelog) ? o.changelog : [], topics: fill(o.topics) }
}

const blankMeta = (): DraftMeta => ({ audience: '', lang: 'en', tags: [], authors: [{ name: '' }] })

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
    meta: { audience: f.meta.audience, level: f.meta.level, lang: f.meta.lang, tags: [...f.meta.tags], authors: f.meta.authors.map(a => ({ ...a })) },
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

/** meta.json as it will be written to the repository. */
export function toMeta(m: DraftMeta): Meta {
  const out: Meta = {
    audience: m.audience.trim(),
    lang: m.lang,
    tags: m.tags,
    authors: m.authors.map(a => (a.url?.trim() ? { name: a.name.trim(), url: a.url.trim() } : { name: a.name.trim() })),
    license: LICENSE,
  }
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
export function checkDraft(d: Draft, imageNames: Set<string>): CheckResult {
  const res: CheckResult = { errors: [], warnings: [] }
  const report = {
    error: (msg: string, nodeId?: string, short?: string) => res.errors.push({ msg, nodeId, short }),
    warn: (msg: string, nodeId?: string, short?: string) => res.warnings.push({ msg, nodeId, short }),
  }
  checkDoc(d.doc, 'Roadmap', imageNames, report)
  checkMeta(toMeta(d.meta), 'Details', report)
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
