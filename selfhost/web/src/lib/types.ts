// Mirrors server/internal/content and server/internal/model.

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

export type RoadmapStatus = 'draft' | 'review' | 'published'

export interface Roadmap {
  id: string
  slug: string
  title: string
  subtitle: string
  tags: string[]
  ownerId: string
  ownerName?: string
  status: RoadmapStatus
  reviewNote?: string
  revision: number
  nodeCount: number
  content?: RoadmapDoc
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

export interface Revision {
  roadmapId: string
  n: number
  note: string
  authorId: string
  createdAt: string
}

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  createdAt: string
}

export interface PublicSettings {
  siteName: string
  tagline: string
  openSignup: boolean
  requireReview: boolean
  needsSetup: boolean
}

export interface Settings {
  siteName: string
  tagline: string
  openSignup: boolean
  requireReview: boolean
}

export type Progress = Record<string, Status>

export const MAX_DEPTH = 4
