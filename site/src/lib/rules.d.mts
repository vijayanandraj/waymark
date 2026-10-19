export interface Report {
  error(msg: string, nodeId?: string, short?: string): void
  warn(msg: string, nodeId?: string, short?: string): void
}

export const MAX_DEPTH: number
export const MAX_NODES: number
export const MAX_IMAGE_BYTES: number
export const LICENSE: string
export const LEVELS: string[]
export const SLUG_RE: RegExp
export const IMAGE_FILE_RE: RegExp
export const META_KEYS: Set<string>

export function slugify(s: string): string
export function checkMeta(meta: unknown, where: string, report: Report): void
export function checkDoc(doc: unknown, where: string, imageFiles: Set<string>, report: Report): number
