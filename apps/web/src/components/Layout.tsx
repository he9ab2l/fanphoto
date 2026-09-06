import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useSite } from '../lib/api'
import { photoSite } from '../config/site'
import { Icon } from '../lib/icons'
import { GlassIconButton } from './public/controls'

export function Layout() {
  const location = useLocation(),
    navigate = useNavigate(),
    site = useSite(),
    auth = useAuth()
  const [online, setOnline] = useState(navigator.onLine)

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

  const studio = auth.data?.authenticated

  return (
    <div className="public-shell">
      <a className="skip-link" href="#main">
        跳到内容
      </a>
      <header className="public-topbar">
        <Link className="brand-lockup liquid" to="/" aria-label="返回照片墙">
          <span className="brand-mark">{photoSite.mark}</span>
          <span className="brand-name">{site.data?.site.title || photoSite.brand}</span>
        </Link>
        <nav className="public-nav liquid" aria-label="主导航">
          {photoSite.nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-dot ${isActive ? 'active' : ''}`}
              aria-label={item.label}
              title={item.label}
            >
              <Icon icon={`mingcute:${item.icon}`} width={18} height={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="top-actions liquid">
          <GlassIconButton
            label="搜索"
            icon="search-2-line"
            className="compact"
            onClick={() => navigate('/?search=1')}
          />
          <Link
            className="nav-dot"
            to={studio ? '/admin' : '/about'}
            aria-label={studio ? '工作室' : '关于'}
            title={studio ? '工作室' : '关于'}
          >
            <Icon icon={studio ? 'settings-4-line' : 'user-2-line'} width={18} height={18} />
          </Link>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <nav className="mobile-dock liquid" aria-label="移动端导航">
        {photoSite.nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
            aria-label={item.label}
          >
            <Icon icon={`mingcute:${item.icon}`} width={20} height={20} />
          </NavLink>
        ))}
        <NavLink
          to={studio ? '/admin' : '/about'}
          className={({ isActive }) => (isActive && !studio ? 'active' : '')}
          aria-label={studio ? '工作室' : '关于'}
        >
          <Icon icon={studio ? 'settings-4-line' : 'user-2-line'} width={20} height={20} />
        </NavLink>
      </nav>
      {!online && (
        <div className="offline-pill liquid" role="status">
          <Icon icon="close-line" width={15} height={15} />
          当前离线
        </div>
      )}
    </div>
  )
}
