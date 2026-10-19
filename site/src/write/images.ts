import { MAX_IMAGE_BYTES } from '../lib/rules.mjs'
import type { RNode, RoadmapDoc } from '../lib/types'

/**
 * Turns a pasted or chosen image into a JPEG that fits the repository's size
 * limit: at most 1400 px on the long side, then lower quality and smaller
 * dimensions until it is under MAX_IMAGE_BYTES. A screenshot usually lands at
 * 100-250 KB on the first try.
 */
export async function shrink(blob: Blob): Promise<Blob> {
  const img = await loadImage(blob)
  const w = img.naturalWidth, h = img.naturalHeight
  if (blob.type === 'image/jpeg' && Math.max(w, h) <= 1400 && blob.size <= MAX_IMAGE_BYTES) return blob
  let max = 1400
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, max / Math.max(w, h))
    const out = await encode(img, Math.round(w * scale), Math.round(h * scale), attempt < 3 ? 0.85 - attempt * 0.1 : 0.65)
    if (out.size <= MAX_IMAGE_BYTES) return out
    if (attempt >= 2) max = Math.round(max * 0.75)
  }
  throw new Error('image is too large even after resizing; crop it first')
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')) }
    img.src = url
  })
}

function encode(img: HTMLImageElement, w: number, h: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#ffffff' // JPEG has no transparency
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    cv.toBlob(b => b ? resolve(b) : reject(new Error('could not encode the image')), 'image/jpeg', quality)
  })
}

/** A new file name that satisfies the repository's image naming rule. */
export function imageName(ext = 'jpg'): string {
  return `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`
}

export function extFor(type: string): string | null {
  return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[type] || null
}

/** Every images/<file> name the document references. */
export function referencedImages(doc: RoadmapDoc): Set<string> {
  const out = new Set<string>()
  const walk = (n: RNode) => {
    for (const im of n.images || []) if (im.src.startsWith('images/')) out.add(im.src.slice(7))
    for (const c of n.children || []) walk(c)
  }
  doc.topics.forEach(walk)
  return out
}

/** A copy of the document with images/<file> pointed at in-memory URLs, for display. */
export function withImageUrls(doc: RoadmapDoc, urls: Map<string, string>): RoadmapDoc {
  const fix = (n: RNode): RNode => ({
    ...n,
    images: n.images?.map(im => im.src.startsWith('images/') && urls.has(im.src.slice(7)) ? { ...im, src: urls.get(im.src.slice(7))! } : im),
    children: (n.children || []).map(fix),
  })
  return { ...doc, topics: doc.topics.map(fix) }
}

export function blobToDataUri(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })
}

export async function dataUriToBlob(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob()
}

export function fmtBytes(b: number): string {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB'
  return (b / (1024 * 1024)).toFixed(1) + ' MB'
}
