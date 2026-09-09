import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Photo, UploadOptions } from '@fanphoto/contracts'
import { getCsrf, useInvalidate } from '../lib/api'

export type UploadDraft = Pick<UploadOptions, 'isPublic' | 'stripLocation' | 'tags' | 'albumIds'>
export interface UploadJob {
  id: string
  name: string
  size: number
  file?: File
  options: UploadDraft
  status: 'queued' | 'uploading' | 'processing' | 'done' | 'failed' | 'cancelled'
  progress: number
  error?: string
  photo?: Photo
  duplicate?: boolean
}
interface Queue {
  jobs: UploadJob[]
  paused: boolean
  pending: boolean
  enqueue: (files: File[], options: UploadDraft) => void
  pause: (value: boolean) => void
  retry: (id: string) => void
  remove: (id: string) => void
  clear: () => void
}
const Context = createContext<Queue | null>(null)
export const useUploadQueue = () => {
  const queue = useContext(Context)
  if (!queue) throw new Error('Upload queue provider is missing')
  return queue
}
export function UploadProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]),
    [paused, pause] = useState(false),
    [revision, setRevision] = useState(0)
  const active = useRef<XMLHttpRequest | null>(null),
    busy = useRef(false),
    invalidate = useInvalidate()
  const pending = jobs.some((job) => ['queued', 'uploading', 'processing'].includes(job.status))
  const update = (id: string, patch: Partial<UploadJob>) =>
    setJobs((jobs) => jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)))
  useEffect(() => {
    if (paused || busy.current) return
    const job = jobs.find((job) => job.status === 'queued' && job.file)
    if (!job) return
    busy.current = true
    const request = new XMLHttpRequest()
    active.current = request
    request.open('POST', '/api/admin/uploads')
    request.withCredentials = true
    request.setRequestHeader('X-CSRF-Token', getCsrf())
    request.responseType = 'json'
    request.timeout = 120000
    update(job.id, { status: 'uploading', progress: 0, error: undefined })
    const finish = () => {
      active.current = null
      busy.current = false
      setRevision((value) => value + 1)
    }
    const fail = (message: string) => {
      update(job.id, { status: 'failed', error: message })
      finish()
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        update(job.id, { progress: Math.round((event.loaded / event.total) * 100) })
    }
    request.upload.onload = () => update(job.id, { status: 'processing', progress: 100 })
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        update(job.id, {
          status: 'done',
          progress: 100,
          photo: request.response.photo,
          duplicate: request.response.duplicate,
          file: undefined,
        })
        void invalidate()
        finish()
      } else {
        if (request.status === 401) {
          pause(true)
          window.dispatchEvent(new Event('fanphoto:session-expired'))
        }
        fail(request.response?.error?.message || '上传失败，可以安全重试')
      }
    }
    request.onerror = () => fail('连接中断，可以安全重试')
    request.ontimeout = () => fail('服务器响应超时，可以安全重试')
    request.onabort = () => fail('上传已中断，可以安全重试')
    const form = new FormData()
    form.set('file', job.file!)
    form.set('options', JSON.stringify({ ...job.options, clientId: job.id }))
    request.send(form)
  }, [jobs, paused, revision])
  useEffect(() => {
    if (!pending) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending])
  useEffect(
    () => () => {
      active.current?.abort()
    },
    [],
  )
  return (
    <Context.Provider
      value={{
        jobs,
        paused,
        pending,
        pause,
        enqueue: (files, options) =>
          setJobs((jobs) => [
            ...jobs,
            ...files.slice(0, 200).map((file) => ({
              id: crypto.randomUUID(),
              name: file.name,
              size: file.size,
              file,
              options: { ...options, tags: [...options.tags], albumIds: [...options.albumIds] },
              status: file.size > 50 * 1024 * 1024 ? ('failed' as const) : ('queued' as const),
              progress: 0,
              error: file.size > 50 * 1024 * 1024 ? '原文件不能超过 50 MB' : undefined,
            })),
          ]),
        retry: (id) => update(id, { status: 'queued', error: undefined, progress: 0 }),
        remove: (id) =>
          setJobs((jobs) =>
            jobs.filter((job) => job.id !== id || ['uploading', 'processing'].includes(job.status)),
          ),
        clear: () =>
          setJobs((jobs) => jobs.filter((job) => !['done', 'cancelled'].includes(job.status))),
      }}
    >
      {children}
    </Context.Provider>
  )
}
