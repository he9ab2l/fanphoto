import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@base-ui/react/dialog'
import { Drawer } from '@base-ui/react/drawer'
import { motion, useReducedMotion } from 'motion/react'
import { useDrag } from '@use-gesture/react'
import '../styles/viewer.css'
import { toast } from 'sonner'
import type { PhotoDetail, PhotoPage, PhotoSummary } from '@fanphoto/contracts'
import { api, RequestError, useSite } from '../lib/api'
import { apiFilters } from '../lib/photos'
import { usePreferences } from '../lib/preferences'
import { imageAsset, imageQuality } from '../lib/image-loading'
import { Button, ErrorState, IconButton, cn } from '../ui/primitives'
import { DetailImage } from '../ui/PhotoImage'
import { Icon } from '../ui/icons'
import { GlassSurface } from '../glass/GlassSurface'
import { useGlassAmbient, blendGlassBg, tintFromPhoto } from '../glass/GlassEnvironment'
import { MATERIALS } from '../glass/GlassMaterial'
import { PhotoInfoBody, PhotoInfoHeader } from './PhotoInfo'
import { VIEWER, viewerLayout, type InfoState, type Viewport } from './viewer-layout'

function useViewport(): Viewport {
  const read = () => {
    const style = getComputedStyle(document.documentElement)
    return {
      width: window.innerWidth,
      height: window.visualViewport?.height || window.innerHeight,
      safeTop: parseFloat(style.getPropertyValue('--safe-top')) || 0,
      safeBottom: parseFloat(style.getPropertyValue('--safe-bottom')) || 0,
    }
  }
  const [viewport, setViewport] = useState(read)
  useEffect(() => {
    const update = () => setViewport(read())
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])
  return viewport
}

