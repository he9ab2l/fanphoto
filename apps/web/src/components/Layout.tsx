import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Aperture, Images, Layers, Map, Moon, Search, Sun, Settings2, UserRound, WifiOff } from 'lucide-react'
import { useAuth, useSite } from '../lib/api'
import { IconButton } from './ui'

export function Layout() {
  const location = useLocation()
  const site = useSite()
  const auth = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('fanphoto-theme') || 'light')
  const [online, setOnline] = useState(navigator.onLine)
  const wall = location.pathname === '/wall'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('fanphoto-theme', theme)
  }, [theme])
  useEffect(() => {
    if (site.data) document.title = site.data.site.title
  }, [site.data])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const nav = [
    { to: '/', icon: Images, label: 'Archive', sub: '照片', active: location.pathname === '/' || wall },
    { to: '/albums', icon: Layers, label: 'Sets', sub: '相册', active: location.pathname.startsWith('/albums') },
    { to: '/map', icon: Map, label: 'Places', sub: '足迹', active: location.pathname === '/map' },
  ]
  return (
    <div className={`site-shell ${wall ? 'canvas-layout' : ''}`}>
      <a className="skip-link" href="#main">跳到内容</a>
      <div className="noise" aria-hidden="true" />
      <header className="topbar">
        <Link className="brand-lockup" to="/" aria-label="Fanphoto 首页">
          <span className="brand-mark"><Aperture size={23} strokeWidth={1.8} /></span>
          <span className="brand-name">{site.data?.site.title || 'Fanphoto'}</span>
          <span className="brand-year">/ 2026</span>
        </Link>
        <nav className="primary-nav" aria-label="主导航">
          {nav.map((item) => (
            <Link className={`primary-link ${item.active ? 'active' : ''}`} to={item.to} key={item.to} aria-current={item.active ? 'page' : undefined}>
              <span className="nav-en">{item.label}</span>
              <span className="nav-cn">{item.sub}</span>
            </Link>
          ))}
        </nav>
        <div className="top-actions">
          <Link className="action-link" to="/?search=1" aria-label="搜索照片"><Search size={17} /><span>搜索</span></Link>
          <IconButton label={theme === 'light' ? '深色模式' : '浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
          </IconButton>
          <Link className="profile-link" to={auth.data?.authenticated ? '/admin' : '/about'} aria-label={auth.data?.authenticated ? '工作室' : '关于'}>
            {auth.data?.authenticated ? <Settings2 size={17} /> : <UserRound size={17} />}
          </Link>
        </div>
      </header>
      <main id="main"><Outlet /></main>
      {!wall && <footer className="site-footer"><span>© {new Date().getFullYear()} {site.data?.site.author || 'Fan'}</span><Link to="/admin">工作室 <span aria-hidden="true">↗</span></Link></footer>}
      {!online && <div className="offline-pill" role="status"><WifiOff size={15} /> 当前离线</div>}
    </div>
  )
}
