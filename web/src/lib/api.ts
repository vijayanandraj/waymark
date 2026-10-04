import type { Progress, PublicSettings, Revision, Roadmap, RoadmapDoc, Settings, User } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(method: string, url: string, body?: unknown, raw?: BodyInit): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} }
  if (raw) init.body = raw
  else if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* non-json */ }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data) ? String((data as { error: string }).error) : res.statusText
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const api = {
  settings: () => req<PublicSettings>('GET', '/api/settings'),
  me: () => req<{ user: User | null }>('GET', '/api/auth/me'),
  register: (email: string, name: string, password: string) => req<User>('POST', '/api/auth/register', { email, name, password }),
  login: (email: string, password: string) => req<User>('POST', '/api/auth/login', { email, password }),
  logout: () => req<void>('POST', '/api/auth/logout'),

  listRoadmaps: (q = '', tag = '') => req<Roadmap[]>('GET', `/api/roadmaps?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}`),
  myRoadmaps: () => req<Roadmap[]>('GET', '/api/me/roadmaps'),
  roadmapBySlug: (slug: string) => req<Roadmap>('GET', `/api/roadmaps/${encodeURIComponent(slug)}`),
  roadmapById: (id: string) => req<Roadmap>('GET', `/api/r/${id}`),
  createRoadmap: (title: string, subtitle = '', tags: string[] = []) => req<Roadmap>('POST', '/api/roadmaps', { title, subtitle, tags }),
  importRoadmap: (doc: RoadmapDoc) => req<Roadmap>('POST', '/api/roadmaps/import', doc),
  updateRoadmap: (id: string, patch: { title?: string; subtitle?: string; tags?: string[]; slug?: string; content?: RoadmapDoc; note?: string; autosave?: boolean }) =>
    req<Roadmap>('PUT', `/api/r/${id}`, patch),
  deleteRoadmap: (id: string) => req<void>('DELETE', `/api/r/${id}`),
  submit: (id: string) => req<Roadmap>('POST', `/api/r/${id}/submit`),
  publish: (id: string) => req<Roadmap>('POST', `/api/r/${id}/publish`),
  unpublish: (id: string) => req<Roadmap>('POST', `/api/r/${id}/unpublish`),
  reject: (id: string, note: string) => req<Roadmap>('POST', `/api/r/${id}/reject`, { note }),
  revisions: (id: string) => req<Revision[]>('GET', `/api/r/${id}/revisions`),
  revision: (id: string, n: number) => req<Revision & { content: RoadmapDoc }>('GET', `/api/r/${id}/revisions/${n}`),
  exportUrl: (slug: string, inline: boolean) => `/api/roadmaps/${encodeURIComponent(slug)}/export${inline ? '?inline=1' : ''}`,

  progress: (id: string) => req<Progress>('GET', `/api/r/${id}/progress`),
  setProgress: (id: string, p: Progress) => req<Progress>('PUT', `/api/r/${id}/progress`, p),

  uploadImage: (blob: Blob) => {
    const fd = new FormData()
    fd.append('file', blob, 'image')
    return req<{ url: string }>('POST', '/api/images', undefined, fd)
  },

  reviewQueue: () => req<Roadmap[]>('GET', '/api/admin/review'),
  users: () => req<User[]>('GET', '/api/admin/users'),
  setRole: (id: string, role: 'admin' | 'member') => req<User>('PUT', `/api/admin/users/${id}/role`, { role }),
  adminSettings: () => req<Settings>('GET', '/api/admin/settings'),
  saveSettings: (s: Settings) => req<Settings>('PUT', '/api/admin/settings', s),
}
