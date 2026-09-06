import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { usePhotos } from '../lib/api'
import NoGlGrid from '../components/public/NoGlGrid'
import { GlassButton, GlassIconButton } from '../components/public/controls'
import { Icon } from '../lib/icons'

export default function Gallery() {
  const location = useLocation(),
    navigate = useNavigate(),
    [search, setSearch] = useSearchParams()
  const q = search.get('q') || '',
    tag = search.get('tag') || '',
    featured = search.get('featured') || ''
  const result = usePhotos({ q, tag, featured, limit: '60' })
  const photos = result.data?.pages.flatMap((page) => page.photos) || []
  const [input, setInput] = useState(q)
  const searching = search.get('search') === '1' || !!q || !!tag
  const inputRef = useRef<HTMLInputElement>(null)

  const update = (changes: Record<string, string>) =>
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        Object.entries(changes).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        )
        return next
      },
      { replace: true },
    )

  useEffect(() => {
    const timer = setTimeout(() => {
      if (input !== q) update({ q: input })
    }, 280)
    return () => clearTimeout(timer)
  }, [input])

  useEffect(() => setInput(q), [q])

  useEffect(() => {
    if (result.hasNextPage && !result.isFetchingNextPage && !result.isFetchNextPageError)
      void result.fetchNextPage()
  }, [result.hasNextPage, result.isFetchingNextPage, result.isFetchNextPageError])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)
      ) {
        event.preventDefault()
        setSearch((current) => {
          const next = new URLSearchParams(current)
          next.set('search', '1')
          return next
        })
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    if (searching) inputRef.current?.focus()
  }, [searching])

  const open = (id: string) => navigate(`/photos/${id}`, { state: { background: location } })

  return (
    <section className="grid-page">
      {photos.length ? (
        <NoGlGrid photos={photos} onOpen={open} />
      ) : result.isPending ? (
        <div className="grid-empty liquid">
          <span className="dot-pulse" />
        </div>
      ) : result.isError ? (
        <div className="grid-empty liquid">
          <p>照片暂时无法加载</p>
          <GlassButton onClick={() => void result.refetch()}>重试</GlassButton>
        </div>
      ) : (
        <div className="grid-empty liquid">
          <p>{q || tag || featured ? '没有找到照片' : '还没有照片'}</p>
          <Link className="liquid pill-btn" to="/admin">
            上传照片
          </Link>
        </div>
      )}

      <AnimatePresence>
        {searching && (
          <motion.div
            className="search-overlay"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="search-field liquid">
              <Icon icon="mingcute:search-2-line" width={18} height={18} />
              <input
                ref={inputRef}
                aria-label="搜索照片"
                placeholder="搜索"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setInput('')
                    update({ q: '', search: '' })
                  }
                }}
              />
              <GlassIconButton
                label="清除搜索"
                icon="close-line"
                className="compact"
                onClick={() => {
                  setInput('')
                  update({ q: '', search: '', tag: '', featured: '' })
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
