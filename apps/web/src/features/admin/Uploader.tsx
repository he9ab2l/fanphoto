import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UploadCloud,
  Plus,
  Check,
  X,
  RotateCcw,
  Pause,
  Play,
  Image as ImageIcon,
  FolderOpen,
} from 'lucide-react'
import { useUploadQueue } from '../upload/Queue'
import { useAlbums, useSite, formatBytes } from '../../lib/api'
import { IconButton, Switch, useToast } from '../../components/ui'
export function Uploader() {
  const queue = useUploadQueue(),
    albums = useAlbums(true),
    site = useSite(),
    toast = useToast(),
    input = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false),
    [album, setAlbum] = useState(''),
    [tags, setTags] = useState(''),
    [published, setPublished] = useState(true),
    [erase, setErase] = useState(false),
    [watermark, setWatermark] = useState('')
  useEffect(() => {
    if (site.data) setErase(site.data.site.eraseLocationOnUpload)
  }, [site.data?.site.eraseLocationOnUpload])
  useEffect(() => {
    folder.current?.setAttribute('webkitdirectory', '')
  }, [])
  const add = (files: FileList | File[]) => {
    const list = Array.from(files),
      count = queue.enqueue(list, {
        albumIds: album ? [album] : [],
        tags: tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20),
        published,
        eraseLocation: erase,
        watermark,
      })
    count
      ? toast(`${count} 张照片已加入队列${list.length > 200 ? '，单次最多 200 张' : ''}`)
      : toast('请选择图片；实况视频需与同名照片一起选择', true)
  }
  const labels = {
    queued: '等待',
    processing: '处理',
    uploading: '上传',
    done: '完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return (
    <section>
      <div className="admin-page-heading">
        <h1>上传</h1>
        <span className="muted">
          {queue.items.filter((i) => i.status === 'done').length} / {queue.items.length}
        </span>
      </div>
      <div className="upload-layout">
        <div>
          <div
            className={`drop-zone glass ${over ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              add(e.dataTransfer.files)
            }}
          >
            <div className="drop-icon">
              <UploadCloud size={42} strokeWidth={1.2} />
            </div>
            <h2>把瞬间放进来</h2>
            <p>拖入照片，或轻点选择</p>
            <div className="drop-actions">
              <button className="button primary" onClick={() => input.current?.click()}>
                <Plus size={17} />
                选择照片
              </button>
              <button className="button glass" onClick={() => folder.current?.click()}>
                <FolderOpen size={17} />
                文件夹
              </button>
            </div>
            <small>JPEG · PNG · WebP · HEIC · AVIF · TIFF / 单张 ≤ 50 MB</small>
            <input
              type="file"
              multiple
              hidden
              ref={input}
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.tif,.tiff,.mov,.mp4"
              aria-label="选择上传照片"
              onChange={(e) => {
                if (e.target.files) add(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              type="file"
              multiple
              hidden
              ref={folder}
              aria-label="选择照片文件夹"
              onChange={(e) => {
                if (e.target.files) add(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          {queue.items.length > 0 && (
            <div className="upload-queue glass">
              <div className="section-heading">
                <h2>队列</h2>
                <div className="queue-actions">
                  <IconButton
                    label={queue.paused ? '继续队列' : '暂停后续上传'}
                    onClick={() => queue.setPaused(!queue.paused)}
                  >
                    {queue.paused ? <Play size={17} /> : <Pause size={17} />}
                  </IconButton>
                  <button className="text-button" onClick={queue.clear}>
                    清理已结束
                  </button>
                </div>
              </div>
              {queue.items.map((item) => (
                <div key={item.id} className={`upload-row ${item.status}`}>
                  <div className="upload-thumb">
                    {item.preview ? <img src={item.preview} alt="" /> : <ImageIcon size={20} />}
                  </div>
                  <div className="upload-file">
                    <strong>{item.name}</strong>
                    <small>
                      {item.error || `${formatBytes(item.size)}${item.video ? ' · LIVE' : ''}`}
                    </small>
                    {['processing', 'uploading'].includes(item.status) && (
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label={`${labels[item.status]} ${item.name}`}
                        aria-valuenow={item.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <span className="upload-status">
                    {labels[item.status]}
                    {['processing', 'uploading'].includes(item.status) && ` ${item.progress}%`}
                  </span>
                  {item.status === 'done' ? (
                    <Check size={18} className="success-text" />
                  ) : ['failed', 'cancelled'].includes(item.status) ? (
                    <IconButton label={`重试 ${item.name}`} onClick={() => queue.retry(item.id)}>
                      <RotateCcw size={17} />
                    </IconButton>
                  ) : (
                    <IconButton label={`取消 ${item.name}`} onClick={() => queue.cancel(item.id)}>
                      <X size={17} />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="upload-options glass">
          <h2>入库设置</h2>
          <label className="field">
            <span>相册</span>
            <select aria-label="相册" value={album} onChange={(e) => setAlbum(e.target.value)}>
              <option value="">暂不分类</option>
              {albums.data?.albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>标签</span>
            <input
              placeholder="用逗号分隔"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
          <label className="field">
            <span>
              水印 <small>可选</small>
            </span>
            <input
              placeholder="留空不添加"
              maxLength={60}
              value={watermark}
              onChange={(e) => setWatermark(e.target.value)}
            />
          </label>
          <Switch label="上传后公开" checked={published} onChange={setPublished} />
          <Switch
            label="清除位置信息"
            checked={erase}
            disabled={!!site.data?.site.eraseLocationOnUpload}
            onChange={setErase}
          />
          <p className="upload-note">
            逐张处理，保留 EXIF 白名单。实况照片可同时选择同名 MOV / MP4（≤ 12 MB）。
          </p>
          <Link className="text-button" to="/admin/photos">
            查看照片库 ↗
          </Link>
        </aside>
      </div>
    </section>
  )
}
