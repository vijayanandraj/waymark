import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built assets go straight into the Go embed directory so `go build`
// produces a single binary that serves the app.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../server/webdist/dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/img': 'http://localhost:8080',
    },
  },
})
