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

/** 信息栏形态：collapsed=收起 / partial=半展（手机底部面板）/ full=完整展开 */
type InfoState = 'collapsed' | 'partial' | 'full'

/** 布局切换宽度：低于此值使用手机端底部面板，避免右侧信息栏被压窄 */
const MOBILE_BREAKPOINT = 900
/** 桌面信息栏宽度与弹窗几何参数，集中一处便于调试 */
const INFO_WIDTH = 320
const SHELL_PAD_X = 24
const SHELL_PAD_Y = 20
const SHELL_GAP = 24
const SHELL_MAX_WIDTH = 1400
const SHELL_MARGIN = 88
const SHELL_MARGIN_Y = 96

export default function PhotoDialog() {
  const { id } = useParams(),
    location = useLocation(),
    navigate = useNavigate()
  const isMobile = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
  const [open, setOpen] = useState(true)
  const [mobile, setMobile] = useState(isMobile)
  const [info, setInfo] = useState<InfoState>(() => (isMobile() ? 'collapsed' : 'full'))
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }))
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
  /** 桌面端信息栏展开 ⇄ 收起；手机端信息入口 ⇄ 底部面板 */
  const toggleInfo = () =>
    setInfo((value) => {
      if (mobile) return value === 'collapsed' ? 'partial' : 'collapsed'
      return value === 'collapsed' ? 'full' : 'collapsed'
    })
  useEffect(() => {
    if (photo) document.title = `${photo.title} · ${site.data?.site.title || 'FanPhoto'}`
    return () => {
      document.title = site.data?.site.title || 'FanPhoto'
    }
  }, [photo?.id, photo?.title, site.data?.site.title])
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const onChange = (event: MediaQueryListEvent) => {
      setMobile(event.matches)
      // 手机端三种形态都合法，保持现状；桌面端没有 partial，回落到 full
      setInfo((value) => (event.matches ? value : value === 'partial' ? 'full' : value))
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
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
      if (event.key.toLowerCase() === 'i') toggleInfo()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // toggleInfo 为当次渲染闭包，依赖已覆盖其内部读取的 mobile/info
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.neighbors.previous, query.data?.neighbors.next, mobile, info])
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
  /** 桌面端图片显示尺寸：宽度与高度双约束，保持原始比例、完整显示不裁切 */
  const expanded = !mobile && info !== 'collapsed'
  const shellWidth = Math.min(SHELL_MAX_WIDTH, viewport.w - SHELL_MARGIN)
  const stageWidth = Math.max(
    0,
    shellWidth - SHELL_PAD_X * 2 - (expanded ? INFO_WIDTH + SHELL_GAP : 0),
  )
  const maxStageHeight = Math.max(0, viewport.h - SHELL_MARGIN_Y - SHELL_PAD_Y * 2)
  const fit = useMemo(() => {
    if (!photo || !stageWidth || !maxStageHeight) return null
    const ratio = photo.width / photo.height
    const displayH = Math.min(stageWidth / ratio, maxStageHeight)
    return { w: displayH * ratio, h: displayH }
  }, [photo, stageWidth, maxStageHeight])
  const shellHeight = fit
    ? Math.max(320, Math.min(Math.round(fit.h + SHELL_PAD_Y * 2), viewport.h - SHELL_MARGIN_Y))
    : 560
  /** 手机底部面板：拖 grip 上滑展开 / 下滑收起，松手按位移与速度投影目标档位 */
  const gripState = useRef({ y: 0, t: 0, vy: 0, active: false })
  const [gripY, setGripY] = useState(0)
  const onGripDown = (event: React.PointerEvent) => {
    gripState.current = { y: event.clientY, t: performance.now(), vy: 0, active: true }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onGripMove = (event: React.PointerEvent) => {
    if (!gripState.current.active) return
    const now = performance.now(),
      y = event.clientY
    gripState.current.vy = (y - gripState.current.y) / Math.max(1, now - gripState.current.t)
    setGripY(Math.max(-140, Math.min(140, y - gripState.current.y)))
  }
  const onGripUp = () => {
    if (!gripState.current.active) return
    gripState.current.active = false
    const pulled = gripY,
      fast = Math.abs(gripState.current.vy) > 1.2
    setGripY(0)
    if (fast ? gripState.current.vy < 0 : pulled < -60)
      setInfo((value) => (value === 'collapsed' ? 'partial' : 'full'))
    else if (fast ? gripState.current.vy > 0 : pulled > 60)
      setInfo((value) => (value === 'full' ? 'partial' : 'collapsed'))
  }
  const download = site.data?.site.allowDownloads && (
    <a
      className="button button--solid detail-download"
      href={`/api/v1/photos/${photo?.id}/download`}
    >
      <Icon name="download" size={17} />
      下载图片
    </a>
  )
  const shareButton = (
    <Button variant="quiet" className="detail-share" onClick={() => void share()}>
      <Icon name="share" size={17} />
      分享
    </Button>
  )
  const infoVisible = info === 'full' || (mobile && info === 'partial')
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
          style={mobile ? undefined : { height: shellHeight }}
        >
          <Dialog.Title className="sr-only">照片详情</Dialog.Title>
          {query.isPending ? (
            <div className="detail-loading">
              <Spinner label="读取照片详情" />
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : (
            photo && (
              <>
                <div
                  className={`detail-stage ${mobile && info === 'full' ? 'detail-stage--dimmed' : ''}`}
                  data-testid="detail-image-area"
                >
                  {loaded !== photo.id && failed !== photo.id && (
                    <span className="image-loading">
                      <Spinner label="载入高清照片" />
                    </span>
                  )}
                  <div
                    className="detail-photo"
                    style={mobile ? undefined : { width: fit?.w, height: fit?.h }}
                  >
                    <motion.img
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
                  </div>
                  {failed === photo.id && (
                    <ErrorState
                      error={new Error('高清图暂时无法载入')}
                      retry={() => {
                        setFailed('')
                        setRetry(Date.now())
                      }}
                    />
                  )}
                  {!mobile && !expanded && (
                    <div className="detail-float-actions">
                      <div className="glass-surface">
                        <div className="glass-surface__content">
                          {shareButton}
                          {download}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="detail-nav detail-nav--prev">
                    <IconButton
                      icon="left"
                      label="上一张照片"
                      disabled={!query.data?.neighbors.previous}
                      onClick={() => turn(query.data?.neighbors.previous)}
                    />
                  </div>
                  <div className="detail-nav detail-nav--next">
                    <IconButton
                      icon="right"
                      label="下一张照片"
                      disabled={!query.data?.neighbors.next}
                      onClick={() => turn(query.data?.neighbors.next)}
                    />
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {infoVisible && (
                    <motion.aside
                      className={`detail-info${info === 'full' ? ' detail-info--full' : ''}`}
                      id="photo-information"
                      aria-label="照片元数据"
                      initial={
                        reduced
                          ? { opacity: 0 }
                          : mobile
                            ? { opacity: 0, y: 24 }
                            : { opacity: 0, x: 16 }
                      }
                      animate={
                        reduced
                          ? { opacity: 1 }
                          : mobile
                            ? { opacity: 1, y: 0 }
                            : { opacity: 1, x: 0 }
                      }
                      exit={
                        reduced
                          ? { opacity: 0 }
                          : mobile
                            ? { opacity: 0, y: 24 }
                            : { opacity: 0, x: 16 }
                      }
                      transition={{ duration: 0.18 }}
                    >
                      <div
                        className="detail-sheet-grip"
                        role="button"
                        tabIndex={0}
                        aria-label="调整图片信息面板"
                        onPointerDown={onGripDown}
                        onPointerMove={onGripMove}
                        onPointerUp={onGripUp}
                        onPointerCancel={onGripUp}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            toggleInfo()
                          }
                        }}
                        onDragStart={(event) => event.preventDefault()}
                        style={{ transform: gripY ? `translateY(${gripY}px)` : undefined }}
                      >
                        <span className="detail-sheet-grip__bar" />
                      </div>
                      <header className="detail-info-header">
                        <div>
                          <h2 className="detail-info-title" title={photo.title}>
                            {photo.title}
                          </h2>
                          <p className="detail-info-date">{captureLabel(photo)}</p>
                        </div>
                        {mobile && (
                          <IconButton icon="down" label="收起照片信息" onClick={toggleInfo} />
                        )}
                      </header>
                      {(!mobile || info === 'full') && (
                        <div className="detail-info-scroll">
                          <Metadata photo={photo} />
                        </div>
                      )}
                      <footer className="detail-info-footer">
                        {shareButton}
                        {download}
                      </footer>
                    </motion.aside>
                  )}
                </AnimatePresence>
                {mobile && info === 'collapsed' && (
                  <button className="detail-sheet-entry" onClick={() => setInfo('partial')}>
                    <Icon name="info" size={18} />
                    展开照片信息
                  </button>
                )}
              </>
            )
          )}
          <div className="detail-corner">
            {!mobile && (
              <IconButton
                icon="panel"
                label={expanded ? '收起照片信息' : '展开照片信息'}
                aria-expanded={expanded}
                aria-controls="photo-information"
                onClick={toggleInfo}
              />
            )}
            <Dialog.Close
              render={<IconButton ref={closeButton} icon="close" label="关闭照片详情" />}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
