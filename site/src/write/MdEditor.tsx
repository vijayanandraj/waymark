// Rich text editor over markdown-lite. Rich mode is a contentEditable that is
// serialised back to markdown on every change; the toggle shows the raw text.
import { useEffect, useRef, useState } from 'react'
import { esc, inlineMd } from '../lib/md'

function mdToEditorHtml(md: string): string {
  const L = String(md || '').split('\n'), out: string[] = []
  let i = 0
  while (i < L.length) {
    if (/^```/.test(L[i])) {
      const buf: string[] = []; i++
      while (i < L.length && !/^```/.test(L[i])) { buf.push(L[i]); i++ }
      i++
      out.push('<pre>' + esc(buf.join('\n')) + '</pre>')
      continue
    }
    if (/^\s*-\s+/.test(L[i])) {
      const items: string[] = []
      while (i < L.length && /^\s*-\s+/.test(L[i])) { items.push('<li>' + inlineMd(esc(L[i].replace(/^\s*-\s+/, ''))) + '</li>'); i++ }
      out.push('<ul>' + items.join('') + '</ul>')
      continue
    }
    out.push('<div>' + (L[i].trim() ? inlineMd(esc(L[i])) : '<br>') + '</div>')
    i++
  }
  return out.join('')
}

function editorHtmlToMd(root: HTMLElement): string {
  const inline = (node: Node): string => {
    let s = ''
    node.childNodes.forEach(c => {
      if (c.nodeType === 3) { s += c.nodeValue; return }
      if (c.nodeType !== 1) return
      const el = c as HTMLElement, t = el.tagName
      if (t === 'BR') s += '\n'
      else if (t === 'STRONG' || t === 'B') s += '**' + inline(el) + '**'
      else if (t === 'EM' || t === 'I') s += '*' + inline(el) + '*'
      else if (t === 'CODE') s += '`' + el.textContent + '`'
      else if (t === 'A') s += '[' + inline(el) + '](' + (el.getAttribute('href') || '') + ')'
      else if (t === 'PRE') s += '\n```\n' + (el.textContent || '').replace(/\n+$/, '') + '\n```\n'
      else if (t === 'UL' || t === 'OL') {
        el.querySelectorAll(':scope > li').forEach(li => { s += '\n- ' + inline(li) })
        s += '\n'
      }
      else if (t === 'DIV' || t === 'P') s += '\n' + inline(el)
      else s += inline(el)
    })
    return s
  }
  const parts: string[] = []
  root.childNodes.forEach(c => {
    if (c.nodeType === 3) { if (c.nodeValue?.trim()) parts.push(c.nodeValue); return }
    if (c.nodeType !== 1) return
    const el = c as HTMLElement, t = el.tagName
    if (t === 'PRE') parts.push('```\n' + (el.textContent || '').replace(/\n+$/, '') + '\n```')
    else if (t === 'UL' || t === 'OL') {
      const rows: string[] = []
      el.querySelectorAll(':scope > li').forEach(li => rows.push('- ' + inline(li).replace(/\n/g, ' ').trim()))
      parts.push(rows.join('\n'))
    }
    else parts.push(inline(el).replace(/^\n+|\n+$/g, ''))
  })
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n+$/, '')
}

export default function MdEditor({ value, onChange, placeholder, minHeight }: {
  value: string; onChange: (md: string) => void; placeholder?: string; minHeight?: number
}) {
  const area = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'rich' | 'md'>('rich')
  const [raw, setRaw] = useState(value)
  const [full, setFull] = useState(false)
  const last = useRef(value)

  // Only re-render the contentEditable when the value changed from outside
  // (e.g. a different node was selected), never on our own keystrokes.
  useEffect(() => {
    if (mode === 'rich' && area.current && value !== last.current) {
      area.current.innerHTML = mdToEditorHtml(value)
      last.current = value
    }
    if (mode === 'md' && value !== last.current) { setRaw(value); last.current = value }
  }, [value, mode])

  useEffect(() => {
    if (area.current && mode === 'rich') area.current.innerHTML = mdToEditorHtml(last.current)
  }, [mode])

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [full])

  const emit = () => {
    if (!area.current) return
    const md = editorHtmlToMd(area.current)
    last.current = md
    onChange(md)
  }
  const cmd = (name: string, arg?: string) => { document.execCommand(name, false, arg); emit() }
  const keep = (e: React.MouseEvent) => e.preventDefault()

  const toggleCode = () => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount || !area.current) return
    const node = sel.anchorNode
    const el = node && (node.nodeType === 3 ? node.parentElement : node as HTMLElement)
    const codeEl = el?.closest?.('code')
    if (codeEl && area.current.contains(codeEl) && codeEl.parentElement?.tagName !== 'PRE') {
      codeEl.replaceWith(document.createTextNode(codeEl.textContent || ''))
    } else if (!sel.isCollapsed) {
      document.execCommand('insertHTML', false, '<code>' + esc(sel.toString()) + '</code>')
    }
    emit()
  }

  const Bar = (
    <div className="rte-bar">
      <button type="button" title="Bold" onMouseDown={keep} onClick={() => cmd('bold')} disabled={mode === 'md'}>B</button>
      <button type="button" title="Italic" onMouseDown={keep} onClick={() => cmd('italic')} disabled={mode === 'md'}>I</button>
      <button type="button" title="Inline code" onMouseDown={keep} onClick={toggleCode} disabled={mode === 'md'}>&lt;&gt;</button>
      <span className="sep" />
      <button type="button" title="Bullet list" onMouseDown={keep} onClick={() => cmd('insertUnorderedList')} disabled={mode === 'md'}>&bull; list</button>
      <button type="button" title="Insert link" onMouseDown={keep} disabled={mode === 'md'} onClick={() => {
        const url = prompt('Link URL (https://...)')
        if (url) cmd('createLink', url)
      }}>link</button>
      <button type="button" title="Code block (readers get a Copy button)" onMouseDown={keep} disabled={mode === 'md'} onClick={() => {
        const sel = window.getSelection()
        const txt = sel && !sel.isCollapsed ? sel.toString() : 'command here'
        cmd('insertHTML', '<pre>' + esc(txt) + '</pre><div><br></div>')
      }}>{'{ }'}</button>
      <button type="button" className="mode push" onMouseDown={keep} onClick={() => setFull(f => !f)}>{full ? 'collapse' : 'expand'}</button>
      <button type="button" className="mode" onMouseDown={keep} onClick={() => {
        if (mode === 'rich') { if (area.current) { const md = editorHtmlToMd(area.current); last.current = md; setRaw(md) } setMode('md') }
        else { last.current = raw; onChange(raw); setMode('rich') }
      }}>{mode === 'rich' ? 'markdown' : 'rich text'}</button>
    </div>
  )

  return (
    <>
      {full && <div className="rte-backdrop" onClick={() => setFull(false)} />}
      <div className={'rte' + (full ? ' rte-full' : '')}>
        {Bar}
        <div ref={area} className="rte-area" contentEditable suppressContentEditableWarning
          data-placeholder={placeholder || ''} style={{ minHeight, display: mode === 'rich' ? undefined : 'none' }}
          onInput={emit}
          onPaste={e => {
            e.preventDefault()
            const t = e.clipboardData.getData('text/plain') || ''
            document.execCommand('insertText', false, t)
          }} />
        {mode === 'md' && (
          <textarea className="rte-md" value={raw} placeholder={placeholder} spellCheck={false}
            onChange={e => { setRaw(e.target.value); last.current = e.target.value; onChange(e.target.value) }} />
        )}
      </div>
    </>
  )
}
