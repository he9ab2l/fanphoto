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
  build: { target: 'es2022', sourcemap: false },
})
