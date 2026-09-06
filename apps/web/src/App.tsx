import { lazy, Suspense, useEffect, useRef } from 'react'
import { Route, Routes, useLocation, type Location } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Layout } from './components/Layout'
import { Empty, Spinner } from './components/ui'
import Gallery from './pages/Gallery'
const Viewer = lazy(() => import('./pages/Viewer')),
  Albums = lazy(() => import('./pages/Albums')),
  MapPage = lazy(() => import('./pages/MapPage')),
  About = lazy(() => import('./pages/About')),
  Wall = lazy(() => import('./pages/Wall')),
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
        <div className="page-loading">
          <Spinner />
        </div>
      }
    >
      <Routes location={background || location}>
        <Route element={<Layout />}>
          <Route index element={<Gallery />} />
          <Route path="albums" element={<Albums />} />
          <Route path="albums/:id" element={<Albums />} />
          <Route path="map" element={<MapPage />} />
          <Route path="about" element={<About />} />
          <Route path="wall" element={<Wall />} />
          <Route path="photos/:id" element={viewer} />
          <Route
            path="*"
            element={
              <Empty
                title="这一页不在相册里"
                action={
                  <a href="/" className="button glass">
                    回到照片
                  </a>
                }
              />
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
