import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { RequestError } from './lib/api'
import { PreferencesProvider } from './lib/preferences'
import { UploadProvider } from './studio/UploadQueue'
import './styles/base.css'
import './styles/materials.css'
import './styles/gallery.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="screen-loading">
        <div className="empty-state">
          <h1>页面暂时无法显示</h1>
          <button className="button button--solid" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    ) : (
      this.props.children
    )
  }
}
const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        count < 1 && (!(error instanceof RequestError) || error.status >= 500),
      refetchOnWindowFocus: false,
    },
  },
})
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <PreferencesProvider>
          <BrowserRouter>
            <UploadProvider>
              <App />
            </UploadProvider>
          </BrowserRouter>
        </PreferencesProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
