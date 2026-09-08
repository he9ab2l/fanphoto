import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import Gallery from './gallery/Gallery'
import { EmptyState, Spinner, IconButton } from './ui/primitives'
import { GlassSurface } from './glass/GlassSurface'
import { startGlassLight } from './glass/GlassLight'
import { setCsrf } from './lib/api'
const PhotoDialog = lazy(() => import('./gallery/PhotoDialog'))
const Studio = lazy(() => import('./studio/Studio'))
const Notifications = lazy(() => import('./ui/Notifications'))

function PendingPhotoDialog() {
  const location = useLocation(),
    navigate = useNavigate()
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          if (location.state?.background) navigate(-1)
          else navigate('/' + location.search, { replace: true })
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="detail-backdrop" />
        <Dialog.Popup className="photo-opening">
          <Dialog.Title className="sr-only" render={<span />}>
            正在打开照片
          </Dialog.Title>
          <Spinner label="打开照片详情" />
          <GlassSurface material="thin" shape="capsule" interactive specular className="photo-opening-close">
            <Dialog.Close render={<IconButton icon="close" label="关闭照片详情" />} />
          </GlassSurface>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
export default function App() {
  const location = useLocation(),
    client = useQueryClient()
  useEffect(() => startGlassLight(), [])
  const isPhoto = /^\/photo\/[^/]+$/.test(location.pathname)
  const [foregroundReady, setForegroundReady] = useState(false)
  const photoReady = useCallback(() => setForegroundReady(true), [])
  useEffect(() => {
    if (!isPhoto) setForegroundReady(false)
  }, [isPhoto])
  const needsNotifications = isPhoto || location.pathname.startsWith('/studio')
  const [notificationsReady, setNotificationsReady] = useState(needsNotifications)
  useEffect(() => {
    if (needsNotifications) setNotificationsReady(true)
  }, [needsNotifications])
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
      {notificationsReady && (
        <Suspense fallback={null}>
          <Notifications />
        </Suspense>
      )}
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
            <Route
              path="/"
              element={<Gallery paused={isPhoto} deferInitialLoad={isPhoto && !foregroundReady} />}
            />
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
        <Suspense fallback={<PendingPhotoDialog />}>
          <Routes>
            <Route path="/photo/:id" element={<PhotoDialog onReady={photoReady} />} />
          </Routes>
        </Suspense>
      )}
    </>
  )
}
