import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { PhotoDetail, PhotoSummary } from '@fanphoto/contracts'
import { api, usePhotos, useSite } from '../lib/api'
import { apiFilters } from '../lib/photos'
import { usePreferences } from '../lib/preferences'
import { Button, EmptyState, ErrorState, Spinner } from '../ui/primitives'
import { Masonry } from '../vendor/Masonry'
import { GalleryControls } from './Controls'
import type { Pose, WallMode } from './geometry'
const Immersive = lazy(() =>
  import('../vendor/SurroundGallery').then((module) => ({ default: module.SurroundGallery })),
)

export default function Gallery({
  paused = false,
  deferInitialLoad = false,
}: {
  paused?: boolean
  deferInitialLoad?: boolean
}) {
  const [search, setSearch] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate()
  const rawMode = search.get('view'),
    mode: WallMode = rawMode === 'surround' ? 'surround' : 'flat'
  const filters = useMemo(() => apiFilters(search), [search])
  const query = usePhotos(filters, false, !deferInitialLoad),
    { preferences } = usePreferences()
  const client = useQueryClient()
  const site = useSite()
  useEffect(() => {
    if (!paused) document.title = site.data?.site.title || 'FanPhoto'
  }, [paused, site.data?.site.title])
  const photos = useMemo(() => query.data?.pages.flatMap((page) => page.items) || [], [query.data])
  const total = query.data?.pages[0].page.total || 0
  const [searchOpen, setSearchOpen] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null),
    pose = useRef<Pose | null>(null)
  const update = (updates: Record<string, string>) =>
    setSearch(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(updates)) {
          if (value && value !== 'all') next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError)
      void query.fetchNextPage()
  }, [query.hasNextPage, query.isFetchingNextPage, query.isFetchNextPageError, query.fetchNextPage])
  useEffect(() => {
    if (mode !== 'flat' || !sentinel.current || paused) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
      },
      { rootMargin: '800px' },
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [mode, paused, loadMore, photos.length])
  useEffect(() => {
    if (paused) return
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,select,[role="dialog"]')) return
      if (event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [paused])
  const intent = (photo: PhotoSummary) => {
    void import('./PhotoDialog')
    const filterQuery = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value),
    ).toString()
    void client.prefetchQuery({
      queryKey: ['photo', photo.id, filterQuery],
      queryFn: ({ signal }) => api<PhotoDetail>(`/photos/${photo.id}?${filterQuery}`, { signal }),
      staleTime: 30000,
    })
  }
  const open = (photo: PhotoSummary, previewUrl?: string) => {
    const params = new URLSearchParams(search)
    navigate(`/photo/${photo.id}${params.size ? `?${params}` : ''}`, {
      state: { background: location, preview: { photo, url: previewUrl } },
    })
  }
  const identity = JSON.stringify(filters)
  return (
    <div className={`gallery gallery--${mode}`} data-view-mode={mode}>
      <h1 className="sr-only">{site.data?.site.title || 'FanPhoto'} 照片墙</h1>
      {query.isPending ? (
        <div className="gallery-pending">
          {!deferInitialLoad && <Spinner label="正在载入照片" />}
        </div>
      ) : query.isError && !photos.length ? (
        <div className="gallery-empty">
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        </div>
      ) : !photos.length ? (
        <div className="gallery-empty material">
          <EmptyState title="这里还没有照片" detail="上传一些日常，或换一个筛选条件。">
            <Button
              variant="outline"
              onClick={() => update({ q: '', tag: '', album: '', orientation: '', favorite: '' })}
            >
              清除筛选
            </Button>
            <Link className="button button--solid" to="/studio/upload">
              上传照片
            </Link>
          </EmptyState>
        </div>
      ) : mode === 'flat' ? (
        <div className="flat-wall">
          <Masonry
            photos={photos}
            density={preferences.density}
            onOpen={open}
            onIntent={intent}
            paused={paused}
          />
          <div ref={sentinel} className="load-sentinel">
            {query.isFetchingNextPage && <Spinner label="加载更多照片" />}
            {query.isFetchNextPageError && (
              <Button onClick={() => void query.fetchNextPage()}>重新加载下一页</Button>
            )}
          </div>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="gallery-pending">
              <Spinner />
            </div>
          }
        >
          <div className="immersive-container" key={`${mode}:${identity}`}>
            <Immersive
              photos={photos}
              density={preferences.density}
              paused={paused}
              pose={pose}
              onOpen={open}
              onIntent={intent}
              onExplore={loadMore}
            />
            {query.isFetchNextPageError && (
              <div className="scene-error material">
                <Button onClick={() => void query.fetchNextPage()}>重新加载更多照片</Button>
              </div>
            )}
          </div>
        </Suspense>
      )}
      <GalleryControls
        mode={mode}
        onMode={(view) => update({ view })}
        filters={filters}
        update={update}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        total={total}
      />
    </div>
  )
}
