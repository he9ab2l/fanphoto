import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Popover } from '@base-ui/react/popover'
import { useAlbums, useSite } from '../lib/api'
import { Input, IconButton, Radio, RadioGroup, SelectField, Button } from '../ui/primitives'
import { Icon, type IconName } from '../ui/icons'
import { GlassSurface } from '../vendor/GlassSurface'
import { Appearance } from '../ui/Appearance'
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
  const site = useSite(),
    albums = useAlbums(),
    input = useRef<HTMLInputElement>(null)
  const modes: { value: WallMode; label: string; icon: IconName }[] = [
    { value: 'flat', label: '平铺', icon: 'grid' },
    { value: 'cylinder', label: '圆柱', icon: 'cylinder' },
    { value: 'sphere', label: '球面', icon: 'sphere' },
  ]
  const active = Object.entries(filters).some(
    ([key, value]) => value && key !== 'sort' && key !== 'limit',
  )
  return (
    <>
      <div className="gallery-brand">
        <Popover.Root>
          <Popover.Trigger className="brand-trigger" aria-label="FanPhoto 菜单">
            <GlassSurface>
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
      <GlassSurface className="gallery-dock">
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
          <Popover.Trigger render={<IconButton icon="filter" label="筛选照片" active={active} />} />
          <Popover.Portal>
            <Popover.Positioner
              className="popover-positioner"
              side="top"
              sideOffset={14}
              align="center"
            >
              <Popover.Popup className="popover material filter-panel" initialFocus={input}>
                <div className="popover-heading">
                  <Popover.Title>筛选</Popover.Title>
                  <Button
                    onClick={() =>
                      update({ q: '', tag: '', album: '', orientation: '', favorite: '', sort: '' })
                    }
                  >
                    重置
                  </Button>
                </div>
                <label className="search-input">
                  <Icon name="search" />
                  <Input
                    ref={input}
                    value={filters.q || ''}
                    onChange={(event) => update({ q: event.target.value })}
                    placeholder="搜索照片、相机或标签"
                    aria-label="搜索照片"
                  />
                </label>
                <SelectField
                  label="照片比例"
                  value={filters.orientation || 'all'}
                  onChange={(orientation) => update({ orientation })}
                  items={[
                    { value: 'all', label: '所有比例' },
                    { value: 'landscape', label: '横幅' },
                    { value: 'portrait', label: '竖幅' },
                    { value: 'square', label: '方图' },
                    { value: 'panorama', label: '全景' },
                  ]}
                />
                <SelectField
                  label="相册"
                  value={filters.album || ''}
                  onChange={(album) => update({ album })}
                  items={[
                    { value: '', label: '所有相册' },
                    ...(albums.data?.items || []).map((album) => ({
                      value: album.id,
                      label: album.title,
                    })),
                  ]}
                />
                <SelectField
                  label="标签"
                  value={filters.tag || ''}
                  onChange={(tag) => update({ tag })}
                  items={[
                    { value: '', label: '所有标签' },
                    ...(site.data?.tags || []).map((tag) => ({
                      value: tag.name,
                      label: `${tag.name} (${tag.count})`,
                    })),
                  ]}
                />
                <SelectField
                  label="排序"
                  value={filters.sort || 'newest'}
                  onChange={(sort) => update({ sort })}
                  items={[
                    { value: 'newest', label: '新到旧' },
                    { value: 'oldest', label: '旧到新' },
                  ]}
                />
                <Button
                  className="favorite-filter"
                  aria-pressed={filters.favorite === 'true'}
                  onClick={() => update({ favorite: filters.favorite ? '' : 'true' })}
                >
                  <Icon name="star" />
                  只看精选
                </Button>
                <div className="filter-result">
                  <span>{total} 张照片</span>
                  <Popover.Close render={<Button variant="solid">完成</Button>} />
                </div>
              </Popover.Popup>
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
                <Appearance />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </GlassSurface>
      <div className="gallery-count" aria-live="polite">
        {total} 张<span>{active ? '筛选中' : '照片'}</span>
      </div>
    </>
  )
}
