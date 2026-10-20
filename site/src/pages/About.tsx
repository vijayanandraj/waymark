import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { REPO_URL } from '../lib/content'
import { exportAll, importAll } from '../lib/progress'

export default function About() {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')

  const download = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'waymark-progress.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const upload = async (f: File | undefined) => {
    if (!f) return
    try { setMsg(`Merged progress for ${importAll(JSON.parse(await f.text()))} roadmaps.`) }
    catch { setMsg('That file is not a Waymark progress file.') }
    if (file.current) file.current.value = ''
  }

  return (
    <div className="page prose">
      <h1>About Waymark</h1>
      <p>
        Waymark is a free, open collection of learning roadmaps for anyone: a new graduate learning to
        program, a Class 9 student revising maths, a team onboarding a new hire. Every step says what to learn
        and why, the problems people commonly hit, and free resources to learn it from.
      </p>
      <p>There are no accounts and no tracking. Your progress is stored only in this browser.</p>

      <h2>Your progress</h2>
      <p>To move your progress to another browser or device, download it here and load it there.</p>
      <div className="row">
        <button onClick={download}>Download my progress</button>
        <button className="ghost" onClick={() => file.current?.click()}>Load a progress file</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={e => upload(e.target.files?.[0])} />
      </div>
      {msg && <p className="hint">{msg}</p>}

      <h2>Write a roadmap</h2>
      <p>
        Open the <Link to="/write">editor</Link>, no account needed. Your draft is saved in this browser as you type, and
        the editor runs the same checks a reviewer will. To improve an existing roadmap, use <b>Suggest changes</b> on it.
      </p>
      <p>
        Not ready to write? <a href={`${REPO_URL}/issues/new?template=propose-roadmap.yml`} target="_blank" rel="noopener">Propose a roadmap</a>:
        describe the subject and who it is for, and someone may pick it up. Developers can also open a pull request
        directly; see <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener">CONTRIBUTING.md</a>.
      </p>

      <h2>Licence</h2>
      <p>
        Roadmap content is licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>.
        The software is MIT licensed. Anyone may fork the whole project, content included.
      </p>
    </div>
  )
}
