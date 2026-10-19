import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../components/AuthContext'

export function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const to = (loc.state as { from?: string } | null)?.from || '/me'
  return (
    <form className="authbox" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr('')
      try { await api.login(email, password); await refresh(); nav(to) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
    }}>
      <h2>Sign in</h2>
      <label className="f">Email</label>
      <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <label className="f">Password</label>
      <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <button disabled={busy}>Sign in</button>
      <p className="hint">No account? <Link to="/register">Create one</Link>.</p>
    </form>
  )
}

export function Register() {
  const nav = useNavigate()
  const { refresh, settings } = useAuth()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (settings && !settings.openSignup) {
    return <div className="authbox"><h2>Sign-up is closed</h2><p className="hint">This instance is invite-only. Ask an administrator for an account.</p></div>
  }
  return (
    <form className="authbox" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr('')
      try { await api.register(email, name, password); await refresh(); nav('/me') } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
    }}>
      <h2>Create account</h2>
      {settings?.needsSetup && <p className="callout">This is the first account, so it becomes the administrator.</p>}
      <label className="f">Name</label>
      <input type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Shown as the author of your roadmaps" />
      <label className="f">Email</label>
      <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <label className="f">Password (8+ characters)</label>
      <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <button disabled={busy}>Create account</button>
      <p className="hint">Already have one? <Link to="/login">Sign in</Link>.</p>
    </form>
  )
}