export default function PhotoDialog({ onReady }: { onReady?: () => void } = {}) {
  const { id } = useParams()
  const location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient()
  const site = useSite(),
    reduced = useReducedMotion(),
    viewport = useViewport()
  const { resolvedTheme } = usePreferences()
  const mobile = viewport.width <= VIEWER.breakpoint
  const [open, setOpen] = useState(true)
  const [readyPhoto, setReadyPhoto] = useState('')
  const imageReady = useCallback(
    (photoId: string) => {
      setReadyPhoto(photoId)
      onReady?.()
    },
    [onReady],
  )
  const [info, setInfo] = useState<InfoState>(() => (mobile ? 'collapsed' : 'full'))
  const shell = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null),
    infoButton = useRef<HTMLButtonElement>(null)
  const grip = useRef<HTMLButtonElement>(null),
    desktopInfo = useRef<HTMLDivElement>(null)
  const desktopScroll = useRef<HTMLDivElement>(null),
    mobileScroll = useRef<HTMLDivElement>(null)
  const sheetPopup = useRef<HTMLDivElement>(null),
    sheetFooter = useRef<HTMLElement>(null)
  const sheetViewerClose = useRef<HTMLDivElement>(null)
  const initialPhotoId = useRef(id)
  const returnFocus = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null,
  )
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
    staleTime: 30000,
  })
  const preview = location.state?.preview as { photo: PhotoSummary; url?: string } | undefined
  const cachedSummary = useMemo(() => {
    if (preview && preview.photo.id === id) return preview.photo
    for (const [, data] of client.getQueriesData<{ pages: PhotoPage[] }>({
      queryKey: ['photos', false],
    })) {
      const found = data?.pages.flatMap((page) => page.items).find((photo) => photo.id === id)
      if (found) return found
    }
    return undefined
  }, [id, preview, client])
  const forbidden = query.error instanceof RequestError && [403, 404].includes(query.error.status)
  const photo = forbidden ? undefined : query.data?.photo
  const summary = forbidden ? undefined : photo || cachedSummary
  // The photo environment drives every auto glass surface while this dialog
  // is open (dock behind the scrim, panel, sheet and controls all belong to it).
  useGlassAmbient(summary, resolvedTheme)
  const sheetBg = useMemo(
    () =>
      summary
        ? blendGlassBg(
            tintFromPhoto(summary.thumbHash, resolvedTheme),
            resolvedTheme,
            MATERIALS.thick[resolvedTheme].tint,
            MATERIALS.thick[resolvedTheme].opacity,
          )
        : undefined,
    [summary?.thumbHash, resolvedTheme],
  )
  const layout = viewerLayout(viewport, summary ? summary.width / summary.height : 1.5, info)
  const expanded = info !== 'collapsed'
  const locked = mobile && expanded
  useLayoutEffect(() => {
    const popup = sheetPopup.current,
      footer = sheetFooter.current
    if (!mobile || !expanded || !popup || !footer) return
    // Drawer registers its offsets as non-inheriting CSS properties. Mirror
    // only its inline lengths into the footer transform: no layout reads,
    // inherited animated variables, extra gesture engine or permanent rAF.
    const sync = () => {
      const snap = parseFloat(popup.style.getPropertyValue('--drawer-snap-point-offset')) || 0
      const swipe = parseFloat(popup.style.getPropertyValue('--drawer-swipe-movement-y')) || 0
      footer.style.transform = `translateY(${-Math.max(0, snap + swipe)}px)`
      if (sheetViewerClose.current)
        sheetViewerClose.current.style.transform = `translateY(${-(snap + swipe)}px)`
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(popup, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [mobile, expanded])
  const source = summary
    ? imageAsset(
        summary,
        viewport.width,
        viewport.height - VIEWER.phoneControls * 2,
        imageQuality(),
      ).url
    : ''
  // Hero WebGL lens: rebuild the photo region under the panel from the true
  // DOM image (never a page screenshot) whenever photo/layout changes.
  const webglPaintKey = summary
    ? `${summary.id}:${info}:${layout.photo.x}:${layout.photo.y}:${layout.photo.width}:${layout.photo.height}`
    : ''
  const paintPanelBackdrop = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const stageEl = stage.current
      const panelEl = panelRef.current
      if (!stageEl || !panelEl) return
      const rootStyle = getComputedStyle(document.documentElement)
      ctx.fillStyle = rootStyle.getPropertyValue('--canvas')
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = 'rgb(12 12 12 / 0.3)'
      ctx.fillRect(0, 0, width, height)
      const image = stageEl.querySelector<HTMLImageElement>('.detail-image-full')
      if (!image?.complete || !image.naturalWidth) return
      const stageRect = stageEl.getBoundingClientRect()
      const panelRect = panelEl.getBoundingClientRect()
      ctx.drawImage(
        image,
        stageRect.left + layout.photo.x - panelRect.left,
        stageRect.top + layout.photo.y - panelRect.top,
        layout.photo.width,
        layout.photo.height,
      )
    },
    [layout.photo.x, layout.photo.y, layout.photo.width, layout.photo.height],
  )
  const webglOn = !mobile && expanded && Boolean(summary) && readyPhoto === summary?.id
  const close = useCallback(() => {
    if (location.state?.background) navigate(-1)
    else navigate('/' + location.search, { replace: true })
  }, [location.state, location.search, navigate])
  const turn = useCallback(
    (next?: string | null) => {
      if (!next || locked) return
      navigate(`/photo/${next}${location.search}`, { replace: true, state: location.state })
    },
    [locked, location.search, location.state, navigate],
  )
  const toggleInfo = useCallback(() => {
    if (
      !mobile &&
      expanded &&
      (desktopInfo.current?.contains(document.activeElement) ||
        document.activeElement?.closest('.detail-title-popover'))
    )
      infoButton.current?.focus({ preventScroll: true })
    setInfo((value) => (value === 'collapsed' ? (mobile ? 'partial' : 'full') : 'collapsed'))
  }, [mobile, expanded])
  useEffect(() => {
    if (!mobile && info === 'partial') setInfo('full')
  }, [mobile, info])
  useEffect(() => {
    if (summary) document.title = `${summary.title} · ${site.data?.site.title || 'FanPhoto'}`
    return () => {
      document.title = site.data?.site.title || 'FanPhoto'
    }
  }, [summary?.title, site.data?.site.title])
  useLayoutEffect(() => {
    // Switching photo starts its metadata at the top. Toggling the panel does
    // not remount it or touch its scroll position.
    if (desktopScroll.current) desktopScroll.current.scrollTop = 0
    if (mobileScroll.current) mobileScroll.current.scrollTop = 0
  }, [id])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof Element &&
          event.target.closest(
            'input,textarea,select,[contenteditable="true"],[role="listbox"],[role="menu"],[role="slider"]',
          ))
      )
        return
      if (!locked && event.key === 'ArrowLeft') {
        event.preventDefault()
        turn(query.data?.neighbors.previous)
      }
      if (!locked && event.key === 'ArrowRight') {
        event.preventDefault()
        turn(query.data?.neighbors.next)
      }
      if (event.key.toLowerCase() === 'i') {
        event.preventDefault()
        toggleInfo()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [locked, turn, toggleInfo, query.data?.neighbors.previous, query.data?.neighbors.next])
  useEffect(() => {
    if (!photo || readyPhoto !== photo.id) return
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    if (connection?.saveData || connection?.effectiveType === '2g') return
    const controller = new AbortController()
    for (const neighbor of [query.data?.neighbors.previous, query.data?.neighbors.next]) {
      if (!neighbor) continue
      void client
        .fetchQuery({
          queryKey: ['photo', neighbor, filters],
          queryFn: ({ signal }) => api<PhotoDetail>(`/photos/${neighbor}?${filters}`, { signal }),
          staleTime: 30000,
        })
        .then((detail) => {
          if (controller.signal.aborted) return
          const image = new Image()
          image.decoding = 'async'
          image.fetchPriority = 'low'
          image.src = detail.photo.assets.md.url
        })
        .catch(() => {})
    }
    return () => controller.abort()
  }, [
    photo?.id,
    readyPhoto,
    query.data?.neighbors.previous,
    query.data?.neighbors.next,
    filters,
    client,
  ])
  useDrag(
    ({ last, movement: [x, y], velocity: [vx], direction: [dx], tap, event }) => {
      if (!last || tap || locked || !mobile || Math.abs(y) > Math.abs(x) * 0.7) return
      if (event.target instanceof Element && event.target.closest('button,a')) return
      if (Math.abs(x) > 60 || (Math.abs(x) > 20 && vx > 0.5))
        turn(dx < 0 ? query.data?.neighbors.next : query.data?.neighbors.previous)
    },
    {
      target: stage,
      enabled: mobile && !locked,
      axis: 'x',
      filterTaps: true,
      threshold: 10,
      pointer: { touch: true },
    },
  )

  const share = async () => {
    try {
      const url = `${window.location.origin}/photo/${id}`
      if (navigator.share && navigator.maxTouchPoints > 0)
        await navigator.share({ title: summary?.title, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('照片链接已复制')
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError')
        toast.error('分享未完成，请复制地址栏中的照片链接')
    }
  }
  const actions = (
    <>
      <Button className="detail-share" disabled={!summary} onClick={() => void share()}>
        <Icon name="share" size={18} />
        分享
      </Button>
      {site.data?.site.allowDownloads && summary && (
        <a
          className="button button--solid detail-download"
          href={`/api/photos/${summary.id}/download`}
        >
          <Icon name="download" size={18} />
          下载图片
        </a>
      )}
    </>
  )
  const infoError = query.isError ? (
    <ErrorState error={query.error} retry={() => void query.refetch()} />
  ) : undefined
  const restoreFocus = () => {
    if (returnFocus.current?.isConnected) return returnFocus.current
    return (
      document.querySelector<HTMLElement>(`[data-photo-id="${initialPhotoId.current}"]`) ||
      document.querySelector<HTMLElement>('.brand-trigger') ||
      false
    )
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={setOpen}
      disablePointerDismissal={locked}
      onOpenChangeComplete={(value) => {
        if (!value) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="detail-backdrop" />
        <Dialog.Popup
          ref={shell}
          className="detail-shell"
          data-testid="photo-detail"
          data-info={info}
          initialFocus={closeButton}
          finalFocus={restoreFocus}
          style={{ width: layout.shellWidth, height: layout.shellHeight }}
        >
          <Dialog.Title className="sr-only" render={<span />}>
            照片详情
          </Dialog.Title>
          <div
            ref={stage}
            className="detail-stage"
            data-testid="detail-image-area"
            inert={locked}
            style={{ width: layout.stageWidth, height: layout.stageHeight }}
          >
            {summary ? (
              <motion.div
                className="detail-photo"
                layout={reduced ? false : 'preserve-aspect'}
                layoutDependency={`${info}:${viewport.width}:${viewport.height}:${id}`}
                transition={{ layout: { duration: 0.18, ease: 'easeOut' } }}
                style={{
                  width: layout.photo.width,
                  height: layout.photo.height,
                  left: layout.photo.x,
                  top: layout.photo.y,
                }}
              >
                <DetailImage
                  key={summary.id}
                  photo={summary}
                  source={source}
                  onReady={imageReady}
                  previewUrl={preview?.photo.id === summary.id ? preview.url : undefined}
                />
              </motion.div>
            ) : (
              <div className="detail-loading" role="status">
                {query.isError ? (
                  <ErrorState error={query.error} retry={() => void query.refetch()} />
                ) : (
                  <>
                    <Icon name="photo" size={32} />
                    <span>正在打开照片</span>
                  </>
                )}
              </div>
            )}
            <motion.div
              className="detail-nav detail-nav--prev"
              layout={reduced ? false : 'position'}
              style={{ top: layout.photo.y + layout.photo.height / 2 - VIEWER.navigationSize / 2 }}
              transition={{ layout: { duration: 0.18, ease: 'easeOut' } }}
            >
              <GlassSurface material="thin" shape="capsule" interactive specular>
                <IconButton
                  icon="left"
                  label="上一张照片"
                  disabled={!query.data?.neighbors.previous || locked}
                  onClick={() => turn(query.data?.neighbors.previous)}
                />
              </GlassSurface>
            </motion.div>
            <motion.div
              className="detail-nav detail-nav--next"
              layout={reduced ? false : 'position'}
              style={{ top: layout.photo.y + layout.photo.height / 2 - VIEWER.navigationSize / 2 }}
              transition={{ layout: { duration: 0.18, ease: 'easeOut' } }}
            >
              <GlassSurface material="thin" shape="capsule" interactive specular>
                <IconButton
                  icon="right"
                  label="下一张照片"
                  disabled={!query.data?.neighbors.next || locked}
                  onClick={() => turn(query.data?.neighbors.next)}
                />
              </GlassSurface>
            </motion.div>
            {!mobile && !expanded && summary && (
              <GlassSurface
                material="thin"
                shape="capsule"
                specular
                className="detail-float-actions"
              >
                {actions}
              </GlassSurface>
            )}
          </div>
          {!mobile && (
            <motion.div
              ref={desktopInfo}
              id="photo-information"
              className="detail-info-wrap"
              role="complementary"
              aria-label="照片信息"
              inert={!expanded}
              aria-hidden={!expanded}
              initial={false}
              animate={{ x: expanded ? 0 : VIEWER.infoWidth, opacity: expanded ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.18, ease: 'easeOut' }}
            >
              <GlassSurface
                className="detail-info"
                material="thick"
                shape="large"
                photo={summary}
                rootRef={panelRef}
                webgl={
                  webglOn
                    ? { enabled: true, paintKey: webglPaintKey, paintBackdrop: paintPanelBackdrop }
                    : undefined
                }
              >
                <PhotoInfoHeader photo={summary} active={expanded} />
                <div ref={desktopScroll} className="detail-info-scroll">
                  <PhotoInfoBody photo={photo}>{infoError}</PhotoInfoBody>
                </div>
                <footer className="detail-info-footer">{actions}</footer>
              </GlassSurface>
            </motion.div>
          )}
          {mobile && (
            <Drawer.Root
              open={expanded}
              modal
              disablePointerDismissal
              snapPoints={[layout.sheet.partial, layout.sheet.full]}
              snapPoint={info === 'full' ? layout.sheet.full : layout.sheet.partial}
              onSnapPointChange={(point) => {
                // Drawer resets its snap point after closing. That reset must
                // not turn the controlled, already-closed sheet back on.
                if (point !== null)
                  setInfo((current) =>
                    current === 'collapsed'
                      ? current
                      : point === layout.sheet.full
                        ? 'full'
                        : 'partial',
                  )
              }}
              onOpenChange={(value, details) => {
                if (details.reason === 'escape-key') setOpen(false)
                setInfo(value ? 'partial' : 'collapsed')
              }}
            >
              {!expanded && (
                <div className="detail-sheet-entry-area">
                  <Drawer.SwipeArea className="detail-sheet-swipe-area" />
                  <GlassSurface material="thin" shape="capsule" interactive specular>
                    <Drawer.Trigger
                      render={<Button ref={infoButton} className="detail-sheet-entry" />}
                    >
                      <Icon name="info" size={18} />
                      查看照片信息
                      <Icon name="up" size={16} />
                    </Drawer.Trigger>
                  </GlassSurface>
                </div>
              )}
              <Drawer.Portal keepMounted>
                <Drawer.Viewport className="detail-sheet-viewport">
                  <Drawer.Popup
                    ref={sheetPopup}
                    className={cn(
                      'detail-info',
                      'detail-sheet',
                      info === 'full' && 'detail-sheet--full',
                    )}
                    id="photo-information"
                    data-info-state={info}
                    initialFocus={grip}
                    finalFocus={() => infoButton.current || closeButton.current || false}
                    style={{ height: layout.sheet.full, '--glass-bg': sheetBg } as CSSProperties}
                  >
                    <Drawer.Title className="sr-only" render={<span />}>
                      照片信息
                    </Drawer.Title>
                    <div className="detail-sheet-body">
                      <div className="detail-sheet-handle">
                        <Button
                          ref={grip}
                          className="detail-sheet-grip"
                          aria-label={info === 'full' ? '半展开照片信息' : '展开完整照片信息'}
                          aria-expanded={info === 'full'}
                          aria-controls="photo-metadata"
                          onClick={() =>
                            setInfo((value) => (value === 'full' ? 'partial' : 'full'))
                          }
                        >
                          <span />
                        </Button>
                      </div>
                      <PhotoInfoHeader
                        photo={summary}
                        active={expanded}
                        control={
                          <Drawer.Close render={<IconButton icon="down" label="收起照片信息" />} />
                        }
                      />
                      <Drawer.Content
                        ref={mobileScroll}
                        id="photo-metadata"
                        className="detail-info-scroll"
                        inert={info !== 'full'}
                        aria-hidden={info !== 'full'}
                      >
                        <PhotoInfoBody photo={photo}>{infoError}</PhotoInfoBody>
                      </Drawer.Content>
                      <footer
                        ref={sheetFooter}
                        className="detail-info-footer"
                        style={{ '--sheet-start': `${-layout.sheet.full - 2}px` } as CSSProperties}
                      >
                        {actions}
                      </footer>
                    </div>
                    {expanded && (
                      <div
                        ref={sheetViewerClose}
                        className="detail-sheet-viewer-close"
                        style={
                          {
                            top: `calc(max(8px, env(safe-area-inset-top)) - ${viewport.height - layout.sheet.full}px)`,
                            '--sheet-start': `${-layout.sheet.full - 2}px`,
                          } as CSSProperties
                        }
                      >
                        <GlassSurface material="thin" shape="capsule" interactive specular>
                          <IconButton
                            icon="close"
                            label="关闭照片详情"
                            onClick={() => {
                              setInfo('collapsed')
                              setOpen(false)
                            }}
                          />
                        </GlassSurface>
                      </div>
                    )}
                  </Drawer.Popup>
                </Drawer.Viewport>
              </Drawer.Portal>
            </Drawer.Root>
          )}
          {!locked && (
            <GlassSurface
              material="thin"
              shape="capsule"
              interactive
              specular
              className="detail-corner"
            >
              {!mobile && (
                <IconButton
                  ref={infoButton}
                  icon="info"
                  label={expanded ? '收起照片信息' : '显示照片信息'}
                  aria-expanded={expanded}
                  aria-controls="photo-information"
                  onClick={toggleInfo}
                />
              )}
              <Dialog.Close
                render={<IconButton ref={closeButton} icon="close" label="关闭照片详情" />}
              />
            </GlassSurface>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
