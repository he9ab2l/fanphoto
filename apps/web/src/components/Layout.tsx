import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Aperture, Images, Layers, Map, Moon, Search, Sun, Settings2, UserRound, WifiOff } from 'lucide-react'
import { useAuth, useSite } from '../lib/api'
import { Badge, IconButton } from './ui-kit'

export function Layout() {
  const location = useLocation()
  const site = useSite()
  const auth = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('fanphoto-theme') || 'light')
  const [online, setOnline] = useState(navigator.onLine)
  const wall = location.pathname === '/wall'
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('fanphoto-theme', theme) }, [theme])
  useEffect(() => { if (site.data) document.title = site.data.site.title }, [site.data])
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) } }, [])
  const nav = [
    { to: '/', icon: Images, label: 'Archive', sub: '照片', active: location.pathname === '/' || wall },
    { to: '/albums', icon: Layers, label: 'Sets', sub: '相册', active: location.pathname.startsWith('/albums') },
    { to: '/map', icon: Map, label: 'Places', sub: '足迹', active: location.pathname === '/map' },
  ]
  return (
    <div className={`min-h-screen bg-zinc-950 text-zinc-100 selection:bg-lime-300 selection:text-zinc-950 ${wall ? 'canvas-layout' : ''}`}>
      <a className="fixed -top-20 left-4 z-[100] rounded-full bg-lime-300 px-4 py-2 text-sm text-zinc-950 focus:top-4" href="#main">跳到内容</a>
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8">
          <Link className="flex items-center gap-2.5" to="/" aria-label="Fanphoto 首页">
            <span className="grid size-9 place-items-center rounded-full border border-zinc-500 text-lime-300"><Aperture size={20} strokeWidth={1.7} /></span>
            <span className="text-base font-semibold tracking-tight sm:text-lg">{site.data?.site.title || 'Fanphoto'}</span>
            <Badge className="hidden sm:inline-flex">2026</Badge>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="主导航">
            {nav.map((item) => <Link className={`group flex items-center gap-2 rounded-full px-3 py-2 text-xs transition-colors ${item.active ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`} to={item.to} key={item.to} aria-current={item.active ? 'page' : undefined}><item.icon size={15} /><span>{item.label}</span><span className="text-[10px] text-zinc-600 group-hover:text-zinc-400">{item.sub}</span></Link>)}
          </nav>
          <div className="flex items-center gap-1.5">
            <Link className="hidden h-9 items-center gap-2 rounded-full border border-zinc-800 px-3 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white sm:flex" to="/?search=1"><Search size={15} />搜索</Link>
            <IconButton label={theme === 'light' ? '深色模式' : '浅色模式'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</IconButton>
            <Link className="grid size-9 place-items-center rounded-full border border-zinc-700 text-zinc-400 hover:text-white" to={auth.data?.authenticated ? '/admin' : '/about'} aria-label={auth.data?.authenticated ? '工作室' : '关于'}>{auth.data?.authenticated ? <Settings2 size={16} /> : <UserRound size={16} />}</Link>
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-3 bottom-3 z-50 flex justify-around rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl sm:hidden" aria-label="移动端导航">
        {nav.map((item) => <Link className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px] ${item.active ? 'bg-lime-300 text-zinc-950' : 'text-zinc-500'}`} to={item.to} key={item.to}><item.icon size={16} /><span>{item.sub}</span></Link>)}
      </nav>
      <main id="main"><Outlet /></main>
      {!wall && <footer className="mx-auto flex max-w-[1440px] justify-between border-t border-zinc-800 px-4 py-6 text-[10px] uppercase tracking-[.14em] text-zinc-600 sm:px-8"><span>© {new Date().getFullYear()} {site.data?.site.author || 'Fan'}</span><Link className="text-zinc-400 hover:text-lime-300" to="/admin">工作室 ↗</Link></footer>}
      {!online && <div className="fixed bottom-20 left-4 z-50 flex items-center gap-2 bg-lime-300 px-3 py-2 text-xs text-zinc-950 sm:bottom-4"><WifiOff size={14} />当前离线</div>}
    </div>
  )
}
