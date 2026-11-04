// End-to-end test of Write > Import with package zips and builder JSON.
// Run with `npm run test:import` (builds first). Serves dist/ with
// `vite preview` on port 4180 unless something already answers there.
//
//   node scripts/import-test.mjs [roadmap-slug]

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync, deflateSync } from 'node:zlib'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const slug = process.argv[2] || 'cbse-class-9-circles'
const pkgDir = join(repo, 'roadmaps', slug)
const inlineJson = join(repo, '..', 'Claude outputs', `${slug}.roadmap.json`)
const BASE = 'http://localhost:4180'

/* ---------- a small zip writer, independent of the site's ---------- */

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

/**
 * files: [{ name, data }]. deflate: compress with Node's zlib. descriptor:
 * write sizes and CRC after the data (bit 3), as streaming zippers do, so the
 * local headers say 0 and only the central directory is right.
 */
function zip(files, { deflate = false, descriptor = false } = {}) {
  const parts = [], central = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name)
    const raw = Buffer.from(f.data)
    const body = deflate ? deflateRawSync(raw) : raw
    const crc = crc32(raw)
    const flags = 0x0800 | (descriptor ? 8 : 0)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(deflate ? 8 : 0, 8)
    if (!descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22) }
    local.writeUInt16LE(name.length, 26)
    parts.push(local, name, body)
    let size = 30 + name.length + body.length
    if (descriptor) {
      const dd = Buffer.alloc(16)
      dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc, 4); dd.writeUInt32LE(body.length, 8); dd.writeUInt32LE(raw.length, 12)
      parts.push(dd); size += 16
    }
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(flags, 8); cd.writeUInt16LE(deflate ? 8 : 0, 10)
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)
    offset += size
  }
  const cdBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cdBuf, end])
}

