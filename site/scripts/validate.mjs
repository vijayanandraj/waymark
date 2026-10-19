// Validates every roadmap. Usage: node site/scripts/validate.mjs [roadmaps-dir]
// Exits 1 on any error. Warnings are printed but do not fail the check.

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { loadRoadmaps } from './roadmaps.mjs'

const root = resolve(process.argv[2] || fileURLToPath(new URL('../../roadmaps', import.meta.url)))
const { roadmaps, errors, warnings } = loadRoadmaps(root)
const gh = !!process.env.GITHUB_ACTIONS

// On GitHub Actions these become annotations on the pull request.
for (const w of warnings) console.log(gh ? `::warning::${w}` : `warning: ${w}`)
for (const e of errors) console.log(gh ? `::error::${e}` : `error: ${e}`)

const nodes = roadmaps.reduce((n, r) => n + r.nodeCount, 0)
console.log(`\n${roadmaps.length} roadmaps, ${nodes} nodes: ${errors.length} errors, ${warnings.length} warnings`)
process.exit(errors.length ? 1 : 0)
