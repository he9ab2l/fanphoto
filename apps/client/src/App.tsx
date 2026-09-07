import { lazy, Suspense, useEffect } from 'react'
import { Link, Route, Routes, useLocation, type Location } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import Gallery from './gallery/Gallery'
import { EmptyState, Spinner } from './ui/primitives'
import { setCsrf } from './lib/api'
const PhotoDialog = lazy(() => import('./gallery/PhotoDialog'))
const Studio = lazy(() => import('./studio/Studio'))
export default function App() {
  const location = useLocation(),
    client = useQueryClient()
  const isPhoto = /^\/photo\/[^/]+$/.test(location.pathname)
  const state = location.state as { background?: Location } | null
  const background = isPhoto
    ? state?.background || { ...location, pathname: '/', key: 'gallery-background' }
    : null
  useEffect(() => {
    const expired = () => {
      setCsrf('')
      client.setQueryData(['session'], { authenticated: false })
    }
    window.addEventListener('fanphoto:session-expired', expired)
    return () => window.removeEventListener('fanphoto:session-expired', expired)
  }, [client])
  return (
    <>
      <a className="skip-link" href="#content">
        跳到内容
      </a>
      <main id="content">
        <Suspense
          fallback={
            <div className="screen-loading">
              <Spinner />
            </div>
          }
        >
          <Routes location={background || location}>
            <Route path="/" element={<Gallery paused={isPhoto} />} />
            <Route path="/studio/*" element={<Studio />} />
            <Route
              path="*"
              element={
                <div className="screen-loading">
                  <EmptyState title="这个页面不存在">
                    <Link className="button button--solid" to="/">
                      返回照片墙
                    </Link>
                  </EmptyState>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </main>
      {isPhoto && (
        <Suspense
          fallback={
            <div className="dialog-pending material">
              <Spinner label="打开照片详情" />
            </div>
          }
        >
          <Routes>
            <Route path="/photo/:id" element={<PhotoDialog />} />
          </Routes>
        </Suspense>
      )}
    </>
  )
}
