import { lazy, Suspense, useEffect, useRef } from 'react'
import { Route, Routes, useLocation, type Location } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Layout } from './components/Layout'
import Gallery from './pages/Gallery'
import Albums from './pages/Albums'
import MapPage from './pages/MapPage'
import About from './pages/About'
import Wall from './pages/Wall'
import { Icon } from './lib/icons'

const Viewer = lazy(() => import('./pages/Viewer')),
  Admin = lazy(() => import('./pages/Admin'))

export default function App() {
  const location = useLocation(),
    previous = useRef(location.pathname),
    client = useQueryClient(),
    background = (location.state as { background?: Location } | null)?.background

  useEffect(() => {
    const expired = () => client.setQueryData(['auth'], { authenticated: false })
    window.addEventListener('fanphoto:session-expired', expired)
    return () => window.removeEventListener('fanphoto:session-expired', expired)
  }, [client])

  useEffect(() => {
    if (!location.pathname.startsWith('/photos/') && !previous.current.startsWith('/photos/'))
      window.scrollTo(0, 0)
    previous.current = location.pathname
  }, [location.pathname])

  const viewer = (
    <Suspense fallback={null}>
      <Viewer />
    </Suspense>
  )

  return (
    <Suspense
      fallback={
        <div className="page-loading public-shell">
          <span className="dot-pulse" />
        </div>
      }
    >
      <Routes location={background || location}>
        <Route element={<Layout />}>
          <Route index element={<Gallery />} />
          <Route path="wall" element={<Wall />} />
          <Route path="albums" element={<Albums />} />
          <Route path="albums/:id" element={<Albums />} />
          <Route path="map" element={<MapPage />} />
          <Route path="about" element={<About />} />
          <Route path="photos/:id" element={viewer} />
          <Route
            path="*"
            element={
              <div className="not-found">
                <Icon icon="mingcute:close-line" width={22} height={22} />
                <a className="liquid pill-btn" href="/">
                  回照片墙
                </a>
              </div>
            }
          />
        </Route>
        <Route path="admin/*" element={<Admin />} />
      </Routes>
      {background && (
        <Routes>
          <Route path="/photos/:id" element={viewer} />
        </Routes>
      )}
    </Suspense>
  )
}
