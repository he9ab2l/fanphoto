import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { Popover } from '@base-ui/react/popover'
import { useSite } from '../lib/api'
import { IconButton, Radio, RadioGroup, Spinner } from '../ui/primitives'
import { Icon, type IconName } from '../ui/icons'
import { GlassSurface } from '../glass/GlassSurface'
const Appearance = lazy(() =>
  import('../ui/Appearance').then((module) => ({ default: module.Appearance })),
)
const FilterPanel = lazy(() => import('./FilterPanel'))
import type { WallMode } from './geometry'

export function GalleryControls({
  mode,
  onMode,
  filters,
  update,
  searchOpen,
  setSearchOpen,
  total,
}: {
  mode: WallMode
  onMode: (mode: WallMode) => void
  filters: Record<string, string>
  update: (updates: Record<string, string>) => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  total: number
}) {
  const site = useSite()
  const modes: { value: WallMode; label: string; icon: IconName }[] = [
    { value: 'flat', label: '平铺', icon: 'grid' },
    { value: 'surround', label: '环绕', icon: 'surround' },
  ]
  const active = Object.entries(filters).some(
    ([key, value]) => value && key !== 'sort' && key !== 'limit',
  )
  return (
    <>
      <div className="gallery-brand">
        <Popover.Root>
          <Popover.Trigger className="brand-trigger" aria-label="FanPhoto 菜单">
            <GlassSurface material="thin" shape="capsule" interactive specular>
              <Icon name="camera" size={21} />
              <span>{site.data?.site.title || 'FanPhoto'}</span>
            </GlassSurface>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="popover-positioner" sideOffset={10} align="start">
              <Popover.Popup className="popover material brand-menu">
                <Popover.Title>{site.data?.site.title || 'FanPhoto'}</Popover.Title>
                <Popover.Description>
                  {site.data?.site.description || '一些日常，一些远方。'}
                </Popover.Description>
                <Link to="/studio" className="menu-link">
                  <Icon name="lock" />
                  工作室
                  <Icon name="right" size={16} />
                </Link>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <div className="gallery-dock-pos">
        <GlassSurface material="thin" shape="capsule" interactive specular className="gallery-dock">
          <RadioGroup
            className="mode-options"
            value={mode}
            onValueChange={(value) => onMode(value as WallMode)}
            aria-label="照片墙模式"
          >
            {modes.map((item) => (
              <Radio.Root
                key={item.value}
                value={item.value}
                className="mode-option"
                aria-label={`${item.label}模式`}
                title={item.label}
              >
                <Icon name={item.icon} />
                <span className="mode-label">{item.label}</span>
              </Radio.Root>
            ))}
          </RadioGroup>
          <span className="dock-divider" aria-hidden="true" />
          <Popover.Root open={searchOpen} onOpenChange={setSearchOpen}>
            <Popover.Trigger
              render={<IconButton icon="filter" label="筛选照片" active={active} />}
            />
            <Popover.Portal>
              <Popover.Positioner
                className="popover-positioner"
                side="top"
                sideOffset={14}
                align="center"
              >
                <Suspense
                  fallback={
                    <Popover.Popup className="popover material filter-panel">
                      <Popover.Title>筛选</Popover.Title>
                      <Spinner label="载入筛选控件" />
                    </Popover.Popup>
                  }
                >
                  <FilterPanel filters={filters} update={update} total={total} />
                </Suspense>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
          <Popover.Root>
            <Popover.Trigger render={<IconButton icon="settings" label="显示设置" />} />
            <Popover.Portal>
              <Popover.Positioner
                className="popover-positioner"
                side="top"
                sideOffset={14}
                align="end"
              >
                <Popover.Popup className="popover material appearance-panel">
                  <Popover.Title className="sr-only">显示设置</Popover.Title>
                  <Suspense fallback={<Spinner label="载入显示设置" />}>
                    <Appearance />
                  </Suspense>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </GlassSurface>
      </div>
      <div className="gallery-count" aria-live="polite">
        {total} 张<span>{active ? '筛选中' : '照片'}</span>
      </div>
    </>
  )
}
