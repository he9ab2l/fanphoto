import { useState } from 'react'
import { Checkbox } from '@base-ui/react/checkbox'
import { Collapsible } from '@base-ui/react/collapsible'
import type { Photo, PhotoEdit } from '@fanphoto/contracts'
import { api, useAlbums, useInvalidate } from '../lib/api'
import { Button, Field, Input, Modal, Spinner, ToggleField } from '../ui/primitives'
import { Icon } from '../ui/icons'
import { Metadata } from '../gallery/Metadata'
import { formatBytes } from '../lib/photos'
export function PhotoEditor({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const [draft, setDraft] = useState<PhotoEdit>({
    title: photo.title,
    description: photo.description,
    location: photo.location,
    tags: photo.tags,
    albumIds: photo.albumIds,
    isPublic: photo.isPublic,
    favorite: photo.favorite,
  })
  const [tags, setTags] = useState(photo.tags.join('，')),
    [pending, setPending] = useState(false),
    [error, setError] = useState('')
  const albums = useAlbums(true),
    invalidate = useInvalidate()
  const patch = (value: Partial<PhotoEdit>) => setDraft((draft) => ({ ...draft, ...value }))
  return (
    <Modal title="照片详情" className="photo-editor" onClose={onClose}>
      {(close) => (
        <div className="editor-layout">
          <div className="editor-preview">
            <img
              src={photo.assets.lg.url}
              width={photo.width}
              height={photo.height}
              alt={photo.title}
            />
            <p>
              {photo.file.width} × {photo.file.height}
              <span>{formatBytes(photo.file.bytes)}</span>
            </p>
            {photo.file.originalAvailable && (
              <a
                className="button button--outline"
                href={`/api/v1/admin/photos/${photo.id}/source`}
              >
                <Icon name="download" size={17} />
                下载原文件
              </a>
            )}
            <Collapsible.Root className="editor-metadata">
              <Collapsible.Trigger className="button">
                <Icon name="camera" size={17} />
                拍摄与文件信息
                <Icon name="down" size={15} />
              </Collapsible.Trigger>
              <Collapsible.Panel>
                <Metadata photo={photo} />
              </Collapsible.Panel>
            </Collapsible.Root>
          </div>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault()
              setPending(true)
              setError('')
              try {
                await api(`/admin/photos/${photo.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    ...draft,
                    tags: tags
                      .split(/[,，]/)
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  }),
                })
                await invalidate()
                close()
              } catch (error) {
                setError((error as Error).message)
                setPending(false)
              }
            }}
          >
            <Field label="标题">
              <Input
                className="text-input"
                value={draft.title}
                required
                maxLength={160}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </Field>
            <Field label="描述">
              <textarea
                value={draft.description}
                maxLength={3000}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </Field>
            <Field label="地点">
              <Input
                className="text-input"
                value={draft.location}
                maxLength={160}
                onChange={(event) => patch({ location: event.target.value })}
                placeholder="未记录"
              />
            </Field>
            <Field label="标签" hint="用逗号分隔">
              <Input
                className="text-input"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </Field>
            <ToggleField
              label="公开"
              checked={draft.isPublic}
              onChange={(isPublic) => patch({ isPublic })}
            />
            <ToggleField
              label="精选"
              checked={draft.favorite}
              onChange={(favorite) => patch({ favorite })}
            />
            {!!albums.data?.items.length && (
              <fieldset className="album-checks">
                <legend>相册</legend>
                {albums.data.items.map((album) => (
                  <label key={album.id}>
                    <Checkbox.Root
                      className="checkbox"
                      checked={draft.albumIds.includes(album.id)}
                      onCheckedChange={(checked) =>
                        patch({
                          albumIds: checked
                            ? [...draft.albumIds, album.id]
                            : draft.albumIds.filter((id) => id !== album.id),
                        })
                      }
                    >
                      <Checkbox.Indicator>
                        <Icon name="check" size={15} />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    {album.title}
                  </label>
                ))}
              </fieldset>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button onClick={close} disabled={pending}>
                取消
              </Button>
              <Button variant="solid" type="submit" disabled={pending}>
                {pending ? <Spinner /> : '保存修改'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  )
}
