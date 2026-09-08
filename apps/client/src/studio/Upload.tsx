import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Progress } from '@base-ui/react/progress'
import { useAlbums } from '../lib/api'
import { formatBytes } from '../lib/photos'
import { Button, Field, IconButton } from '../ui/primitives'
import { Input, SelectField, ToggleField } from '../ui/fields'
import { Icon } from '../ui/icons'
import { useUploadQueue } from './UploadQueue'

export default function Upload() {
  const queue = useUploadQueue(),
    albums = useAlbums(true),
    fileInput = useRef<HTMLInputElement>(null)
  const [tags, setTags] = useState(''),
    [album, setAlbum] = useState(''),
    [isPublic, setPublic] = useState(true)
  const [stripLocation, setStripLocation] = useState(false),
    [dragging, setDragging] = useState(false),
    [error, setError] = useState('')
  const add = (files: File[]) => {
    const values = tags
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    if (values.length > 30 || values.some((tag) => tag.length > 40)) {
      setError('最多 30 个标签，每个不超过 40 个字')
      return
    }
    if (!files.length) return
    setError('')
    queue.enqueue(files, { tags: values, albumIds: album ? [album] : [], isPublic, stripLocation })
  }
  const done = queue.jobs.filter((job) => job.status === 'done').length
  return (
    <section className="studio-page">
      <header className="page-heading">
        <div>
          <h1>导入照片</h1>
          <p>原片交给服务器，细节留给照片。</p>
        </div>
      </header>
      <div className="upload-layout">
        <div className="upload-main">
          <input
            ref={fileInput}
            className="sr-only"
            tabIndex={-1}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.avif,.tif,.tiff,.heic,.heif"
            aria-label="选择照片文件"
            onChange={(event) => {
              add([...(event.target.files || [])])
              event.target.value = ''
            }}
          />
          <Button
            className={`drop-zone ${dragging ? 'is-dragging' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              add([...event.dataTransfer.files])
            }}
          >
            <span className="upload-symbol">
              <Icon name="upload" size={31} />
            </span>
            <span className="drop-title">把照片放在这里</span>
            <span className="drop-copy">拖入原图，或点击选择</span>
            <span className="drop-formats">JPEG · PNG · WebP · AVIF · TIFF · HEIC</span>
            <span className="drop-limit">单张最大 50 MB / 8000 万像素</span>
          </Button>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {queue.jobs.length > 0 && (
            <div className="upload-queue">
              <div className="queue-heading">
                <h2>
                  导入队列{' '}
                  <span>
                    {done} / {queue.jobs.length}
                  </span>
                </h2>
                <div>
                  <Button onClick={() => queue.pause(!queue.paused)}>
                    {queue.paused ? '继续队列' : '暂停队列'}
                  </Button>
                  <Button onClick={queue.clear}>清除已完成</Button>
                </div>
              </div>
              {queue.paused && (
                <p className="queue-note" role="status">
                  队列已暂停，正在处理的照片会继续完成。
                </p>
              )}
              <ul className="queue-list">
                {queue.jobs.map((job) => (
                  <li key={job.id} data-upload-state={job.status}>
                    <div className="queue-preview">
                      {job.photo ? (
                        <img src={job.photo.assets.sm.url} alt="" />
                      ) : (
                        <Icon name="photo" size={24} />
                      )}
                    </div>
                    <div className="queue-body">
                      <div className="queue-name">{job.name}</div>
                      <p>
                        {formatBytes(job.size)}
                        <span>
                          {
                            {
                              queued: queue.paused ? '等待继续' : '等待上传',
                              uploading: `上传中 ${job.progress}%`,
                              processing: '服务器处理中',
                              done: job.duplicate ? '已在图库中' : '导入完成',
                              failed: '未完成',
                              cancelled: '已移除',
                            }[job.status]
                          }
                        </span>
                      </p>
                      {['uploading', 'processing'].includes(job.status) && (
                        <Progress.Root
                          className="queue-progress"
                          value={job.status === 'processing' ? null : job.progress}
                        >
                          <Progress.Label className="sr-only">{job.name} 导入进度</Progress.Label>
                          <Progress.Track>
                            <Progress.Indicator />
                          </Progress.Track>
                        </Progress.Root>
                      )}
                      {job.error && (
                        <p className="queue-error" role="alert">
                          {job.error}
                        </p>
                      )}
                    </div>
                    {job.status === 'done' ? (
                      <Icon name="check" />
                    ) : job.status === 'failed' ? (
                      <>
                        <IconButton
                          icon="refresh"
                          label={`重试 ${job.name}`}
                          onClick={() => queue.retry(job.id)}
                        />
                        <IconButton
                          icon="close"
                          label={`移除 ${job.name}`}
                          onClick={() => queue.remove(job.id)}
                        />
                      </>
                    ) : (
                      job.status === 'queued' && (
                        <IconButton
                          icon="close"
                          label={`移除 ${job.name}`}
                          onClick={() => queue.remove(job.id)}
                        />
                      )
                    )}
                  </li>
                ))}
              </ul>
              {done > 0 && (
                <Link to="/studio" className="button button--outline">
                  回到照片库
                  <Icon name="right" size={17} />
                </Link>
              )}
            </div>
          )}
        </div>
        <aside className="upload-options surface">
          <h2>本次导入</h2>
          <SelectField
            label="加入相册"
            value={album}
            onChange={setAlbum}
            items={[
              { value: '', label: '暂不加入相册' },
              ...(albums.data?.items || []).map((album) => ({
                value: album.id,
                label: album.title,
              })),
            ]}
          />
          <Field label="标签" hint="用逗号分隔">
            <Input
              className="text-input"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="旅行，山野，日常"
            />
          </Field>
          <ToggleField label="公开到照片墙" checked={isPublic} onChange={setPublic} />
          <ToggleField
            label="抹去位置信息"
            hint="同时不保留含定位信息的原文件；高清派生图仍保留。"
            checked={stripLocation}
            onChange={setStripLocation}
          />
          <p className="upload-explanation">
            自动提取真实
            EXIF、校正方向并生成多尺寸预览。缺失的拍摄信息保持空白。站点隐私设置优先于本次选项。
          </p>
        </aside>
      </div>
    </section>
  )
}
