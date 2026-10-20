import type { Author, Level, RoadmapDoc } from '../lib/types'

// Drafts live only in this browser, in IndexedDB (ADR 0001). localStorage is
// too small once screenshots are involved. A draft's document is always in
// the repository format, with images referenced as "images/<file>", and the
// image bytes stored next to it, so exporting or submitting is a copy, not a
// conversion.

export interface DraftMeta {
  audience: string
  // Optional because drafts saved before these fields existed lack them.
  stages?: string[]
  subject?: string
  follows?: string
  level?: Level
  lang: string
  tags: string[]
  authors: Author[]
}

export interface Draft {
  id: string
  doc: RoadmapDoc
  meta: DraftMeta
  /** Proposed folder name for a new roadmap; fixed to base.slug when editing a published one. */
  slug: string
  /** Set when the draft started from a published roadmap. */
  base?: { slug: string; updated: string }
  createdAt: number
  updatedAt: number
}

interface ImageRow { key: string; draftId: string; name: string; blob: Blob }

// The project's working title; kept so drafts saved under it are not lost.
const DB_NAME = 'openroadmap'
let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const d = req.result
        d.createObjectStore('drafts', { keyPath: 'id' })
        d.createObjectStore('images', { keyPath: 'key' }).createIndex('draftId', 'draftId')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { dbp = null; reject(req.error) }
    })
  }
  return dbp
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function store(name: 'drafts' | 'images', mode: IDBTransactionMode = 'readonly') {
  return (await db()).transaction(name, mode).objectStore(name)
}

export async function listDrafts(): Promise<Draft[]> {
  const all = await done((await store('drafts')).getAll()) as Draft[]
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getDraft(id: string): Promise<Draft | undefined> {
  return await done((await store('drafts')).get(id)) as Draft | undefined
}

export async function putDraft(d: Draft): Promise<void> {
  await done((await store('drafts', 'readwrite')).put(d))
}

export async function deleteDraft(id: string): Promise<void> {
  const d = await db()
  const tx = d.transaction(['drafts', 'images'], 'readwrite')
  tx.objectStore('drafts').delete(id)
  const imgs = tx.objectStore('images')
  const keys = await done(imgs.index('draftId').getAllKeys(id))
  for (const k of keys) imgs.delete(k)
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
}

export async function putImage(draftId: string, name: string, blob: Blob): Promise<void> {
  const row: ImageRow = { key: `${draftId}/${name}`, draftId, name, blob }
  await done((await store('images', 'readwrite')).put(row))
}

export async function deleteImage(draftId: string, name: string): Promise<void> {
  await done((await store('images', 'readwrite')).delete(`${draftId}/${name}`))
}

export async function getImages(draftId: string): Promise<Map<string, Blob>> {
  const rows = await done((await store('images')).index('draftId').getAll(draftId)) as ImageRow[]
  return new Map(rows.map(r => [r.name, r.blob]))
}

/**
 * Asks the browser not to evict our data under storage pressure. Browsers may
 * say no; drafts still work, the Drafts page just suggests a backup.
 */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false } catch { return false }
}

export function newDraftId(): string {
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
