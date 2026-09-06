import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowUpRight, Layers } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { Album } from '@fanphoto/shared'
import { api, useAlbums, usePhotos } from '../lib/api'
import { PhotoCard } from '../components/PhotoCard'
import { Empty, ErrorState, Spinner } from '../components/ui'
export default function Albums() {
  const { id } = useParams()
  return id ? <AlbumDetail id={id} /> : <AlbumIndex />
}
function AlbumIndex() {
  const result = useAlbums()
  return (
    <section className="page-container albums-page">
      <div className="page-title-row">
        <div className="page-title">
          <h1>故事集</h1>
          <span className="count">{result.data?.albums.length || 0}</span>
        </div>
        <span className="eyebrow">COLLECTIONS</span>
      </div>
      {result.isPending ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : result.isError ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : !result.data.albums.length ? (
        <Empty
          title="故事还未整理"
          action={
            <Link className="button glass" to="/admin/albums">
              创建相册
            </Link>
          }
        />
      ) : (
        <div className="album-grid">
          {result.data.albums.map((album, index) => (
            <motion.article
              key={album.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <Link className="album-card" to={`/albums/${album.id}`}>
                <div className="album-cover">
                  {album.cover ? (
                    <img src={album.cover.urls.md} alt={album.title} loading="lazy" />
                  ) : (
                    <Layers size={40} strokeWidth={1} />
                  )}
                  <span className="album-number glass">
                    {String(album.photoCount).padStart(2, '0')}
                  </span>
                  <span className="album-enter mini-glass">
                    <ArrowUpRight size={20} />
                  </span>
                </div>
                <div className="album-caption">
                  <h2>{album.title}</h2>
                  <span>{album.description}</span>
                </div>
              </Link>
            </motion.article>
          ))}
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
    photos = usePhotos({ album: id }),
    album = result.data?.album
  return (
    <section className="page-container">
      <Link className="back-link" to="/albums">
        <ArrowLeft size={16} />
        相册
      </Link>
      <div className="page-title-row">
        <div className="page-title">
          <h1>{album?.title || '相册'}</h1>
          <span className="count">{album?.photoCount || 0}</span>
        </div>
      </div>
      {album?.description && <p className="album-description">{album.description}</p>}
      {result.isError || photos.isError ? (
        <ErrorState
          error={result.error || photos.error}
          retry={() => {
            void result.refetch()
            void photos.refetch()
          }}
        />
      ) : photos.isPending ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : !photos.data.pages[0].photos.length ? (
        <Empty title="相册暂时留白" />
      ) : (
        <div className="photo-grid">
          {photos.data.pages
            .flatMap((p) => p.photos)
            .map((p, i) => (
              <PhotoCard photo={p} key={p.id} index={i} />
            ))}
        </div>
      )}
      {photos.hasNextPage && (
        <div className="load-more">
          <button
            className="button glass"
            disabled={photos.isFetchingNextPage}
            onClick={() => void photos.fetchNextPage()}
          >
            {photos.isFetchingNextPage ? <Spinner /> : '继续看'}
          </button>
        </div>
      )}
    </section>
  )
}
