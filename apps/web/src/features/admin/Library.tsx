import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Check, Plus, Star, EyeOff, Trash2, Undo2, Layers, X } from 'lucide-react'
import type { BatchInput, Photo } from '@fanphoto/shared'
import { api, usePhotos, useAlbums, useInvalidate } from '../../lib/api'
import {
  Confirm,
  Empty,
  ErrorState,
  IconButton,
  Spinner,
  Modal,
  useToast,
} from '../../components/ui'
import { PhotoEditor } from './PhotoEditor'
export function Library({ trash = false }: { trash?: boolean }) {
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [selected, setSelected] = useState(new Set<string>()),
    [editing, setEditing] = useState<Photo | null>(null),
    [confirm, setConfirm] = useState<'trash' | 'permanent' | null>(null),
    [albumModal, setAlbumModal] = useState(false),
    [pending, setPending] = useState(false),
    [targetAlbum, setTargetAlbum] = useState(''),
    [search, setSearch] = useSearchParams()
  const result = usePhotos({ q: query, status, state: trash ? 'trash' : 'active' }, true),
    photos = result.data?.pages.flatMap((page) => page.photos) || [],
    albums = useAlbums(true),
    invalidate = useInvalidate(),
    toast = useToast()
  useEffect(() => {
    setSelected(new Set())
  }, [query, status, trash])
  useEffect(() => {
    const id = search.get('edit')
    if (id && photos.some((p) => p.id === id)) {
      setEditing(photos.find((p) => p.id === id)!)
      setSearch({}, { replace: true })
    }
  }, [result.data, search])
  const batch = async (action: BatchInput['action'], albumId?: string) => {
    setPending(true)
    const ids = [...selected]
    try {
      for (let offset = 0; offset < ids.length; offset += 100)
        await api('/photos/batch', {
          method: 'POST',
          body: JSON.stringify({
            ids: ids.slice(offset, offset + 100),
            action,
            ...(albumId ? { albumId } : {}),
          }),
        })
      toast('已更新')
    } finally {
      setSelected(new Set())
      await invalidate()
      setPending(false)
    }
  }
  const perform = (action: BatchInput['action']) => {
    void batch(action).catch((e) => toast(e.message, true))
  }
  return (
    <section>
      <div className="admin-page-heading">
        <div className="page-title">
          <h1>{trash ? '回收站' : '照片库'}</h1>
          <span className="count">{result.data?.pages[0].total || 0}</span>
        </div>
        {!trash && (
          <Link className="button primary" to="/admin/upload">
            <Plus size={17} />
            上传
          </Link>
        )}
      </div>
      <div className="library-toolbar">
        <label className="search-field glass">
          <Search size={17} />
          <input
            aria-label="搜索照片库"
            placeholder="搜索照片"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="library-filters">
          {!trash && (
            <select
              aria-label="公开状态"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">全部状态</option>
              <option value="published">已公开</option>
              <option value="draft">未公开</option>
            </select>
          )}
          <button
            className="button glass"
            onClick={() =>
              setSelected(
                selected.size === photos.length ? new Set() : new Set(photos.map((p) => p.id)),
              )
            }
            disabled={!photos.length}
          >
            {selected.size === photos.length && photos.length ? '取消全选' : '全选已加载'}
          </button>
        </div>
      </div>
      {result.isPending ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : result.isError && !photos.length ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : !photos.length ? (
        <Empty title={trash ? '回收站是空的' : '没有找到照片'} />
      ) : (
        <div className="manage-grid">
          {photos.map((photo) => (
            <article
              className={`manage-photo ${selected.has(photo.id) ? 'selected' : ''}`}
              key={photo.id}
            >
              <label className="photo-checkbox">
                <input
                  type="checkbox"
                  aria-label={`选择 ${photo.title}`}
                  checked={selected.has(photo.id)}
                  onChange={(e) =>
                    setSelected((old) => {
                      const next = new Set(old)
                      e.target.checked ? next.add(photo.id) : next.delete(photo.id)
                      return next
                    })
                  }
                />
                <span>
                  <Check size={14} />
                </span>
              </label>
              <button
                className="manage-photo-image"
                aria-label={`编辑 ${photo.title}`}
                onClick={() => setEditing(photo)}
              >
                <img src={photo.urls.sm} alt={photo.title} loading="lazy" />
              </button>
              <div className="manage-photo-caption">
                <strong>{photo.title}</strong>
                <span>
                  {photo.featured && <Star size={13} fill="currentColor" />}
                  {!photo.published && <EyeOff size={13} />}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
      {result.hasNextPage && (
        <div className="load-more">
          <button
            className="button glass"
            disabled={result.isFetchingNextPage}
            onClick={() => void result.fetchNextPage()}
          >
            {result.isFetchingNextPage ? <Spinner /> : '加载更多'}
          </button>
        </div>
      )}
      {!!selected.size && (
        <div className="bulk-bar glass" aria-label="批量操作">
          <span>{selected.size} 张</span>
          <span className="control-divider" />
          {trash ? (
            <>
              <button className="button" disabled={pending} onClick={() => perform('restore')}>
                <Undo2 size={17} />
                恢复
              </button>
              <button
                className="button danger-text"
                disabled={pending}
                onClick={() => setConfirm('permanent')}
              >
                <Trash2 size={17} />
                永久删除
              </button>
            </>
          ) : (
            <>
              <IconButton
                label="批量设为精选"
                disabled={pending}
                onClick={() => perform('feature')}
              >
                <Star size={18} />
              </IconButton>
              <IconButton
                label="批量设为未公开"
                disabled={pending}
                onClick={() => perform('unpublish')}
              >
                <EyeOff size={18} />
              </IconButton>
              <IconButton label="加入相册" disabled={pending} onClick={() => setAlbumModal(true)}>
                <Layers size={18} />
              </IconButton>
              <IconButton label="移入回收站" disabled={pending} onClick={() => setConfirm('trash')}>
                <Trash2 size={18} />
              </IconButton>
            </>
          )}
          <IconButton label="取消选择" disabled={pending} onClick={() => setSelected(new Set())}>
            <X size={17} />
          </IconButton>
        </div>
      )}
      {editing && <PhotoEditor key={editing.id} photo={editing} onClose={() => setEditing(null)} />}
      {confirm && (
        <Confirm
          title={
            confirm === 'trash'
              ? `移入回收站 · ${selected.size} 张`
              : `永久删除 · ${selected.size} 张`
          }
          detail={
            confirm === 'trash'
              ? '照片会从公开页面移除，可在回收站恢复。'
              : '原图、缩略图和实况片段都会删除，此操作无法撤销。'
          }
          confirmLabel={confirm === 'trash' ? '移入回收站' : '永久删除'}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm === 'trash') return batch('trash')
            setPending(true)
            try {
              for (const id of selected)
                await api(`/photos/${id}?permanent=true`, { method: 'DELETE' })
              toast('已永久删除')
            } finally {
              setSelected(new Set())
              setPending(false)
              await invalidate()
            }
          }}
        />
      )}
      {albumModal && (
        <Modal
          title="加入相册"
          onClose={() => {
            if (!pending) setAlbumModal(false)
          }}
        >
          <label className="field">
            <span>相册</span>
            <select value={targetAlbum} onChange={(e) => setTargetAlbum(e.target.value)}>
              <option value="">选择相册</option>
              {albums.data?.albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          </label>
          {!albums.data?.albums.length && (
            <Link to="/admin/albums" className="text-button">
              先创建相册 ↗
            </Link>
          )}
          <div className="form-actions">
            <button
              className="button primary"
              disabled={!targetAlbum || pending}
              onClick={() =>
                void batch('add-to-album', targetAlbum)
                  .then(() => setAlbumModal(false))
                  .catch((e) => toast(e.message, true))
              }
            >
              {pending ? <Spinner /> : '加入'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
