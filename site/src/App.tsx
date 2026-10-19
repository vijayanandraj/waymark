import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './Layout'
import Home from './pages/Home'
import RoadmapPage from './pages/RoadmapPage'
import About from './pages/About'
import { Drafts, EditDraft } from './pages/Write'
import { ToastProvider } from './components/Toast'
import './app.css'

// BASE_URL is "/" locally and "/<repo>/" on a GitHub Pages project site.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/r/:slug" element={<RoadmapPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/write" element={<Drafts />} />
          <Route path="/write/:id" element={<EditDraft />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
