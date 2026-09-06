import { useState, type FormEvent } from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  Aperture,
  LayoutDashboard,
  Upload,
  Images,
  Layers,
  Settings2,
  Trash2,
  LogOut,
  ArrowUpRight,
  HardDrive,
  Plus,
  LockKeyhole,
} from 'lucide-react'
import type { AdminStats, AuthState } from '@fanphoto/shared'
import { api, useAuth, usePhotos, useSite, setCsrf, formatBytes } from '../lib/api'
import { ErrorState, IconButton, Spinner, useToast } from '../components/ui'
import { useUploadQueue } from '../features/upload/Queue'
import { Uploader } from '../features/admin/Uploader'
import { Library } from '../features/admin/Library'
import { ManageAlbums } from '../features/admin/ManageAlbums'
import { Settings } from '../features/admin/Settings'
export default function Admin() {
  const auth = useAuth(),
    location = useLocation(),
    client = useQueryClient(),
    navigate = useNavigate(),
    queue = useUploadQueue(),
    toast = useToast(),
    site = useSite()
  const [logoutPending, setLogoutPending] = useState(false)
  if (auth.isPending)
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    )
  if (auth.isError) return <ErrorState error={auth.error} retry={() => void auth.refetch()} />
  if (!auth.data.authenticated)
    return location.pathname === '/admin/login' ? (
      <Login />
    ) : (
      <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />
    )
  if (location.pathname === '/admin/login') return <Navigate to="/admin" replace />
  const links = [
    { path: '/admin', icon: LayoutDashboard, label: '概览', end: true },
    { path: '/admin/upload', icon: Upload, label: '上传' },
    { path: '/admin/photos', icon: Images, label: '照片' },
    { path: '/admin/albums', icon: Layers, label: '相册' },
    { path: '/admin/trash', icon: Trash2, label: '回收站' },
    { path: '/admin/settings', icon: Settings2, label: '设置' },
  ]
  return (
    <div className="admin-layout">
      <div className="ambient" aria-hidden="true">
        <i />
        <i />
      </div>
      <header className="admin-header">
        <Link className="wordmark" to="/">
          <Aperture size={26} />
          <span>{site.data?.site.title || 'Fanphoto'}</span>
          <span className="studio-tag">STUDIO</span>
        </Link>
        <div className="admin-top-actions">
          <Link className="button glass" to="/">
            查看网站 <ArrowUpRight size={15} />
          </Link>
          <IconButton
            label={queue.hasPending ? '请先完成或取消上传' : '退出登录'}
            className="glass"
            disabled={queue.hasPending || logoutPending}
            onClick={async () => {
              setLogoutPending(true)
              try {
                await api('/auth/logout', { method: 'POST' })
                setCsrf('')
                client.setQueryData(['auth'], { authenticated: false })
                navigate('/admin/login')
              } catch (e) {
                toast((e as Error).message, true)
              } finally {
                setLogoutPending(false)
              }
            }}
          >
            <LogOut size={18} />
          </IconButton>
        </div>
      </header>
      <aside className="admin-sidebar glass">
        <nav aria-label="工作室导航">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.end}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <link.icon size={19} />
              <span>{link.label}</span>
              {link.path === '/admin/upload' && queue.hasPending && (
                <span className="activity-dot" />
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          私有工作室
        </div>
      </aside>
      <main className="admin-main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="upload" element={<Uploader />} />
          <Route path="photos" element={<Library />} />
          <Route path="trash" element={<Library trash />} />
          <Route path="albums" element={<ManageAlbums />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}
function Login() {
  const [password, setPassword] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    client = useQueryClient(),
    navigate = useNavigate(),
    [search] = useSearchParams(),
    photos = usePhotos({ limit: '1', featured: 'true' })
  const photo = photos.data?.pages[0].photos[0]
  const login = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      const auth = await api<AuthState>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      setCsrf(auth.csrfToken!)
      client.setQueryData(['auth'], auth)
      const next = search.get('next') || ''
      navigate(
        /^\/admin(?:\/(?:photos|upload|albums|settings|trash))?$/.test(next) ? next : '/admin',
        { replace: true },
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }
  return (
    <main className="login-page">
      {photo && <img className="login-background" src={photo.urls.lg} alt="" />}
      <Link className="login-brand wordmark" to="/">
        <Aperture size={26} />
        Fanphoto
      </Link>
      <motion.form
        className="login-card glass"
        onSubmit={login}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="login-symbol glass">
          <LockKeyhole size={27} strokeWidth={1.4} />
        </div>
        <h1>工作室</h1>
        <p>留给创作者的一点空间。</p>
        <label className="field">
          <span>管理员密码</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            maxLength={256}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入密码"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? (
            <Spinner />
          ) : (
            <>
              进入 <ArrowUpRight size={17} />
            </>
          )}
        </button>
        <small>使用初始化时生成的管理员密码</small>
      </motion.form>
    </main>
  )
}
function Dashboard() {
  const result = useQuery({ queryKey: ['stats'], queryFn: () => api<AdminStats>('/admin/stats') }),
    queue = useUploadQueue(),
    stats = result.data
  if (result.isError) return <ErrorState error={result.error} retry={() => void result.refetch()} />
  const cards = [
    { label: '照片', value: stats?.photos, icon: Images, to: '/admin/photos' },
    { label: '已公开', value: stats?.published, icon: Aperture, to: '/admin/photos' },
    { label: '相册', value: stats?.albums, icon: Layers, to: '/admin/albums' },
    {
      label: '存储',
      value: stats ? formatBytes(stats.bytes) : undefined,
      icon: HardDrive,
      to: '/admin/settings',
    },
  ]
  return (
    <section>
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">YOUR CREATIVE SPACE</span>
          <h1>工作室</h1>
        </div>
        <Link className="button primary" to="/admin/upload">
          <Plus size={18} />
          上传照片
        </Link>
      </div>
      <div className="stats-grid">
        {cards.map((card) => (
          <Link to={card.to} key={card.label} className="stat-card glass">
            <card.icon size={20} strokeWidth={1.6} />
            <strong>{card.value ?? '—'}</strong>
            <span>{card.label}</span>
          </Link>
        ))}
      </div>
      <div className="dashboard-middle">
        <Link className="upload-callout glass" to="/admin/upload">
          <span className="upload-callout-icon">
            <Upload size={30} strokeWidth={1.4} />
          </span>
          <div>
            <h2>{queue.hasPending ? '照片正在入库' : '新的瞬间'}</h2>
            <p>
              {queue.hasPending
                ? `${queue.items.filter((i) => i.status === 'done').length} 张已完成`
                : '把照片放进来。'}
            </p>
          </div>
          <ArrowUpRight size={22} />
        </Link>
        <div className="import-chart glass">
          <div className="section-heading">
            <h2>入库记录</h2>
            <span className="muted">近 6 个月</span>
          </div>
          <div className="chart-bars">
            {Array.from({ length: 6 }, (_, index) => {
              const date = new Date()
              date.setDate(1)
              date.setMonth(date.getMonth() - 5 + index)
              const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
                count = stats?.months.find((m) => m.month === key)?.count || 0
              return (
                <div key={key}>
                  <span
                    className="chart-bar"
                    title={`${key}: ${count}`}
                    style={{
                      height: `${Math.max(3, (count / Math.max(1, ...(stats?.months.map((m) => m.count) || []))) * 70)}px`,
                    }}
                  />
                  <small>{date.getMonth() + 1}月</small>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="section-heading">
        <h2>最近入库</h2>
        <Link to="/admin/photos">
          全部 <ArrowUpRight size={15} />
        </Link>
      </div>
      {result.isPending ? (
        <Spinner />
      ) : stats?.recent.length ? (
        <div className="recent-grid">
          {stats.recent.map((photo) => (
            <Link to={`/admin/photos?edit=${photo.id}`} key={photo.id}>
              <img src={photo.urls.sm} alt={photo.title} />
              <span>{photo.title}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">第一帧，从上传开始。</p>
      )}
    </section>
  )
}
