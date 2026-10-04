// Pure layout engine: turns a roadmap tree into positioned nodes and bezier
// edges around a central spine. Ported unchanged in behaviour from the
// original single-file builder so existing roadmaps look identical.
import type { RNode, RoadmapDoc } from './types'

export interface LNode {
  id: string
  kind: 'topic' | 'child'
  type: string
  x: number; y: number; w: number; h: number
  cx: number; cy: number
  side?: 'left' | 'right'
  toggle: { open: boolean; count: number } | null
  label: string
  ref: RNode
}
export interface LEdge { d: string; dashed: boolean }
export interface Layout {
  nodes: LNode[]
  edges: LEdge[]
  spine: { x: number; y1: number; y2: number } | null
  W: number
  H: number
}

const topicW = 250, gapY = 14, blockGap = 48, lineH = 19, padY = 9
const colGap0 = 60, colGap = 55
const colW = (d: number) => Math.max(160, 215 - (d - 1) * 15)

let ctx: CanvasRenderingContext2D | null = null
function measurer(): CanvasRenderingContext2D | null {
  if (ctx) return ctx
  ctx = document.createElement('canvas').getContext('2d')
  return ctx
}

function wrap(text: string, maxW: number, font: string): string[] {
  const c = measurer()
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!c) return [words.join(' ')]
  c.font = font
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (c.measureText(t).width <= maxW || !cur) cur = t
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

function measure(label: string, w: number, bold: boolean): number {
  const lines = wrap(label, w - 26, (bold ? '700 14px ' : '600 13px ') + 'sans-serif')
  return lines.length * lineH + padY * 2
}

function bez(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

interface Block { k: RNode; d: number; kh: number; kids: Block[]; kidsTotal: number; toggle: LNode['toggle']; h: number }

/**
 * @param expandedFn decides whether a node's children (at depth >= 2) are
 * shown. A milestone's direct subtopics are always visible.
 */
export function layout(data: RoadmapDoc, expandedFn?: (n: RNode) => boolean): Layout {
  const topics = data.topics || []

  const showKids = (k: RNode, d: number): boolean => {
    if (!(k.children || []).length) return false
    if (d < 1) return true
    return expandedFn ? !!expandedFn(k) : true
  }
  const subDepth = (list: RNode[] | undefined, d: number): number => {
    if (!list || !list.length) return 0
    let m = 1
    for (const k of list) if (showKids(k, d)) m = Math.max(m, 1 + subDepth(k.children, d + 1))
    return m
  }
  let maxD = 0
  for (const t of topics) maxD = Math.max(maxD, subDepth(t.children, 1))

  const off: number[] = [0]
  let acc = topicW / 2 + colGap0
  for (let d = 1; d <= maxD; d++) { off[d] = acc; acc += colW(d) + colGap }
  const half = maxD ? off[maxD] + colW(maxD) + 40 : topicW / 2 + 40
  const W = Math.round(half * 2), spineX = half

  const nodes: LNode[] = [], edges: LEdge[] = []
  let y = 24

  const buildBlock = (k: RNode, d: number): Block => {
    const kh = measure(k.label || 'Untitled', colW(d), false)
    const open = showKids(k, d)
    const kids = open ? (k.children || []).map(x => buildBlock(x, d + 1)) : []
    const kidsTotal = kids.reduce((a, b) => a + b.h, 0) + Math.max(0, kids.length - 1) * gapY
    const toggle = (d >= 1 && (k.children || []).length) ? { open, count: k.children.length } : null
    return { k, d, kh, kids, kidsTotal, toggle, h: Math.max(kh, kidsTotal) }
  }

  const placeBlock = (b: Block, sy: number, isLeft: boolean, parentEdgeX: number, parentCy: number) => {
    const cy2 = sy + b.h / 2
    const w = colW(b.d)
    const x = isLeft ? spineX - off[b.d] - w : spineX + off[b.d]
    nodes.push({
      id: b.k.id, kind: 'child', type: b.k.type || 'core', x, y: cy2 - b.kh / 2, w, h: b.kh,
      cx: x + w / 2, cy: cy2, side: isLeft ? 'left' : 'right', toggle: b.toggle,
      label: b.k.label || 'Untitled', ref: b.k,
    })
    edges.push({ d: bez(parentEdgeX, parentCy, isLeft ? x + w : x, cy2), dashed: b.k.type === 'optional' })
    let gy = cy2 - b.kidsTotal / 2
    const outerX = isLeft ? x : x + w
    for (const kb of b.kids) { placeBlock(kb, gy, isLeft, outerX, cy2); gy += kb.h + gapY }
  }

  for (const t of topics) {
    const th = measure(t.label || 'Untitled', topicW, true)
    const left: RNode[] = [], right: RNode[] = []
    ;(t.children || []).forEach((k, i) => {
      const side = k.side && k.side !== 'auto' ? k.side : (i % 2 === 0 ? 'right' : 'left')
      ;(side === 'left' ? left : right).push(k)
    })
    const L = left.map(k => buildBlock(k, 1)), R = right.map(k => buildBlock(k, 1))
    const total = (bs: Block[]) => bs.reduce((a, b) => a + b.h, 0) + Math.max(0, bs.length - 1) * gapY
    const Lt = total(L), Rt = total(R)
    const blockH = Math.max(th, Lt, Rt)
    const cy = y + blockH / 2
    nodes.push({ id: t.id, kind: 'topic', type: 'topic', x: spineX - topicW / 2, y: cy - th / 2, w: topicW, h: th, cx: spineX, cy, toggle: null, label: t.label || 'Untitled', ref: t })
    const placeSide = (bs: Block[], tot: number, isLeft: boolean) => {
      let sy = y + (blockH - tot) / 2
      for (const b of bs) { placeBlock(b, sy, isLeft, isLeft ? spineX - topicW / 2 : spineX + topicW / 2, cy); sy += b.h + gapY }
    }
    placeSide(L, Lt, true)
    placeSide(R, Rt, false)
    y += blockH + blockGap
  }

  const topicNodes = nodes.filter(n => n.kind === 'topic')
  const spine = topicNodes.length > 1 ? { x: spineX, y1: topicNodes[0].cy, y2: topicNodes[topicNodes.length - 1].cy } : null
  return { nodes, edges, spine, W, H: Math.max(y - blockGap + 30, 120) }
}

/** Index every node by id, with its parent. */
export function indexTree(topics: RNode[]) {
  const byId: Record<string, RNode> = {}
  const parentOf: Record<string, RNode | null> = {}
  let total = 0
  const walk = (arr: RNode[], parent: RNode | null) => {
    for (const n of arr || []) { total++; byId[n.id] = n; parentOf[n.id] = parent; walk(n.children, n) }
  }
  walk(topics, null)
  return { byId, parentOf, total }
}

export function genId(): string {
  return 'n' + Math.random().toString(36).slice(2, 9)
}

export function slugify(s: string): string {
  return (s || 'roadmap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'roadmap'
}
