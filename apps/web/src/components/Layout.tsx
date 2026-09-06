import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  Aperture,
  Images,
  Layers,
  Map,
  Search,
  Moon,
  Sun,
  Settings2,
  UserRound,
  WifiOff,
} from 'lucide-react'
import { useAuth, useSite } from '../lib/api'
import { IconButton } from './ui'
export function Layout() {
  const location = useLocation(),
    site = useSite(),
    auth = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('fanphoto-theme') || 'light'),
    [online, setOnline] = useState(navigator.onLine)
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
    { to: '/', icon: Images, label: '照片', active: location.pathname === '/' || wall },
    { to: '/albums', icon: Layers, label: '相册', active: location.pathname.startsWith('/albums') },
    { to: '/map', icon: Map, label: '足迹', active: location.pathname === '/map' },
  ]
  return (
    <div className={`public-layout ${wall ? 'canvas-layout' : ''}`}>
      <a className="skip-link" href="#main">
        跳到内容
      </a>
      <div className="ambient" aria-hidden="true">
        <i />
        <i />
      </div>
      <header className={`site-header ${wall ? 'inverse' : ''}`}>
        <Link className="wordmark" to="/" aria-label="Fanphoto 首页">
          <span className="brand-icon">
            <Aperture size={25} strokeWidth={1.6} />
          </span>
          <span>{site.data?.site.title || 'Fanphoto'}</span>
        </Link>
        <nav className="main-nav glass" aria-label="主导航">
          {nav.map((item) => (
            <Link
              className={`nav-item ${item.active ? 'active' : ''}`}
              to={item.to}
              key={item.to}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.active && (
                <motion.span
                  className="nav-bubble"
                  layoutId="public-nav"
                  transition={{ type: 'spring', stiffness: 410, damping: 32 }}
                />
              )}
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="header-actions glass">
          <Link className="icon-button" to="/?search=1" title="搜索" aria-label="搜索照片">
            <Search size={19} />
          </Link>
          <IconButton
            label={theme === 'light' ? '深色模式' : '浅色模式'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </IconButton>
          <Link
            className="icon-button"
            to={auth.data?.authenticated ? '/admin' : '/about'}
            title={auth.data?.authenticated ? '工作室' : '关于'}
            aria-label={auth.data?.authenticated ? '工作室' : '关于'}
          >
            {auth.data?.authenticated ? <Settings2 size={19} /> : <UserRound size={18} />}
          </Link>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      {!wall && location.pathname !== '/map' && (
        <footer className="site-footer">
          <span>
            © {new Date().getFullYear()} {site.data?.site.author || 'Fan'}
          </span>
          <Link to="/admin">
            工作室 <span aria-hidden="true">↗</span>
          </Link>
        </footer>
      )}
      {!online && (
        <div className="offline-pill glass" role="status">
          <WifiOff size={16} />
          当前离线
        </div>
      )}
    </div>
  )
}
