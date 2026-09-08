import { useRef } from 'react'
import { Popover } from '@base-ui/react/popover'
import { useAlbums, useSite } from '../lib/api'
import { Input, SelectField } from '../ui/fields'
import { Button } from '../ui/primitives'
import { Icon } from '../ui/icons'

export default function FilterPanel({
  filters,
  update,
  total,
}: {
  filters: Record<string, string>
  update: (updates: Record<string, string>) => void
  total: number
}) {
  const site = useSite(),
    albums = useAlbums(),
    input = useRef<HTMLInputElement>(null)
  return (
    <Popover.Popup className="popover material filter-panel" initialFocus={input}>
      <div className="popover-heading">
        <Popover.Title>筛选</Popover.Title>
        <Button
          onClick={() =>
            update({ q: '', tag: '', album: '', orientation: '', favorite: '', sort: '' })
          }
        >
          <Icon name="refresh" size={16} />
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
        <Popover.Close
          render={
            <Button variant="solid">
              <Icon name="check" size={17} />
              完成
            </Button>
          }
        />
      </div>
    </Popover.Popup>
  )
}
