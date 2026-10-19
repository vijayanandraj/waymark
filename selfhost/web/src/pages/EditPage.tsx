import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Roadmap } from '../lib/types'
import Builder from '../builder/Builder'

export default function EditPage() {
  const { id = '' } = useParams()
  const [rm, setRm] = useState<Roadmap | null | undefined>(undefined)
  useEffect(() => { setRm(undefined); api.roadmapById(id).then(setRm).catch(() => setRm(null)) }, [id])
  if (rm === undefined) return <p className="hint page">Loading…</p>
  if (rm === null) return <div className="page"><h2>Not found</h2><p><Link to="/me">Back to my roadmaps</Link></p></div>
  return <Builder key={rm.id} roadmap={rm} />
}
