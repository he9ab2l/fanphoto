import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Album, Photo } from '@fanphoto/shared'
import { api, useAlbums, usePhotos } from '../lib/api'
import NoGlGrid from '../components/public/NoGlGrid'
import { GlassButton } from '../components/public/controls'

export default function Albums() {
  const { id } = useParams()
  return id ? <AlbumDetail id={id} /> : <AlbumIndex />
}

function AlbumIndex() {
  const result = useAlbums(),
    navigate = useNavigate()
  const covers = (result.data?.albums || [])
    .filter((album): album is Album & { cover: Photo } => !!album.cover)
    .map((album) => ({
      id: album.id,
      title: album.title,
      urls: {
        sm: album.cover.urls.sm,
        md: album.cover.urls.md,
        lg: album.cover.urls.lg,
      },
    }))
  return (
    <section className="grid-page">
      {covers.length ? (
        <NoGlGrid photos={covers} onOpen={(id) => navigate(`/albums/${id}`)} context="相册" />
      ) : result.isPending ? (
        <div className="grid-empty liquid">
          <span className="dot-pulse" />
        </div>
      ) : result.isError ? (
        <div className="grid-empty liquid">
          <p>相册暂时无法加载</p>
          <GlassButton onClick={() => void result.refetch()}>重试</GlassButton>
        </div>
      ) : (
        <div className="grid-empty liquid">
          <p>故事还未整理</p>
          <a className="liquid pill-btn" href="/admin/albums">
            创建相册
          </a>
        </div>
      )}
    </section>
  )
}

function AlbumDetail({ id }: { id: string }) {
  const result = useQuery({
      queryKey: ['album', id],
      queryFn: () => api<{ album: Album }>(`/albums/${id}`),
    }),
    photos = usePhotos({ album: id, limit: '60' }),
    album = result.data?.album,
    navigate = useNavigate(),
    location = useLocation()

  useEffect(() => {
    if (photos.hasNextPage && !photos.isFetchingNextPage && !photos.isFetchNextPageError)
      void photos.fetchNextPage()
  }, [photos.hasNextPage, photos.isFetchingNextPage, photos.isFetchNextPageError])

  const list = photos.data?.pages.flatMap((page) => page.photos) || []
  return (
    <section className="grid-page">
      {list.length ? (
        <NoGlGrid
          photos={list}
          onOpen={(photoId) => navigate(`/photos/${photoId}`, { state: { background: location } })}
          context={album?.title}
        />
      ) : photos.isPending ? (
        <div className="grid-empty liquid">
          <span className="dot-pulse" />
        </div>
      ) : photos.isError ? (
        <div className="grid-empty liquid">
          <p>相册暂时无法加载</p>
          <GlassButton onClick={() => void photos.refetch()}>重试</GlassButton>
        </div>
      ) : (
        <div className="grid-empty liquid">
          <p>相册暂时留白</p>
        </div>
      )}
    </section>
  )
}
