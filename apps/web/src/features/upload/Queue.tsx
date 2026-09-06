import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Photo } from '@fanphoto/shared'
import type { ImageOptions } from '../../lib/images'
import { getCsrf, useInvalidate } from '../../lib/api'
export type UploadStatus = 'queued' | 'processing' | 'uploading' | 'done' | 'failed' | 'cancelled'
export interface UploadItem {
  id: string
  name: string
  size: number
  file?: File
  video?: File
  options: ImageOptions
  status: UploadStatus
  progress: number
  error?: string
  preview?: string
  photo?: Photo
}
interface UploadContext {
  items: UploadItem[]
  paused: boolean
  hasPending: boolean
  enqueue: (files: File[], options: ImageOptions) => number
  cancel: (id: string) => void
  retry: (id: string) => void
  clear: () => void
  setPaused: (value: boolean) => void
}
const Context = createContext<UploadContext | null>(null)
export const useUploadQueue = () => useContext(Context)!
function send(form: FormData, signal: AbortSignal, progress: (value: number) => void) {
  return new Promise<Photo>((resolve, reject) => {
    const xhr = new XMLHttpRequest(),
      abort = () => xhr.abort(),
      cleanup = () => signal.removeEventListener('abort', abort)
    xhr.open('POST', '/api/photos/upload')
    xhr.withCredentials = true
    xhr.setRequestHeader('X-CSRF-Token', getCsrf())
    xhr.responseType = 'json'
    xhr.timeout = 120000
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      cleanup()
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response.photo)
      else {
        if (xhr.status === 401) window.dispatchEvent(new Event('fanphoto:session-expired'))
        reject(new Error(xhr.response?.error?.message || '上传失败，请重试'))
      }
    }
    xhr.onerror = () => {
      cleanup()
      reject(new Error('网络中断，请重试'))
    }
    xhr.ontimeout = () => {
      cleanup()
      reject(new Error('上传超时，可以重试'))
    }
    xhr.onabort = () => {
      cleanup()
      reject(new DOMException('已取消', 'AbortError'))
    }
    if (signal.aborted) return reject(new DOMException('已取消', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    xhr.send(form)
  })
}
export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]),
    [paused, setPaused] = useState(false),
    [tick, setTick] = useState(0),
    busy = useRef(false),
    active = useRef<{ id: string; controller: AbortController } | null>(null),
    urls = useRef(new Set<string>()),
    invalidate = useInvalidate()
  const hasPending = items.some((item) =>
    ['queued', 'processing', 'uploading'].includes(item.status),
  )
  const update = (id: string, patch: Partial<UploadItem>) =>
    setItems((old) => old.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  useEffect(() => {
    if (!hasPending) return
    const before = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', before)
    return () => window.removeEventListener('beforeunload', before)
  }, [hasPending])
  useEffect(
    () => () => {
      active.current?.controller.abort()
      urls.current.forEach(URL.revokeObjectURL)
    },
    [],
  )
  useEffect(() => {
    if (busy.current || paused) return
    const next = items.find((item) => item.status === 'queued' && item.file)
    if (!next) return
    busy.current = true
    const controller = new AbortController()
    active.current = { id: next.id, controller }
    update(next.id, { status: 'processing', progress: 0, error: undefined })
    void (async () => {
      try {
        const { prepareImage } = await import('../../lib/images'),
          form = await prepareImage(
            next.file!,
            next.id,
            next.options,
            controller.signal,
            (progress) => update(next.id, { progress }),
          )
        if (next.video) form.set('video', next.video)
        if (next.preview) {
          URL.revokeObjectURL(next.preview)
          urls.current.delete(next.preview)
        }
        const preview = URL.createObjectURL(form.get('sm') as Blob)
        urls.current.add(preview)
        update(next.id, { status: 'uploading', progress: 0, preview })
        const photo = await send(form, controller.signal, (progress) =>
          update(next.id, { progress }),
        )
        update(next.id, { status: 'done', progress: 100, photo, file: undefined, video: undefined })
        await invalidate()
      } catch (error) {
        update(next.id, {
          status: (error as Error).name === 'AbortError' ? 'cancelled' : 'failed',
          error: (error as Error).message,
        })
      } finally {
        active.current = null
        busy.current = false
        setTick((v) => v + 1)
      }
    })()
  }, [items, paused, tick])
  const enqueue = (files: File[], options: ImageOptions) => {
    const base = (file: File) =>
      (file.webkitRelativePath || file.name).replace(/\.[^.]+$/, '').toLowerCase()
    const videos = new Map(
      files.filter((f) => /\.(mov|mp4)$/i.test(f.name)).map((file) => [base(file), file]),
    )
    const added: UploadItem[] = files
      .filter((f) => /\.(jpe?g|png|webp|avif|heic|heif|tiff?)$/i.test(f.name))
      .slice(0, 200)
      .map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        file,
        video: videos.get(base(file)),
        options: { ...options, tags: [...options.tags], albumIds: [...options.albumIds] },
        status: 'queued',
        progress: 0,
      }))
    setItems((old) => [...old, ...added])
    return added.length
  }
  return (
    <Context.Provider
      value={{
        items,
        hasPending,
        paused,
        setPaused,
        enqueue,
        cancel: (id) => {
          if (active.current?.id === id) active.current.controller.abort()
          else update(id, { status: 'cancelled', error: '已取消' })
        },
        retry: (id) => update(id, { status: 'queued', error: undefined, progress: 0 }),
        clear: () =>
          setItems((old) =>
            old.filter((item) => {
              if (['queued', 'processing', 'uploading'].includes(item.status)) return true
              if (item.preview) {
                URL.revokeObjectURL(item.preview)
                urls.current.delete(item.preview)
              }
              return false
            }),
          ),
      }}
    >
      {children}
    </Context.Provider>
  )
}
