import { useState, type FormEvent } from 'react'
import type { Photo } from '@fanphoto/shared'
import { api, useAlbums, useInvalidate } from '../../lib/api'
import { Modal, Spinner, Switch, useToast } from '../../components/ui'
const localDate = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export function PhotoEditor({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const [title, setTitle] = useState(photo.title),
    [description, setDescription] = useState(photo.description),
    [tags, setTags] = useState(photo.tags.join(', ')),
    [takenAt, setTakenAt] = useState(localDate(photo.takenAt)),
    [latitude, setLatitude] = useState(photo.latitude?.toString() || ''),
    [longitude, setLongitude] = useState(photo.longitude?.toString() || ''),
    [place, setPlace] = useState(photo.location),
    [featured, setFeatured] = useState(photo.featured),
    [published, setPublished] = useState(photo.published),
    [albumIds, setAlbumIds] = useState(photo.albumIds),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    albums = useAlbums(true),
    invalidate = useInvalidate(),
    toast = useToast()
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await api(`/photos/${photo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          description,
          tags: tags
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean),
          takenAt: takenAt ? new Date(takenAt).toISOString() : null,
          latitude: latitude.trim() ? Number(latitude) : null,
          longitude: longitude.trim() ? Number(longitude) : null,
          location: place,
          featured,
          published,
          albumIds,
        }),
      })
      await invalidate()
      toast('已保存')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }
  return (
    <Modal
      title="编辑照片"
      onClose={() => {
        if (!pending) onClose()
      }}
      className="edit-modal"
    >
      <form onSubmit={save}>
        <div className="edit-grid">
          <div className="edit-preview">
            <img src={photo.urls.md} alt={photo.title} />
          </div>
          <fieldset disabled={pending} className="edit-fields">
            <label className="field">
              <span>标题</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={160}
              />
            </label>
            <label className="field">
              <span>描述</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={3000}
              />
            </label>
            <div className="field-pair">
              <label className="field">
                <span>拍摄时间</span>
                <input
                  type="datetime-local"
                  value={takenAt}
                  onChange={(e) => setTakenAt(e.target.value)}
                />
              </label>
              <label className="field">
                <span>标签</span>
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="用逗号分隔"
                />
              </label>
            </div>
            <label className="field">
              <span>地点</span>
              <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={160} />
            </label>
            <div className="field-pair">
              <label className="field">
                <span>纬度</span>
                <input
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </label>
              <label className="field">
                <span>经度</span>
                <input
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setLatitude('')
                setLongitude('')
                setPlace('')
              }}
            >
              清除这张照片的位置
            </button>
            <div className="field">
              <span>相册</span>
              <div className="album-options">
                {albums.data?.albums.map((album) => (
                  <label key={album.id} className="checkbox-pill">
                    <input
                      type="checkbox"
                      checked={albumIds.includes(album.id)}
                      onChange={(e) =>
                        setAlbumIds((old) =>
                          e.target.checked
                            ? [...old, album.id]
                            : old.filter((id) => id !== album.id),
                        )
                      }
                    />
                    {album.title}
                  </label>
                ))}
                {!albums.data?.albums.length && <small className="muted">尚无相册</small>}
              </div>
            </div>
            <Switch label="公开展示" checked={published} onChange={setPublished} />
            <Switch label="精选照片" checked={featured} onChange={setFeatured} />
          </fieldset>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button glass" disabled={pending} onClick={onClose}>
            取消
          </button>
          <button type="submit" className="button primary" disabled={pending}>
            {pending ? <Spinner /> : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
