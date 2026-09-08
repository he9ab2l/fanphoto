import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Optional public, read-only verification against the test site's real photos.
// No login cookies or write methods are forwarded to that library.
const readOnlyOrigin = process.env.FANPHOTO_READONLY_ORIGIN
const proxy = Object.fromEntries(
  ['/api', '/media'].map((path) => [
    path,
    {
      target: readOnlyOrigin || 'http://127.0.0.1:8787',
      changeOrigin: Boolean(readOnlyOrigin),
      ...(readOnlyOrigin
        ? {
            headers: { cookie: '', authorization: '' },
            bypass: (request: { method?: string }) =>
              ['GET', 'HEAD'].includes(request.method || '') ? undefined : false,
          }
        : {}),
    },
  ]),
)

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // The motion library powers the interactive glass layer, which is
          // loaded on demand; keep it out of the entry chunk so the gallery
          // wall parses without it.
          if (
            id.includes('node_modules/motion') ||
            id.includes('node_modules/framer-motion') ||
            id.includes('node_modules/motion-dom') ||
            id.includes('node_modules/motion-utils')
          )
            return 'motion'
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler'))
            return 'react-vendor'
        },
      },
    },
  },
})
