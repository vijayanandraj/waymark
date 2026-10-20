// Loads and validates every roadmap under roadmaps/<slug>/. Shared by
// validate.mjs (pull request checks) and build-content.mjs (site build).
// Standard library only, so the check runs without `npm install`. The rules
// themselves live in src/lib/rules.mjs, which the editor also uses.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { IMAGE_FILE_RE, MAX_IMAGE_BYTES, SLUG_RE, checkDoc, checkMeta, checkSubjects } from '../src/lib/rules.mjs'

function readJSON(file, label, report) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    report.error(`${label}: ${e.code === 'ENOENT' ? 'missing' : 'not valid JSON (' + e.message + ')'}`)
    return undefined
  }
}

function listImages(dir, slug, report) {
  const files = new Set()
  if (!existsSync(dir)) return files
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (!IMAGE_FILE_RE.test(f)) { report.error(`roadmaps/${slug}/images/${f}: name must be lowercase letters, digits, . _ - with a png, jpg, webp or gif extension`); continue }
    const size = statSync(p).size
    if (size > MAX_IMAGE_BYTES) report.error(`roadmaps/${slug}/images/${f}: ${Math.round(size / 1024)} KB is over the ${MAX_IMAGE_BYTES / 1024} KB limit; crop or compress it`)
    files.add(f)
  }
  return files
}

/**
 * Validates every roadmap in `root`, and the subject list they pick from, and
 * returns them with all problems found. A roadmap with errors is still
 * returned, flagged `ok: false`.
 */
export function loadRoadmaps(root) {
  const errors = []
  const warnings = []
  const roadmaps = []
  const top = { error: m => errors.push(m), warn: m => warnings.push(m) }
  const subjects = readJSON(join(root, 'subjects.json'), 'roadmaps/subjects.json', top) ?? []
  const subjectIds = checkSubjects(subjects, 'roadmaps/subjects.json', top)
  for (const slug of readdirSync(root).sort()) {
    const dir = join(root, slug)
    if (!statSync(dir).isDirectory()) continue
    const before = errors.length
    const report = { error: m => errors.push(m), warn: m => warnings.push(m) }
    if (!SLUG_RE.test(slug) || slug.length > 80)
      report.error(`roadmaps/${slug}: folder name must be lowercase words joined by hyphens, e.g. cbse-class-9-maths`)
    for (const f of readdirSync(dir))
      if (!['roadmap.json', 'meta.json', 'images'].includes(f)) report.error(`roadmaps/${slug}/${f}: unexpected file; a roadmap folder holds roadmap.json, meta.json and images/`)
    const imageFiles = listImages(join(dir, 'images'), slug, report)
    const doc = readJSON(join(dir, 'roadmap.json'), `roadmaps/${slug}/roadmap.json`, report)
    const meta = readJSON(join(dir, 'meta.json'), `roadmaps/${slug}/meta.json`, report)
    const nodeCount = doc === undefined ? 0 : checkDoc(doc, `roadmaps/${slug}/roadmap.json`, imageFiles, report)
    if (meta !== undefined) checkMeta(meta, `roadmaps/${slug}/meta.json`, report, subjectIds)
    roadmaps.push({ slug, doc, meta, nodeCount, images: [...imageFiles], ok: errors.length === before })
  }
  return { roadmaps, subjects, errors, warnings }
}
