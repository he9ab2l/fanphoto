import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import '@fontsource-variable/dm-sans'
import './styles/app.css'
import './styles/public.css'
import App from './App'
import { ToastProvider } from './components/ui'
import { ApiError } from './lib/api'
import { UploadProvider } from './features/upload/Queue'
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="empty-state">
        <h1>页面暂时无法显示</h1>
        <button className="button primary" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    ) : (
      this.props.children
    )
  }
}
const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    },
  },
})
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary>
      <QueryClientProvider client={client}>
        <BrowserRouter>
          <MotionConfig reducedMotion="user">
            <ToastProvider>
              <UploadProvider>
                <App />
              </UploadProvider>
            </ToastProvider>
          </MotionConfig>
        </BrowserRouter>
      </QueryClientProvider>
    </Boundary>
  </React.StrictMode>,
)
