import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, Layers, ArrowUpRight } from 'lucide-react'
import type { Album } from '@fanphoto/shared'
import { api, useAlbums, usePhotos, useInvalidate } from '../../lib/api'
import {
  Confirm,
  Empty,
  ErrorState,
  IconButton,
  Modal,
  Spinner,
  useToast,
} from '../../components/ui'
export function ManageAlbums() {
  const result = useAlbums(true),
    [editing, setEditing] = useState<Album | 'new' | null>(null),
    [deleting, setDeleting] = useState<Album | null>(null),
    invalidate = useInvalidate(),
    toast = useToast()
  return (
    <section>
      <div className="admin-page-heading">
        <h1>相册</h1>
        <button className="button primary" onClick={() => setEditing('new')}>
          <Plus size={17} />
          新建相册
        </button>
      </div>
      {result.isPending ? (
        <Spinner />
      ) : result.isError ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : !result.data.albums.length ? (
        <Empty
          title="整理一个新的故事"
          action={
            <button className="button glass" onClick={() => setEditing('new')}>
              创建相册
            </button>
          }
        />
      ) : (
        <div className="manage-albums">
          {result.data.albums.map((album) => (
            <article className="manage-album glass" key={album.id}>
              <Link className="manage-album-cover" to={`/albums/${album.id}`}>
                {album.cover ? (
                  <img src={album.cover.urls.md} alt={album.title} />
                ) : (
                  <Layers size={35} strokeWidth={1} />
                )}
                <span className="mini-glass">
                  <ArrowUpRight size={18} />
                </span>
              </Link>
              <div className="manage-album-body">
                <div>
                  <h2>{album.title}</h2>
                  <span>{album.photoCount} 张</span>
                </div>
                <div>
                  <IconButton label={`编辑相册 ${album.title}`} onClick={() => setEditing(album)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={`删除相册 ${album.title}`} onClick={() => setDeleting(album)}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <AlbumForm
          album={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Confirm
          title={`删除「${deleting.title}」`}
          detail="只删除相册，照片会保留在照片库中。"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api(`/albums/${deleting.id}`, { method: 'DELETE' })
            await invalidate()
            toast('相册已删除')
          }}
        />
      )}
    </section>
  )
}
function AlbumForm({ album, onClose }: { album?: Album; onClose: () => void }) {
  const [title, setTitle] = useState(album?.title || ''),
    [description, setDescription] = useState(album?.description || ''),
    [coverId, setCoverId] = useState(album?.coverId || ''),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    photos = usePhotos(album ? { album: album.id } : {}, true),
    invalidate = useInvalidate(),
    toast = useToast()
  const frames = photos.data?.pages.flatMap((p) => p.photos) || []
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await api(album ? `/albums/${album.id}` : '/albums', {
        method: album ? 'PATCH' : 'POST',
        body: JSON.stringify({ title, description, coverId: coverId || null }),
      })
      await invalidate()
      toast(album ? '相册已保存' : '相册已创建')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }
  return (
    <Modal
      title={album ? '编辑相册' : '新建相册'}
      onClose={() => {
        if (!pending) onClose()
      }}
    >
      <form onSubmit={save}>
        <label className="field">
          <span>名称</span>
          <input
            autoFocus
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给故事一个名字"
          />
        </label>
        <label className="field">
          <span>描述</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          <span>封面</span>
          <select value={coverId} onChange={(e) => setCoverId(e.target.value)}>
            <option value="">自动选择</option>
            {album?.cover && !frames.some((p) => p.id === album.cover!.id) && (
              <option value={album.cover.id}>{album.cover.title}</option>
            )}
            {frames.map((photo) => (
              <option key={photo.id} value={photo.id}>
                {photo.title}
              </option>
            ))}
          </select>
        </label>
        {photos.hasNextPage && (
          <button type="button" className="text-button" onClick={() => void photos.fetchNextPage()}>
            加载更多封面照片
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button glass" type="button" disabled={pending} onClick={onClose}>
            取消
          </button>
          <button className="button primary" type="submit" disabled={pending}>
            {pending ? <Spinner /> : '保存相册'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
