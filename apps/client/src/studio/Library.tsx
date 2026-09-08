import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Checkbox } from '@base-ui/react/checkbox'
import { toast } from 'sonner'
import type { BatchAction, Photo, LibraryStats } from '@fanphoto/contracts'
import { api, useAlbums, useInvalidate, usePhotos } from '../lib/api'
import { captureLabel } from '../lib/photos'
import {
  Button,
  Confirm,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  Radio,
  RadioGroup,
  Spinner,
} from '../ui/primitives'
import { Input, SelectField } from '../ui/fields'
import { Icon } from '../ui/icons'
import { PhotoEditor } from './PhotoEditor'

export default function Library() {
  const [status, setStatus] = useState('all'),
    [q, setQ] = useState(''),
    [sort, setSort] = useState('newest')
  const [selected, select] = useState(new Set<string>()),
    [selecting, setSelecting] = useState(false)
  const [editing, setEditing] = useState<Photo | null>(null),
    [purging, setPurging] = useState(false),
    [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [albumId, setAlbumId] = useState('')
  const query = usePhotos({ status, q, sort, limit: '40' }, true),
    albums = useAlbums(true),
    invalidate = useInvalidate()
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<LibraryStats>('/admin/stats') })
  const photos = useMemo(
    () => query.data?.pages.flatMap((page) => page.items as Photo[]) || [],
    [query.data],
  )
  const total = query.data?.pages[0].page.total || 0
  const toggle = (id: string) =>
    select((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < 100) next.add(id)
      return next
    })
  const act = async (action: BatchAction['action'], id?: string) => {
    setBusy(true)
    setError('')
    try {
      const ids = [...selected]
      await api('/admin/photos/actions', {
        method: 'POST',
        body: JSON.stringify({ ids, action, albumId: id }),
      })
      select(new Set())
      setSelecting(false)
      await invalidate()
      if (action === 'trash')
        toast('已移入回收站', {
          action: {
            label: '撤销',
            onClick: () => {
              void api('/admin/photos/actions', {
                method: 'POST',
                body: JSON.stringify({ ids, action: 'restore' }),
              })
                .then(invalidate)
                .catch((error) => toast.error(error.message))
            },
          },
        })
      else toast('已更新照片')
    } catch (error) {
      setError((error as Error).message)
      throw error
    } finally {
      setBusy(false)
    }
  }
  const safeAct = (action: BatchAction['action']) => {
    void act(action).catch(() => {})
  }
  const filters = [
    { value: 'all', label: '全部', count: stats.data?.total },
    { value: 'public', label: '公开', count: stats.data?.public },
    { value: 'private', label: '私密', count: stats.data?.private },
    { value: 'trash', label: '回收站', count: stats.data?.trash },
  ]
  return (
    <section className="studio-page">
      <header className="page-heading">
        <div>
          <h1>照片库</h1>
          <p>{stats.data ? `${stats.data.total} 个瞬间，在这里相遇。` : '整理你眼中的世界。'}</p>
        </div>
        <Link to="/studio/upload" className="button button--solid">
          <Icon name="plus" size={18} />
          导入照片
        </Link>
      </header>
      <div className="library-toolbar">
        <RadioGroup
          className="library-tabs"
          value={status}
          onValueChange={(value) => {
            setStatus(String(value))
            select(new Set())
          }}
          aria-label="照片状态"
        >
          {filters.map((filter) => (
            <Radio.Root
              className="library-tab"
              key={filter.value}
              value={filter.value}
              aria-label={filter.label}
            >
              {filter.label}
              <span>{filter.count ?? ''}</span>
            </Radio.Root>
          ))}
        </RadioGroup>
        <div className="library-tools">
          <label className="search-input">
            <Icon name="search" size={18} />
            <Input
              value={q}
              aria-label="搜索照片库"
              placeholder="搜索照片"
              onChange={(event) => {
                setQ(event.target.value)
                select(new Set())
              }}
            />
          </label>
          <SelectField
            label="照片排序"
            compact
            value={sort}
            onChange={setSort}
            items={[
              { label: '新到旧', value: 'newest' },
              { label: '旧到新', value: 'oldest' },
            ]}
          />
          <IconButton
            icon="check"
            label={selecting ? '取消选择' : '选择照片'}
            active={selecting}
            onClick={() => {
              setSelecting(!selecting)
              select(new Set())
            }}
          />
        </div>
      </div>
      {selecting && (
        <div className="selection-bar surface">
          <label className="selection-all">
            <Checkbox.Root
              className="checkbox"
              aria-label="选择已加载照片"
              checked={photos.length > 0 && selected.size === Math.min(100, photos.length)}
              onCheckedChange={(checked) =>
                select(new Set(checked ? photos.slice(0, 100).map((photo) => photo.id) : []))
              }
            >
              <Checkbox.Indicator>
                <Icon name="check" size={15} />
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span>已选 {selected.size}</span>
          </label>
          <div className="selection-actions">
            {status === 'trash' ? (
              <>
                <Button disabled={!selected.size || busy} onClick={() => safeAct('restore')}>
                  恢复
                </Button>
                <Button disabled={!selected.size || busy} onClick={() => setPurging(true)}>
                  永久删除
                </Button>
              </>
            ) : (
              <>
                <IconButton
                  icon="eye"
                  label="公开所选照片"
                  disabled={!selected.size || busy}
                  onClick={() => safeAct('publish')}
                />
                <IconButton
                  icon="hidden"
                  label="设为私密"
                  disabled={!selected.size || busy}
                  onClick={() => safeAct('unpublish')}
                />
                <IconButton
                  icon="star"
                  label="设为精选"
                  disabled={!selected.size || busy}
                  onClick={() => safeAct('favorite')}
                />
                <IconButton
                  icon="album"
                  label="加入相册"
                  disabled={!selected.size || busy || !albums.data?.items.length}
                  onClick={() => {
                    setAlbumId(albums.data?.items[0]?.id || '')
                    setAdding(true)
                  }}
                />
                <IconButton
                  icon="trash"
                  label="移入回收站"
                  disabled={!selected.size || busy}
                  onClick={() => safeAct('trash')}
                />
              </>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {query.isPending ? (
        <div className="studio-loading">
          <Spinner />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !photos.length ? (
        <EmptyState
          title={status === 'trash' ? '回收站是空的' : '没有找到照片'}
          detail={q ? '换个关键词试试。' : '从一张照片开始。'}
        >
          <Link to="/studio/upload" className="button button--outline">
            导入照片
          </Link>
        </EmptyState>
      ) : (
        <div className="library-grid">
          {photos.map((photo) => (
            <article
              className={`library-card ${selected.has(photo.id) ? 'is-selected' : ''}`}
              key={photo.id}
            >
              <Button
                className="library-card-image"
                aria-label={`${selecting ? '选择照片' : '编辑照片'}：${photo.title}`}
                onClick={() => {
                  if (selecting) toggle(photo.id)
                  else if (status === 'trash') {
                    setSelecting(true)
                    toggle(photo.id)
                  } else setEditing(photo)
                }}
              >
                <img
                  src={photo.assets.md.url}
                  width={photo.width}
                  height={photo.height}
                  alt={photo.title}
                  loading="lazy"
                />
              </Button>
              {selecting && (
                <Checkbox.Root
                  className="checkbox card-checkbox"
                  aria-label={`选中 ${photo.title}`}
                  checked={selected.has(photo.id)}
                  onCheckedChange={() => toggle(photo.id)}
                >
                  <Checkbox.Indicator>
                    <Icon name="check" size={15} />
                  </Checkbox.Indicator>
                </Checkbox.Root>
              )}
              <div className="library-card-caption">
                <h2 title={photo.title}>{photo.title}</h2>
                <div>
                  <span>{captureLabel(photo)}</span>
                  <span className="card-state">
                    {photo.favorite && <Icon name="star" size={14} />}
                    {!photo.isPublic && <Icon name="lock" size={14} />}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="library-bottom">
        <span>
          {photos.length} / {total}
        </span>
        {query.hasNextPage && (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? <Spinner /> : '加载更多'}
          </Button>
        )}
      </div>
      {editing && <PhotoEditor photo={editing} onClose={() => setEditing(null)} />}
      {adding && (
        <Modal title="加入相册" onClose={() => setAdding(false)}>
          {(close) => (
            <div className="form-stack">
              <SelectField
                label="选择相册"
                value={albumId}
                onChange={setAlbumId}
                items={(albums.data?.items || []).map((album) => ({
                  value: album.id,
                  label: album.title,
                }))}
              />
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <Button
                variant="solid"
                disabled={busy || !albumId}
                onClick={() => {
                  void act('add-to-album', albumId)
                    .then(close)
                    .catch(() => {})
                }}
              >
                加入
              </Button>
            </div>
          )}
        </Modal>
      )}
      {purging && (
        <Confirm
          title={`永久删除 ${selected.size} 张照片？`}
          description="原文件、预览和元数据都会被删除，无法撤销。"
          action="永久删除"
          onClose={() => setPurging(false)}
          onConfirm={async () => {
            for (const id of selected)
              await api(`/admin/photos/${id}/permanent`, { method: 'DELETE' })
            await invalidate()
            select(new Set())
            setSelecting(false)
          }}
        />
      )}
    </section>
  )
}
