import { useEffect, useState, type ReactNode } from 'react'
import type { Photo, PhotoSummary } from '@fanphoto/contracts'
import { Popover } from '@base-ui/react/popover'
import { captureLabel } from '../lib/photos'
import { Icon } from '../ui/icons'
import { Metadata } from './Metadata'

export function PhotoInfoHeader({
  photo,
  control,
  active = true,
}: {
  photo?: PhotoSummary
  control?: ReactNode
  active?: boolean
}) {
  const [titleOpen, setTitleOpen] = useState(false)
  useEffect(() => {
    if (!active) setTitleOpen(false)
  }, [active])
  return (
    <header className="detail-info-header">
      <div className="detail-heading">
        {photo ? (
          <Popover.Root open={active && titleOpen} onOpenChange={setTitleOpen}>
            <h2 className="detail-info-title">
              <Popover.Trigger
                className="detail-title-trigger"
                aria-label={`查看完整标题：${photo.title}`}
              >
                {photo.title}
              </Popover.Trigger>
            </h2>
            <Popover.Portal>
              <Popover.Positioner
                className="popover-positioner detail-title-positioner"
                sideOffset={8}
                align="start"
              >
                <Popover.Popup
                  className="popover material detail-title-popover"
                  finalFocus={active}
                >
                  <Popover.Title>照片标题</Popover.Title>
                  <Popover.Description>{photo.title}</Popover.Description>
                  <Popover.Close className="button">收起</Popover.Close>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        ) : (
          <div className="detail-skeleton detail-skeleton--title" aria-hidden="true" />
        )}
        {photo && (
          <p className="detail-info-date">
            <Icon name="time" size={14} />
            {captureLabel(photo)}
          </p>
        )}
      </div>
      {control}
    </header>
  )
}

export function PhotoInfoBody({ photo, children }: { photo?: Photo; children?: ReactNode }) {
  if (children) return children
  if (photo) return <Metadata photo={photo} />
  return (
    <div className="detail-metadata-skeleton" role="status" aria-label="正在读取拍摄信息">
      {[0, 1, 2].map((group) => (
        <div key={group} aria-hidden="true">
          <div className="detail-skeleton detail-skeleton--label" />
          {[0, 1, 2].map((row) => (
            <div className="detail-skeleton-row" key={row}>
              <span className="detail-skeleton" />
              <span className="detail-skeleton" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
