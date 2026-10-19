import { Link, NavLink, Outlet } from 'react-router-dom'
import { REPO_URL } from './lib/content'

export default function Layout() {
  return (
    <>
      <header className="topnav">
        <Link to="/" className="brand">Open Roadmap<span>learning paths, built in the open</span></Link>
        <nav>
          <NavLink to="/" end>Browse</NavLink>
          <NavLink to="/write">Write</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <span className="spacer" />
        <a className="ghost btn" href={REPO_URL} target="_blank" rel="noopener">Source</a>
      </header>
      <main><Outlet /></main>
    </>
  )
}