/** A PNG of random pixels: noise does not compress, so it comes out well over 500 KB. */
function noisePng(w = 640, h = 480) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])))
    return Buffer.concat([len, Buffer.from(type), data, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const rows = Buffer.alloc((w * 3 + 1) * h)
  for (let i = 0; i < rows.length; i++) rows[i] = i % (w * 3 + 1) === 0 ? 0 : (Math.random() * 256) | 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

/** The roadmap folder as zip entries, optionally under a prefix, plus directory entries and OS clutter. */
function packageFiles(prefix = '', { drop = [], skip = [] } = {}) {
  const files = []
  if (prefix) files.push({ name: prefix, data: '' })
  for (const f of ['roadmap.json', 'meta.json']) if (!skip.includes(f)) files.push({ name: prefix + f, data: readFileSync(join(pkgDir, f)) })
  files.push({ name: prefix + 'images/', data: '' })
  for (const f of readdirSync(join(pkgDir, 'images')).sort()) if (!drop.includes(f)) files.push({ name: prefix + 'images/' + f, data: readFileSync(join(pkgDir, 'images', f)) })
  files.push({ name: '__MACOSX/._roadmap.json', data: 'junk' }, { name: prefix + 'images/Thumbs.db', data: 'junk' })
  return files
}

/* ---------- what the source says ---------- */

const srcDoc = JSON.parse(readFileSync(join(pkgDir, 'roadmap.json'), 'utf8'))
const walk = (nodes, out = []) => { for (const n of nodes || []) { out.push(n); walk(n.children, out) } return out }
const allNodes = walk(srcDoc.topics)
const withImages = allNodes.filter(n => n.images?.length)
const EXPECT_IMAGES = withImages.reduce((s, n) => s + n.images.length, 0)
const firstImage = withImages[0].images.find(im => im.src.startsWith('images/')).src.slice(7)

/* ---------- browser helpers ---------- */

let failures = 0
const check = (ok, what) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}`); if (!ok) failures++ }

async function toastText(page) {
  const t = page.locator('.toast.show')
  await t.waitFor({ timeout: 15000 })
  return (await t.textContent()) || ''
}

/** Imports a file from /write (new draft); returns the toast text. */
async function importNew(page, file) {
  await page.goto(BASE + '/write')
  await page.locator('.startrow input[type=file]').setInputFiles(file)
  return toastText(page)
}

async function closeModalIfOpen(page) {
  await page.locator('.bld-top').waitFor() // the Details modal, when shown, mounts with the editor
  if (await page.locator('.modal.open').count()) { await page.keyboard.press('Escape'); await page.locator('.modal.open').waitFor({ state: 'detached' }) }
}

/** Opens every step with pictures in the preview; returns how many <img> loaded and how many did not. */
async function countPreviewImages(page) {
  let loaded = 0, broken = 0
  for (const n of withImages) {
    await page.locator(`.bld-preview .rm-node[data-id="${n.id}"]`).click()
    const imgs = page.locator('.bld-preview .rm-drawer img')
    await imgs.first().waitFor()
    const res = await imgs.evaluateAll(els => Promise.all(els.map(img => img.complete ? img.naturalWidth > 0
      : new Promise(r => { img.onload = () => r(img.naturalWidth > 0); img.onerror = () => r(false) }))))
    loaded += res.filter(Boolean).length
    broken += res.filter(x => !x).length
    await page.locator('.bld-preview .rm-d-close').click() // the drawer covers part of the map
  }
  return { loaded, broken }
}

async function details(page) {
  await page.locator('.bld-top button', { hasText: 'Details' }).click()
  const modal = page.locator('.modal.open')
  const audience = await modal.locator('input[type=text]').first().inputValue()
  const slugInput = modal.locator('.slugrow input')
  const slugVal = await slugInput.count() ? await slugInput.inputValue() : ''
  await page.keyboard.press('Escape')
  return { audience, slug: slugVal }
}

const zipFile = (name, buffer) => ({ name, mimeType: 'application/zip', buffer })

/* ---------- run ---------- */

async function serverUp() { try { return (await fetch(BASE)).ok } catch { return false } }
let server = null
if (!await serverUp()) {
  server = spawn('npx', ['vite', 'preview', '--port', '4180', '--strictPort'], { cwd: join(here, '..'), shell: true, stdio: 'ignore' })
  for (let i = 0; i < 100 && !await serverUp(); i++) await new Promise(r => setTimeout(r, 200))
}

const browser = await chromium.launch()
try {
  console.log(`${slug}: ${allNodes.length} nodes, ${EXPECT_IMAGES} pictures on ${withImages.length} steps`)

  const cases = [
    ['deflated zip, files at the top', zipFile(`${slug}.zip`, zip(packageFiles(), { deflate: true })), ''],
    ['stored zip, files at the top', zipFile(`${slug}.zip`, zip(packageFiles())), ''],
    ['deflated zip with data descriptors, folder at the top', zipFile('Compressed.zip', zip(packageFiles(slug + '/'), { deflate: true, descriptor: true })), slug],
  ]
  let exported = null
  for (const [what, file, wantSlug] of cases) {
    console.log(what)
    const ctx = await browser.newContext({ acceptDownloads: true })
    const page = await ctx.newPage()
    const msg = await importNew(page, file)
    await page.waitForURL(/\/write\/d/)
    check(msg.includes(`Imported, with ${EXPECT_IMAGES} pictures.`), `toast: "${msg}"`)
    await closeModalIfOpen(page)
    const { loaded, broken } = await countPreviewImages(page)
    check(loaded === EXPECT_IMAGES && broken === 0, `${loaded} pictures loaded, ${broken} broken (expect ${EXPECT_IMAGES})`)
    const d = await details(page)
    check(d.audience.length > 0, `Details filled from meta.json (audience "${d.audience.slice(0, 40)}…")`)
    if (wantSlug) check(d.slug === wantSlug, `web address from the folder name: "${d.slug}"`)

    if (wantSlug) { // export the draft whose web address is the roadmap's own, to check it survives
      await page.locator('.bld-more summary').click()
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.bld-menu button', { hasText: 'Download package' }).click()])
      exported = { name: dl.suggestedFilename(), buffer: readFileSync(await dl.path()) }
    }
    await ctx.close()
  }

  console.log('a picture over 500 KB, and one that no step uses')
  {
    const big = noisePng()
    const files = packageFiles('', { drop: [firstImage] })
    files.push({ name: 'images/' + firstImage, data: big }, { name: 'images/spare.png', data: readFileSync(join(pkgDir, 'images', firstImage)) })
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const msg = await importNew(page, zipFile('big.zip', zip(files, { deflate: true })))
    await page.waitForURL(/\/write\/d/)
    check(msg.includes(`Imported, with ${EXPECT_IMAGES} pictures.`) && msg.includes('Skipped 1 picture no step uses: spare.png'), `${Math.round(big.length / 1024)} KB picture resized; toast: "${msg}"`)
    await closeModalIfOpen(page)
    const { loaded, broken } = await countPreviewImages(page)
    check(loaded === EXPECT_IMAGES && broken === 0, `${loaded} pictures loaded, ${broken} broken`)
    await ctx.close()
  }

  console.log('builder JSON with inline images')
  if (existsSync(inlineJson)) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    // A new draft from JSON opens without a toast, as before zips were accepted.
    await page.goto(BASE + '/write')
    await page.locator('.startrow input[type=file]').setInputFiles(inlineJson)
    await page.waitForURL(/\/write\/d/)
    await closeModalIfOpen(page)
    const { loaded, broken } = await countPreviewImages(page)
    check(loaded === EXPECT_IMAGES && broken === 0, `${loaded} pictures loaded, ${broken} broken (expect ${EXPECT_IMAGES})`)
    await ctx.close()
  } else console.log(`  skip ${inlineJson} not found`)

  console.log('package downloaded from the editor, imported again')
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const msg = await importNew(page, zipFile(exported.name, exported.buffer))
    await page.waitForURL(/\/write\/d/)
    check(msg.includes(`Imported, with ${EXPECT_IMAGES} pictures.`), `toast: "${msg}"`)
    await closeModalIfOpen(page)
    check(await page.locator('.bld-title').inputValue() === srcDoc.title, `title "${srcDoc.title}"`)
    const nodes = await page.locator('.bld-preview .rm-node').count()
    check(nodes === allNodes.length, `${nodes} steps and milestones (expect ${allNodes.length})`)
    const { loaded, broken } = await countPreviewImages(page)
    check(loaded === EXPECT_IMAGES && broken === 0, `${loaded} pictures loaded, ${broken} broken`)
    const d = await details(page)
    check(d.slug === slug, `web address "${d.slug}"`)

    console.log('zip imported into an open draft that already has Details')
    await page.locator('.bld-more summary').click()
    await page.locator('.bld-menu input[type=file]').setInputFiles(zipFile('again.zip', zip(packageFiles(), { deflate: true })))
    const msg2 = await toastText(page)
    check(msg2.includes(`Imported, with ${EXPECT_IMAGES} pictures.`), `toast: "${msg2}"`)
    const ask = page.locator('.modal.open h3')
    await ask.waitFor()
    check((await ask.textContent()).includes('Details from the zip'), 'asks before replacing Details')
    await page.locator('.modal.open button', { hasText: 'Keep mine' }).click()
    const after = await countPreviewImages(page)
    check(after.loaded === EXPECT_IMAGES && after.broken === 0, `${after.loaded} pictures loaded after re-import`)
    await ctx.close()
  }

  console.log('errors')
  const errorCases = [
    ['no roadmap.json', zipFile('a.zip', zip(packageFiles('', { skip: ['roadmap.json'] }), { deflate: true })), 'no roadmap.json'],
    ['a picture missing', zipFile('b.zip', zip(packageFiles('', { drop: [firstImage] }), { deflate: true })), `does not have: ${firstImage}`],
    ['not a zip', zipFile('c.zip', Buffer.from('this is not a zip at all')), 'not a zip'],
    ['broken roadmap.json', zipFile('d.zip', zip([{ name: 'roadmap.json', data: '{ nope' }])), 'roadmap.json is not valid JSON'],
  ]
  for (const [what, file, want] of errorCases) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const msg = await importNew(page, file)
    check(msg.includes(want) && page.url().endsWith('/write'), `${what}: "${msg}"`)
    await ctx.close()
  }
} finally {
  await browser.close()
  // shell: true puts vite under a shell; take the whole tree down.
  if (server) process.platform === 'win32' ? spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' }) : server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
