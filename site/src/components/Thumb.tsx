import { useMemo } from 'react'
import { layout } from '../lib/layout'
import type { CatalogEntry, Progress, RNode } from '../lib/types'

/**
 * A wordless picture of a roadmap: its milestones and their steps, laid out
 * by the same engine as the reader so it has the roadmap's real shape. Steps
 * the reader has finished are filled in. Crops to the top when the box is
 * shorter than the roadmap.
 */
export default function Thumb({ shape, progress = {}, highlight, className = 'thumb', fit = false }: {
  shape: CatalogEntry['shape']
  progress?: Progress
  highlight?: string
  className?: string
  /** Show the whole roadmap instead of cropping to the top. */
  fit?: boolean
}) {
  const lay = useMemo(() => {
    const leaf = (id: string, type: RNode['type'], side: RNode['side']): RNode => ({ id, label: '', type, side, links: [], children: [] })
    const topics = shape.map(m => ({ ...leaf(m.id, undefined, undefined), children: m.steps.map(([id, t, s]) => leaf(id, t, s)) }))
    return layout({ title: '', subtitle: '', topics }, () => false)
  }, [shape])

  return (
    <svg className={className} viewBox={`0 0 ${lay.W} ${lay.H}`} preserveAspectRatio={fit ? 'xMidYMid meet' : 'xMidYMin slice'} aria-hidden="true">
      {lay.spine && <line x1={lay.spine.x} x2={lay.spine.x} y1={lay.spine.y1} y2={lay.spine.y2} className="t-spine" />}
      {lay.edges.map((e, i) => <path key={i} d={e.d} className={'t-edge' + (e.dashed ? ' dash' : '')} />)}
      {lay.nodes.map(n => {
        const st = progress[n.id]
        const cls = n.kind === 'topic' ? 't-topic' : `t-${n.type}` + (st ? ` t-${st}` : '') + (n.id === highlight ? ' t-hl' : '')
        return <rect key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} rx={n.kind === 'topic' ? 8 : 6} className={cls} />
      })}
    </svg>
  )
}
