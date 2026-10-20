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
  /** ids from STAGES in rules.mjs */
  stages: string[]
  /** id from roadmaps/subjects.json */
  subject: string
  /** The syllabus or exam it follows, e.g. "CBSE Class 9 Mathematics". */
  follows?: string
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
  /** Milestones and their direct steps, [id, type, side], for thumbnails. */
  shape: { id: string; steps: [string, NodeType, Side][] }[]
}

/** content/subjects.json */
export interface Subject { id: string; name: string; icon: string; about: string; count: number }

/** content/requests.json: open "Propose a roadmap" issues. */
export interface RoadmapRequest { title: string; audience: string; writing: boolean; votes: number; url: string }

/** content/<slug>.json */
export interface RoadmapFile {
  slug: string
  meta: Meta
  nodeCount: number
  doc: RoadmapDoc
}

export type Progress = Record<string, Status>
