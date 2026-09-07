import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Popover } from '@base-ui/react/popover'
import type { PhotoPage, SessionInfo } from '@fanphoto/contracts'
import { api, setCsrf, useSession, useSite } from '../lib/api'
import { Button, EmptyState, ErrorState, Field, IconButton, Input, Spinner } from '../ui/primitives'
import { Icon, type IconName } from '../ui/icons'
import { Appearance } from '../ui/Appearance'
import { useUploadQueue } from './UploadQueue'
const Library = lazy(() => import('./Library'))
const Upload = lazy(() => import('./Upload'))
const Albums = lazy(() => import('./Albums'))
const Settings = lazy(() => import('./Settings'))

function AppearanceMenu() {
  return (
    <Popover.Root>
      <Popover.Trigger render={<IconButton icon="settings" label="外观设置" />} />
      <Popover.Portal>
        <Popover.Positioner className="popover-positioner" align="end" sideOffset={12}>
          <Popover.Popup className="popover material appearance-panel">
            <Popover.Title className="sr-only">外观设置</Popover.Title>
            <Appearance />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
function Login() {
  const [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const client = useQueryClient()
  const preview = useQuery({
    queryKey: ['login-preview'],
    queryFn: () => api<PhotoPage>('/photos?limit=6'),
    staleTime: 60000,
  })
  return (
    <div className="login-screen">
      <div className="login-photos" aria-hidden="true">
        {preview.data?.items.map((photo) => (
          <img src={photo.assets.md.url} key={photo.id} alt="" />
        ))}
      </div>
      <div className="login-corner">
        <AppearanceMenu />
      </div>
      <form
        className="login-card material"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            const session = await api<SessionInfo>('/session', {
              method: 'POST',
              body: JSON.stringify({ password }),
            })
            setCsrf(session.csrfToken || '')
            client.setQueryData(['session'], session)
          } catch (error) {
            setError((error as Error).message)
            setBusy(false)
          }
        }}
      >
        <span className="login-mark">
          <Icon name="camera" size={28} />
        </span>
        <h1>工作室</h1>
        <p>属于你的照片，属于你的空间。</p>
        <Field label="管理员密码">
          <Input
            className="text-input"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </Field>
        {error && (
          <p id="login-error" className="inline-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="solid" disabled={busy} aria-label="进入工作室">
          {busy ? <Spinner label="正在登录" /> : '进入工作室'}
        </Button>
        <Link to="/" className="login-back">
          <Icon name="left" size={16} />
          返回照片墙
        </Link>
      </form>
    </div>
  )
}
export default function Studio() {
  const session = useSession(),
    site = useSite(),
    client = useQueryClient(),
    queue = useUploadQueue()
  const [logoutError, setLogoutError] = useState('')
  useEffect(() => {
    document.title = `工作室 · ${site.data?.site.title || 'FanPhoto'}`
  }, [site.data?.site.title])
  if (session.isPending)
    return (
      <div className="screen-loading">
        <Spinner />
      </div>
    )
  if (session.isError)
    return <ErrorState error={session.error} retry={() => void session.refetch()} />
  if (!session.data?.authenticated) return <Login />
  const links: { to: string; label: string; icon: IconName; end?: boolean }[] = [
    { to: '/studio', label: '照片库', icon: 'grid', end: true },
    { to: '/studio/upload', label: '导入', icon: 'upload' },
    { to: '/studio/albums', label: '相册', icon: 'album' },
    { to: '/studio/settings', label: '设置', icon: 'settings' },
  ]
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <Link to="/" className="studio-brand" aria-label="返回照片墙">
          <Icon name="camera" size={22} />
          <span>{site.data?.site.title || 'FanPhoto'}</span>
        </Link>
        <div className="studio-header-actions">
          {queue.pending && (
            <Link className="upload-status" to="/studio/upload">
              <span className="status-pulse" />
              导入中
            </Link>
          )}
          <AppearanceMenu />
          <IconButton
            icon="lock"
            label="退出工作室"
            disabled={queue.pending}
            title={queue.pending ? '请先完成或移除队列中的导入' : '退出工作室'}
            onClick={() => {
              void api('/session', { method: 'DELETE' })
                .then(() => {
                  setCsrf('')
                  client.setQueryData(['session'], { authenticated: false })
                  client.removeQueries({
                    predicate: (query) => !['session', 'site'].includes(String(query.queryKey[0])),
                  })
                })
                .catch((error) => setLogoutError(error.message))
            }}
          />
        </div>
      </header>
      <nav className="studio-nav material" aria-label="工作室导航">
        {links.map((link) => (
          <NavLink
            to={link.to}
            end={link.end}
            key={link.to}
            className={({ isActive }) => `studio-nav-link ${isActive ? 'is-active' : ''}`}
          >
            <Icon name={link.icon} size={21} />
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="studio-content">
        {logoutError && (
          <p className="inline-error" role="alert">
            {logoutError}
          </p>
        )}
        <Suspense
          fallback={
            <div className="studio-loading">
              <Spinner />
            </div>
          }
        >
          <Routes>
            <Route index element={<Library />} />
            <Route path="upload" element={<Upload />} />
            <Route path="albums" element={<Albums />} />
            <Route path="settings" element={<Settings />} />
            <Route
              path="*"
              element={
                <EmptyState title="这个页面不存在">
                  <Link className="button button--outline" to="/studio">
                    回到照片库
                  </Link>
                </EmptyState>
              }
            />
          </Routes>
        </Suspense>
      </div>
    </div>
  )
}
