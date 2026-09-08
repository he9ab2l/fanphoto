import { useState } from 'react'
import type { Album } from '@fanphoto/contracts'
import { api, useAlbums, useInvalidate } from '../lib/api'
import {
  Button,
  Confirm,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Modal,
  Spinner,
} from '../ui/primitives'
import { Input } from '../ui/fields'
import { Icon } from '../ui/icons'

function AlbumEditor({ album, onClose }: { album: Album | null; onClose: () => void }) {
  const [title, setTitle] = useState(album?.title || ''),
    [description, setDescription] = useState(album?.description || '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    invalidate = useInvalidate()
  return (
    <Modal title={album ? '编辑相册' : '新建相册'} onClose={onClose}>
      {(close) => (
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            setError('')
            try {
              await api('/admin/albums' + (album ? `/${album.id}` : ''), {
                method: album ? 'PATCH' : 'POST',
                body: JSON.stringify({ title, description }),
              })
              await invalidate()
              close()
            } catch (error) {
              setError((error as Error).message)
              setBusy(false)
            }
          }}
        >
          <Field label="相册名称">
            <Input
              className="text-input"
              autoFocus
              value={title}
              required
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="描述">
            <textarea
              value={description}
              maxLength={1000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button onClick={close} disabled={busy}>
              取消
            </Button>
            <Button variant="solid" type="submit" disabled={busy}>
              {busy ? <Spinner /> : '保存相册'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
export default function Albums() {
  const query = useAlbums(true),
    invalidate = useInvalidate()
  const [editor, setEditor] = useState<{ album: Album | null } | null>(null),
    [removing, setRemoving] = useState<Album | null>(null)
  return (
    <section className="studio-page">
      <header className="page-heading">
        <div>
          <h1>相册</h1>
          <p>把同一段记忆，放在一起。</p>
        </div>
        <Button variant="solid" onClick={() => setEditor({ album: null })}>
          <Icon name="plus" size={18} />
          新建相册
        </Button>
      </header>
      {query.isPending ? (
        <div className="studio-loading">
          <Spinner />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data?.items.length ? (
        <EmptyState title="还没有相册" detail="新建相册后，可以在照片库中批量添加照片。">
          <Button variant="outline" onClick={() => setEditor({ album: null })}>
            新建相册
          </Button>
        </EmptyState>
      ) : (
        <div className="album-grid">
          {query.data.items.map((album) => (
            <article className="album-card surface" key={album.id}>
              <Button
                className="album-cover"
                aria-label={`编辑相册：${album.title}`}
                onClick={() => setEditor({ album })}
              >
                {album.cover ? (
                  <img src={album.cover.assets.md.url} alt={album.title} />
                ) : (
                  <Icon name="album" size={40} />
                )}
              </Button>
              <div className="album-card-info">
                <div>
                  <h2>{album.title}</h2>
                  <p>{album.count} 张照片</p>
                  {album.description && <p>{album.description}</p>}
                </div>
                <IconButton
                  icon="trash"
                  label={`删除相册 ${album.title}`}
                  onClick={() => setRemoving(album)}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {editor && <AlbumEditor album={editor.album} onClose={() => setEditor(null)} />}
      {removing && (
        <Confirm
          title={`删除「${removing.title}」？`}
          description="只删除相册分组，不会删除其中的照片。"
          action="删除相册"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await api(`/admin/albums/${removing.id}`, { method: 'DELETE' })
            await invalidate()
          }}
        />
      )}
    </section>
  )
}
