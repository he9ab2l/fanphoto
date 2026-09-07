import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import type { PhotoDetail } from '@fanphoto/contracts'
import { api, useSite } from '../lib/api'
import { apiFilters, captureLabel } from '../lib/photos'
import { Button, ErrorState, IconButton, Spinner } from '../ui/primitives'
import { Icon } from '../ui/icons'
import { Metadata } from './Metadata'

export default function PhotoDialog() {
  const { id } = useParams(),
    location = useLocation(),
    navigate = useNavigate()
  const [open, setOpen] = useState(true),
    [info, setInfo] = useState(true)
  const [loaded, setLoaded] = useState(''),
    [failed, setFailed] = useState(''),
    [retry, setRetry] = useState(0)
  const reduced = useReducedMotion(),
    site = useSite()
  const closeButton = useRef<HTMLButtonElement>(null)
  const filters = useMemo(
    () =>
      new URLSearchParams(
        Object.entries(apiFilters(new URLSearchParams(location.search))).filter(
          ([, value]) => value,
        ),
      ).toString(),
    [location.search],
  )
  const query = useQuery({
    queryKey: ['photo', id, filters],
    queryFn: ({ signal }) => api<PhotoDetail>(`/photos/${id}?${filters}`, { signal }),
  })
  const photo = query.data?.photo
  const close = () =>
    location.state?.background ? navigate(-1) : navigate('/' + location.search, { replace: true })
  const turn = (next?: string | null) => {
    if (next) navigate(`/photo/${next}${location.search}`, { replace: true, state: location.state })
  }
  useEffect(() => {
    if (photo) document.title = `${photo.title} · ${site.data?.site.title || 'FanPhoto'}`
    return () => {
      document.title = site.data?.site.title || 'FanPhoto'
    }
  }, [photo?.id, photo?.title, site.data?.site.title])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,select,[role="listbox"]')) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        turn(query.data?.neighbors.previous)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        turn(query.data?.neighbors.next)
      }
      if (event.key.toLowerCase() === 'i') setInfo((value) => !value)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [query.data?.neighbors.previous, query.data?.neighbors.next, location])
  const share = async () => {
    try {
      const url = `${window.location.origin}/photo/${id}`
      if (navigator.share && navigator.maxTouchPoints > 0)
        await navigator.share({ title: photo?.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('照片链接已复制')
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast.error('请复制地址栏中的照片链接')
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(value) => {
        if (!value) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="detail-backdrop" />
        <Dialog.Popup
          className="detail-shell material"
          data-testid="photo-detail"
          initialFocus={closeButton}
        >
          <header className="detail-header">
            <div>
              <Dialog.Title>{photo?.title || '照片详情'}</Dialog.Title>
              <Dialog.Description>
                {photo ? captureLabel(photo) : '读取拍摄信息'}
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={<IconButton ref={closeButton} icon="close" label="关闭照片详情" />}
            />
          </header>
          {query.isPending ? (
            <div className="detail-loading">
              <Spinner label="读取照片详情" />
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : (
            photo && (
              <>
                <motion.div
                  layout={!reduced}
                  className={`detail-body ${info ? 'detail-body--info' : ''}`}
                >
                  <motion.figure
                    layout={!reduced}
                    className="detail-photo"
                    transition={{ type: 'spring', duration: 0.26, bounce: 0 }}
                    data-testid="detail-image-area"
                  >
                    {loaded !== photo.id && failed !== photo.id && (
                      <span className="image-loading">
                        <Spinner label="载入高清照片" />
                      </span>
                    )}
                    <motion.img
                      layout={reduced ? false : 'preserve-aspect'}
                      key={photo.id}
                      className={loaded === photo.id ? 'is-loaded' : ''}
                      src={photo.assets.lg.url + (retry ? `&retry=${retry}` : '')}
                      width={photo.width}
                      height={photo.height}
                      alt={photo.title}
                      draggable={false}
                      onLoad={() => setLoaded(photo.id)}
                      onError={() => setFailed(photo.id)}
                    />
                    {failed === photo.id && (
                      <ErrorState
                        error={new Error('高清图暂时无法载入')}
                        retry={() => {
                          setFailed('')
                          setRetry(Date.now())
                        }}
                      />
                    )}
                  </motion.figure>
                  <AnimatePresence>
                    {info && (
                      <motion.aside
                        className="detail-info"
                        id="photo-information"
                        aria-label="照片元数据"
                        initial={{ opacity: 0, transform: reduced ? 'none' : 'translateX(12px)' }}
                        animate={{ opacity: 1, transform: reduced ? 'none' : 'translateX(0)' }}
                        exit={{ opacity: 0, transform: reduced ? 'none' : 'translateX(12px)' }}
                        transition={{ duration: 0.18 }}
                      >
                        <Metadata photo={photo} />
                      </motion.aside>
                    )}
                  </AnimatePresence>
                </motion.div>
                <footer className="detail-toolbar">
                  <div className="detail-navigation">
                    <IconButton
                      icon="left"
                      label="上一张照片"
                      disabled={!query.data?.neighbors.previous}
                      onClick={() => turn(query.data?.neighbors.previous)}
                    />
                    <IconButton
                      icon="right"
                      label="下一张照片"
                      disabled={!query.data?.neighbors.next}
                      onClick={() => turn(query.data?.neighbors.next)}
                    />
                  </div>
                  <span className="detail-size">
                    {photo.file.width} × {photo.file.height}
                  </span>
                  <div className="detail-actions">
                    <IconButton icon="share" label="分享照片" onClick={() => void share()} />
                    {site.data?.site.allowDownloads && (
                      <a
                        className="button icon-button"
                        aria-label="下载高清照片"
                        title="下载高清照片"
                        href={`/api/v1/photos/${photo.id}/download`}
                      >
                        <Icon name="download" />
                      </a>
                    )}
                    <IconButton
                      icon="panel"
                      label={info ? '收起照片信息' : '展开照片信息'}
                      active={info}
                      aria-expanded={info}
                      aria-controls="photo-information"
                      onClick={() => setInfo((value) => !value)}
                    />
                  </div>
                </footer>
              </>
            )
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
