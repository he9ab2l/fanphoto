import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, ArrowUpRight, Grid2X2, Move, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { usePhotos, useSite } from '../lib/api'
import { PhotoCard } from '../components/PhotoCard'
import { Empty, ErrorState, IconButton, Spinner } from '../components/ui'
import { Button } from '../components/ui-kit'

export default function Gallery() {
  const [search, setSearch] = useSearchParams()
  const site = useSite()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(search.get('q') || '')
  const [searching, setSearching] = useState(!!search.get('search') || !!search.get('q'))
  const [compact, setCompact] = useState(false)
  const q = search.get('q') || ''
  const tag = search.get('tag') || ''
  const featured = search.get('featured') || ''
  const sort = search.get('sort') || 'newest'
  const result = usePhotos({ q, tag, featured, sort })
  const photos = result.data?.pages.flatMap((page) => page.photos) || []
  const total = result.data?.pages[0]?.total || 0
  const sentinel = useRef<HTMLDivElement>(null)
  const update = (changes: Record<string, string>) => setSearch((current) => {
    const next = new URLSearchParams(current)
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key))
    return next
  }, { replace: true })

  useEffect(() => {
    const timer = setTimeout(() => { if (query !== q) update({ q: query }) }, 280)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => setQuery(q), [q])
  useEffect(() => {
    if (search.get('search')) { setSearching(true); inputRef.current?.focus() }
  }, [search])
  useEffect(() => { if (searching) inputRef.current?.focus() }, [searching])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) {
        event.preventDefault(); setSearching(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
  useEffect(() => {
    const node = sentinel.current
    if (!node || !result.hasNextPage) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !result.isFetchingNextPage && !result.isFetchNextPageError) void result.fetchNextPage()
    }, { rootMargin: '500px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [result.hasNextPage, result.isFetchingNextPage, result.fetchNextPage, result.isFetchNextPageError])

  return (
    <section className="archive-page">
      <div className="archive-hero">
        <div className="hero-kicker"><span className="live-dot" /> PERSONAL IMAGE ARCHIVE</div>
        <div className="hero-main">
          <div>
            <h1>{tag || (featured ? '精选' : '片刻')}<sup>{String(total).padStart(2, '0')}</sup></h1>
            <p className="hero-intro">一些被光线留下的证据。<br />浏览、记住，然后继续生活。</p>
          </div>
          <div className="hero-aside"><span>SCROLL TO EXPLORE</span><ArrowDown size={18} /></div>
        </div>
      </div>
      <div className="archive-toolbar">
        <div className="filter-tabs" aria-label="照片筛选">
          <button className={`filter-chip ${!tag && !featured ? 'selected' : ''}`} onClick={() => update({ tag: '', featured: '' })}>全部</button>
          <button className={`filter-chip ${featured ? 'selected' : ''}`} onClick={() => update({ tag: '', featured: featured ? '' : 'true' })}><Sparkles size={13} />精选</button>
          {site.data?.tags.slice(0, 5).map((item) => <button key={item.name} className={`filter-chip ${tag === item.name ? 'selected' : ''}`} onClick={() => update({ featured: '', tag: tag === item.name ? '' : item.name })}>{item.name}</button>)}
        </div>
        <div className="archive-tools">
          <AnimatePresence initial={false}>
            {searching && <motion.div className="search-field" initial={{ width: 0, opacity: 0 }} animate={{ width: 230, opacity: 1 }} exit={{ width: 0, opacity: 0 }}><Search size={15} /><input ref={inputRef} aria-label="搜索照片" placeholder="搜索照片 / press /" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setSearching(false); update({ search: '' }) } }} /><IconButton label="清除搜索" onClick={() => { setQuery(''); setSearching(false); update({ search: '' }) }}><X size={15} /></IconButton></motion.div>}
          </AnimatePresence>
          {!searching && <IconButton label="打开搜索" onClick={() => setSearching(true)}><Search size={17} /></IconButton>}
          <label className="sort-select"><span>排序</span><select value={sort} onChange={(e) => update({ sort: e.target.value })}><option value="newest">最新</option><option value="oldest">最早</option></select><ArrowDown size={12} /></label>
          <IconButton label={compact ? '舒适布局' : '紧凑布局'} onClick={() => setCompact(!compact)} aria-pressed={compact}><SlidersHorizontal size={17} /></IconButton>
        </div>
      </div>
      {result.isPending ? <div className="photo-grid skeleton-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 260 + (i % 3) * 90 }} />)}</div> : result.isError && !photos.length ? <ErrorState error={result.error} retry={() => void result.refetch()} /> : !photos.length ? <Empty title={q || tag || featured ? '没有找到照片' : '还没有照片'} action={<Button asChild size="lg"><Link to="/admin">上传第一张 <ArrowUpRight size={15} /></Link></Button>} /> : <div className={`photo-grid ${compact ? 'compact' : ''}`}>{photos.map((photo, index) => <PhotoCard key={photo.id} photo={photo} index={index} />)}</div>}
      <div className="load-more" ref={sentinel}>{result.hasNextPage ? <button className="button outline" disabled={result.isFetchingNextPage} onClick={() => void result.fetchNextPage()}>{result.isFetchingNextPage ? <Spinner /> : <>{result.isFetchNextPageError ? '重试加载' : '继续看'} <ArrowDown size={15} /></>}</button> : photos.length > 0 && <span className="end-mark">END OF ROLL</span>}</div>
      <div className="archive-footer-note"><span>FANPHOTO / PRIVATE COLLECTION</span><Link to="/wall">进入照片墙 <Move size={14} /></Link></div>
    </section>
  )
}
