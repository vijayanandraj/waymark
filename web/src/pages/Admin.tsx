import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Roadmap, Settings, User } from '../lib/types'
import { useToast } from '../components/Toast'
import { useAuth } from '../components/AuthContext'

export default function Admin() {
  const [queue, setQueue] = useState<Roadmap[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const toast = useToast()
  const { refresh, user: me } = useAuth()

  const load = () => {
    api.reviewQueue().then(setQueue).catch(() => {})
    api.users().then(setUsers).catch(() => {})
    api.adminSettings().then(setSettings).catch(() => {})
  }
  useEffect(load, [])

  return (
    <div className="page">
      <h1>Administration</h1>

      <h2>Review queue</h2>
      {queue.length === 0 ? <p className="hint">Nothing waiting for review.</p> : (
        <table className="tbl">
          <thead><tr><th>Title</th><th>Author</th><th>Items</th><th>Submitted</th><th></th></tr></thead>
          <tbody>
            {queue.map(r => <ReviewRow key={r.id} r={r} onDone={load} />)}
          </tbody>
        </table>
      )}

      <h2>Settings</h2>
      {settings && (
        <form className="settings" onSubmit={async e => {
          e.preventDefault()
          try { setSettings(await api.saveSettings(settings)); await refresh(); toast('Settings saved.') } catch (x) { toast((x as Error).message) }
        }}>
          <label className="f">Site name</label>
          <input value={settings.siteName} onChange={e => setSettings({ ...settings, siteName: e.target.value })} />
          <label className="f">Tagline</label>
          <input value={settings.tagline} onChange={e => setSettings({ ...settings, tagline: e.target.value })} />
          <label className="chk"><input type="checkbox" checked={settings.openSignup} onChange={e => setSettings({ ...settings, openSignup: e.target.checked })} /> Anyone can create an account (off = invite-only; admins still cannot create accounts for others yet, so turn this off only after your authors have signed up)</label>
          <label className="chk"><input type="checkbox" checked={settings.requireReview} onChange={e => setSettings({ ...settings, requireReview: e.target.checked })} /> Roadmaps from members need an admin's approval before they are published</label>
          <div><button>Save settings</button></div>
        </form>
      )}

      <h2>Users</h2>
      <table className="tbl">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td>
              <td>
                <select value={u.role} disabled={u.id === me?.id} onChange={async e => {
                  try { await api.setRole(u.id, e.target.value as 'admin' | 'member'); load() } catch (x) { toast((x as Error).message) }
                }}>
                  <option value="member">member</option><option value="admin">admin</option>
                </select>
              </td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReviewRow({ r, onDone }: { r: Roadmap; onDone: () => void }) {
  const [note, setNote] = useState('')
  const toast = useToast()
  return (
    <tr>
      <td><Link to={`/edit/${r.id}`}>{r.title}</Link><div className="note">{r.subtitle}</div></td>
      <td>{r.ownerName}</td>
      <td>{r.nodeCount}</td>
      <td>{new Date(r.updatedAt).toLocaleString()}</td>
      <td className="actions">
        <button onClick={async () => { await api.publish(r.id); toast('Published.'); onDone() }}>Publish</button>
        <input placeholder="Note to author" value={note} onChange={e => setNote(e.target.value)} />
        <button className="ghost" onClick={async () => { await api.reject(r.id, note); toast('Sent back.'); onDone() }}>Send back</button>
      </td>
    </tr>
  )
}
