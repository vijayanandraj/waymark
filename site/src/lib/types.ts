// The roadmap document format (roadmaps/<slug>/roadmap.json), shared with the
// offline builder and selfhost/. Additive changes only.

export type NodeType = 'core' | 'alt' | 'optional'
export type Side = 'auto' | 'left' | 'right'
export type Status = '' | 'prog' | 'done'

export interface Link { label: string; url: string }
export interface FAQ { q: string; a: string }
export interface Image { src: string; caption?: string }

export interface RNode {
  id: string
  label: string
  type?: NodeType
  side?: Side
  desc?: string
  links: Link[]
  faq?: FAQ[]
  images?: Image[]
  children: RNode[]
}

export interface ChangelogEntry { date: string; text: string }

export interface RoadmapDoc {
  title: string
  subtitle: string
  updated?: string
  changelog?: ChangelogEntry[]
  topics: RNode[]
}

// roadmaps/<slug>/meta.json
export interface Author { name: string; url?: string }
export type Level = 'beginner' | 'intermediate' | 'advanced' | 'all'

export interface Meta {
  audience: string
  level?: Level
  lang: string
  tags: string[]
  authors: Author[]
  license: string
}

/** One entry of content/index.json, written by scripts/build-content.mjs. */
export interface CatalogEntry extends Meta {
  slug: string
  title: string
  subtitle: string
  updated: string
  nodeCount: number
  milestones: number
}

/** content/<slug>.json */
export interface RoadmapFile {
  slug: string
  meta: Meta
  nodeCount: number
  doc: RoadmapDoc
}

export type Progress = Record<string, Status>
