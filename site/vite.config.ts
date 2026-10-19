import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH is "/<repo>/" when deployed as a GitHub Pages project site; the
// deploy workflow sets it. Locally the site is served from the root.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: { port: 5174 },
})
