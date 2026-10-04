import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from './AuthContext'

export default function Layout() {
  const { user, settings, setUser } = useAuth()
  const nav = useNavigate()
  return (
    <>
      <header className="topnav">
        <Link to="/" className="brand">{settings?.siteName || 'Open Roadmap'}<span>{settings?.tagline}</span></Link>
        <nav>
          <NavLink to="/">Browse</NavLink>
          {user && <NavLink to="/me">My roadmaps</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <span className="spacer" />
        {user ? (
          <>
            <span className="who">{user.name}</span>
            <button className="ghost" onClick={async () => { await api.logout(); setUser(null); nav('/') }}>Sign out</button>
          </>
        ) : (
          <>
            <NavLink to="/login">Sign in</NavLink>
            {settings?.openSignup && <NavLink to="/register" className="cta">Create account</NavLink>}
          </>
        )}
      </header>
      <main><Outlet /></main>
    </>
  )
}
