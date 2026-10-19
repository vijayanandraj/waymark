import type { CatalogEntry, RNode, RoadmapFile } from './types'

const BASE = import.meta.env.BASE_URL

/** Where the repository lives; issue links and "edit on GitHub" point here. */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL || 'https://github.com/vijayanandraj/openroadmap'

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

export const loadCatalog = () => getJSON<CatalogEntry[]>('content/index.json')

/**
 * Loads one roadmap and points its relative image paths ("images/x.png", as
 * stored in the repo) at the copies the build published next to it.
 */
export async function loadRoadmap(slug: string): Promise<RoadmapFile> {
  const f = await loadRoadmapRaw(slug)
  const prefix = `${BASE}content/${slug}/`
  const fix = (n: RNode) => {
    for (const im of n.images || []) if (im.src.startsWith('images/')) im.src = prefix + im.src
    for (const c of n.children || []) fix(c)
  }
  f.doc.topics.forEach(fix)
  return f
}

/** One roadmap exactly as stored in the repository, images still relative. */
export const loadRoadmapRaw = (slug: string) => getJSON<RoadmapFile>(`content/${encodeURIComponent(slug)}.json`)

/** A published roadmap's image file. */
export async function fetchImage(slug: string, name: string): Promise<Blob> {
  const res = await fetch(`${BASE}content/${slug}/images/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`${res.status} ${name}`)
  return res.blob()
}

/** A prefilled "new issue" link for reporting a problem with a roadmap. */
export function issueUrl(slug: string, title: string, nodeLabel?: string): string {
  const where = nodeLabel ? `"${nodeLabel}" in ` : ''
  const p = new URLSearchParams({
    template: 'content-problem.yml',
    title: `[${slug}] `,
    roadmap: `${title} (${slug})`,
    where: where + location.href,
  })
  return `${REPO_URL}/issues/new?${p}`
}
