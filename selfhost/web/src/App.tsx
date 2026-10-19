import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthContext'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import Home from './pages/Home'
import RoadmapPage from './pages/RoadmapPage'
import { Login, Register } from './pages/Auth'
import MyRoadmaps from './pages/MyRoadmaps'
import EditPage from './pages/EditPage'
import Admin from './pages/Admin'
import './app.css'

function RequireUser({ children, admin }: { children: React.ReactElement; admin?: boolean }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <p className="hint page">Loading…</p>
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/r/:slug" element={<RoadmapPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/me" element={<RequireUser><MyRoadmaps /></RequireUser>} />
              <Route path="/edit/:id" element={<RequireUser><EditPage /></RequireUser>} />
              <Route path="/admin" element={<RequireUser admin><Admin /></RequireUser>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
