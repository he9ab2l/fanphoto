import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发/构建时直接把 test-photo/scenic 作为静态资源目录，
// 照片 URL 形如 /photo-001.jpg，前端清单只存文件名。
export default defineConfig({
  plugins: [react()],
  publicDir: fileURLToPath(new URL('../../test-photo/scenic', import.meta.url)),
})
