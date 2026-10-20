// The content rules for a roadmap: one copy, used by the pull request check
// (scripts/roadmaps.mjs, in Node) and by the editor's "Check" panel (in the
// browser), so authors see the same problems a reviewer's CI would.
// Plain JavaScript with no imports, so both can load it as-is.
//
// Strict on purpose: a submission should be fixed, not silently rewritten.
// Problems a reviewer should look at but that need not block are warnings.
// Reports about a node also carry its id and the message without the path,
// so the editor can jump to the node and show the problem next to it.

export const MAX_DEPTH = 4 // levels of subtopics under a milestone
export const MAX_NODES = 2000
export const MAX_IMAGE_BYTES = 500 * 1024
export const LICENSE = 'CC-BY-SA-4.0'
export const LEVELS = ['beginner', 'intermediate', 'advanced', 'all']
// Where the reader is in life. Fixed here, unlike subjects (roadmaps/subjects.json),
// because the home page is built around these few answers to "who are you?".
export const STAGES = [
  { id: 'school', label: 'In school' },
  { id: 'college', label: 'In college' },
  { id: 'early-career', label: 'Starting a career' },
  { id: 'professional', label: 'Working' },
  { id: 'anyone', label: 'Just curious' },
]
const STAGE_IDS = STAGES.map(s => s.id)

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const IMAGE_FILE_RE = /^[a-z0-9][a-z0-9._-]{0,99}\.(png|jpe?g|webp|gif)$/
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/
const TAG_RE = /^[a-z0-9][a-z0-9 .+#-]{0,29}$/
const HTTP_RE = /^https?:\/\/[^\s]+$/i
const IMAGE_SRC_RE = /^images\/([a-z0-9][a-z0-9._-]{0,99}\.(png|jpe?g|webp|gif))$/

const NODE_KEYS = new Set(['id', 'label', 'type', 'side', 'desc', 'links', 'faq', 'images', 'children'])
const DOC_KEYS = new Set(['title', 'subtitle', 'updated', 'changelog', 'topics'])
export const META_KEYS = new Set(['audience', 'stages', 'subject', 'follows', 'level', 'lang', 'tags', 'authors', 'license'])

const isStr = v => typeof v === 'string'
const isArr = Array.isArray
const isObj = v => v !== null && typeof v === 'object' && !isArr(v)

/** "Class 9 Maths: Algebra!" -> "class-9-maths-algebra" */
export function slugify(s) {
  const out = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
  return out
}

/**
 * Checks roadmaps/subjects.json, the list a roadmap's "subject" picks from.
 * Returns the set of subject ids.
 */
export function checkSubjects(list, where, report) {
  const ids = new Set()
  if (!isArr(list) || !list.length) { report.error(`${where}: must be a non-empty list`); return ids }
  list.forEach((s, i) => {
    if (!isObj(s) || !isStr(s.id) || !SLUG_RE.test(s.id) || !isStr(s.name) || !s.name.trim() || !isStr(s.icon) || !isStr(s.about))
      report.error(`${where}: entry ${i + 1} needs "id" (lowercase-with-hyphens), "name", "icon" and "about"`)
    else if (ids.has(s.id)) report.error(`${where}: subject "${s.id}" is listed twice`)
    else ids.add(s.id)
  })
  return ids
}

/**
 * Checks meta.json. report: { error(msg, nodeId?), warn(msg, nodeId?) }.
 * subjectIds: the ids from roadmaps/subjects.json; when not given, "subject"
 * is only checked for being present.
 */
export function checkMeta(meta, where, report, subjectIds) {
  if (!isObj(meta)) return report.error(`${where}: must be a JSON object`)
  // Strict here, unlike the document: meta.json is the likeliest place for
  // personal data such as an email address to slip in, and it is public.
  for (const k of Object.keys(meta)) if (!META_KEYS.has(k)) report.error(`${where}: unknown field "${k}"; allowed: ${[...META_KEYS].join(', ')}`)
  if (!isStr(meta.audience) || !meta.audience.trim() || meta.audience.length > 200)
    report.error(`${where}: "audience" is required (who is this for?), at most 200 characters`)
  if (!isArr(meta.stages) || meta.stages.length === 0 || meta.stages.length > 3 || new Set(meta.stages).size !== meta.stages.length
      || !meta.stages.every(s => STAGE_IDS.includes(s)))
    report.error(`${where}: "stages" needs 1 to 3 of ${STAGE_IDS.join(', ')} (who it is for, broadly)`)
  if (!isStr(meta.subject) || !meta.subject)
    report.error(`${where}: "subject" is required; pick one from roadmaps/subjects.json`)
  else if (subjectIds && !subjectIds.has(meta.subject))
    report.error(`${where}: subject "${meta.subject}" is not in roadmaps/subjects.json; pick one of ${[...subjectIds].join(', ')}, or propose a new subject`)
  if (meta.follows !== undefined && (!isStr(meta.follows) || !meta.follows.trim() || meta.follows.length > 100))
    report.error(`${where}: "follows" names the syllabus or exam the roadmap follows, at most 100 characters`)
  if (meta.level !== undefined && !LEVELS.includes(meta.level))
    report.error(`${where}: "level" must be one of ${LEVELS.join(', ')}`)
  if (!isStr(meta.lang) || !LANG_RE.test(meta.lang))
    report.error(`${where}: "lang" must be a language code such as "en", "hi" or "ta"`)
  if (!isArr(meta.tags) || meta.tags.length === 0 || meta.tags.length > 8)
    report.error(`${where}: "tags" needs 1 to 8 entries`)
  else for (const t of meta.tags)
    if (!isStr(t) || !TAG_RE.test(t)) report.error(`${where}: tag ${JSON.stringify(t)} must be lowercase, at most 30 characters`)
  if (!isArr(meta.authors) || meta.authors.length === 0)
    report.error(`${where}: "authors" needs at least one {"name": ...}`)
  else for (const a of meta.authors) {
    if (!isObj(a) || !isStr(a.name) || !a.name.trim() || a.name.length > 80)
      report.error(`${where}: each author needs a "name" of at most 80 characters`)
    else if (a.name.includes('@'))
      report.error(`${where}: author "${a.name}" looks like an email address; use a display name, the repository is public`)
    else if (a.url !== undefined && (!isStr(a.url) || !HTTP_RE.test(a.url)))
      report.error(`${where}: author "${a.name}" has a url that is not http(s)`)
  }
  if (meta.license !== LICENSE)
    report.error(`${where}: "license" must be "${LICENSE}" (all roadmap content is shared under it)`)
}

/**
 * Checks roadmap.json. imageFiles is the set of file names present in the
 * roadmap's images/ folder. Returns the node count.
 */
export function checkDoc(doc, where, imageFiles, report) {
  if (!isObj(doc)) { report.error(`${where}: must be a JSON object`); return 0 }
  for (const k of Object.keys(doc)) if (!DOC_KEYS.has(k)) report.warn(`${where}: unknown field "${k}" is ignored by the site`)
  if (!isStr(doc.title) || !doc.title.trim() || doc.title.length > 200)
    report.error(`${where}: "title" is required, at most 200 characters`)
  if (doc.subtitle !== undefined && (!isStr(doc.subtitle) || doc.subtitle.length > 1000))
    report.error(`${where}: "subtitle" must be text of at most 1000 characters`)
  if (doc.updated !== undefined && !(isStr(doc.updated) && DATE_RE.test(doc.updated)))
    report.error(`${where}: "updated" must be a date like 2026-10-19`)
  if (doc.changelog !== undefined && !(isArr(doc.changelog) && doc.changelog.length === 0)) {
    if (!isArr(doc.changelog)) report.error(`${where}: "changelog" must be a list`)
    else doc.changelog.forEach((c, i) => {
      if (!isObj(c) || !isStr(c.date) || !DATE_RE.test(c.date) || !isStr(c.text) || !c.text.trim())
        report.error(`${where}: changelog entry ${i + 1} needs a "date" (YYYY-MM-DD) and "text"`)
    })
  } else report.warn(`${where}: no changelog; readers use it to judge how current a roadmap is`)
  if (!isArr(doc.topics) || doc.topics.length === 0) {
    report.error(`${where}: "topics" needs at least one milestone`)
    return 0
  }

  const seen = new Set()
  const usedImages = new Set()
  let count = 0
  const walk = (n, depth, path) => {
    count++
    if (count === MAX_NODES + 1) report.error(`${where}: more than ${MAX_NODES} nodes`)
    const at = `${where} > ${path}`
    if (!isObj(n)) return report.error(`${at}: must be an object`)
    const id = isStr(n.id) ? n.id : undefined
    const error = m => report.error(`${at}: ${m}`, id, m)
    const warn = m => report.warn(`${at}: ${m}`, id, m)
    for (const k of Object.keys(n)) if (!NODE_KEYS.has(k)) warn(`unknown field "${k}" is ignored by the site`)
    if (!isStr(n.id) || !ID_RE.test(n.id)) error('"id" must be 1-40 letters, digits, - or _')
    else if (seen.has(n.id)) error(`id "${n.id}" is used twice; ids must be unique (they are the deep link)`)
    else seen.add(n.id)
    if (!isStr(n.label) || !n.label.trim() || n.label.length > 200) error('"label" is required, at most 200 characters')
    if (depth > 0) {
      if (n.type !== undefined && !['core', 'alt', 'optional'].includes(n.type)) error('"type" must be core, alt or optional')
      if (n.side !== undefined && !['auto', 'left', 'right'].includes(n.side)) error('"side" must be auto, left or right')
    }
    if (n.desc !== undefined && !isStr(n.desc)) error('"desc" must be text')

    const links = n.links ?? []
    if (!isArr(links)) error('"links" must be a list')
    else for (const l of links) {
      if (!isObj(l) || !isStr(l.label) || !isStr(l.url)) error('each link needs "label" and "url"')
      else if (!HTTP_RE.test(l.url.trim())) error(`link "${l.label || l.url}" must start with http:// or https://`)
      else if (!l.label.trim()) warn(`link ${l.url} has no label`)
    }
    if (n.faq !== undefined) {
      if (!isArr(n.faq)) error('"faq" must be a list')
      else for (const f of n.faq)
        if (!isObj(f) || !isStr(f.q) || !f.q.trim() || !isStr(f.a) || !f.a.trim()) error('each common issue needs a question and an answer')
    }
    if (n.images !== undefined) {
      if (!isArr(n.images)) error('"images" must be a list')
      else for (const im of n.images) {
        const src = isObj(im) && isStr(im.src) ? im.src : ''
        const m = IMAGE_SRC_RE.exec(src)
        if (src.startsWith('data:')) error('inline (data:) images are not accepted; save the image under images/ and reference it as "images/<file>"')
        else if (m) {
          if (!imageFiles.has(m[1])) error(`image "${src}" does not exist`)
          usedImages.add(m[1])
        } else if (!/^https:\/\//.test(src)) error('image src must be "images/<file>" or an https:// url')
        if (isObj(im) && im.caption !== undefined && !isStr(im.caption)) error('image caption must be text')
      }
    }
    if (depth > 0 && !(isStr(n.desc) && n.desc.trim()) && isArr(links) && links.length === 0 && !(n.children || []).length)
      warn('no description and no links; tell readers what to learn and where')

    const kids = n.children ?? []
    if (!isArr(kids)) return error('"children" must be a list')
    if (kids.length && depth >= MAX_DEPTH) return error(`nests deeper than ${MAX_DEPTH} levels`)
    kids.forEach((c, i) => walk(c, depth + 1, `${path} > ${isObj(c) && isStr(c.label) ? c.label : '#' + (i + 1)}`))
  }
  doc.topics.forEach((t, i) => walk(t, 0, isObj(t) && isStr(t.label) ? t.label : `topic ${i + 1}`))

  for (const f of imageFiles) if (!usedImages.has(f)) report.warn(`${where}: images/${f} is not used by any node`)
  return count
}
