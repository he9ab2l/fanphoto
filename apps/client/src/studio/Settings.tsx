import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { SiteSettings } from '@fanphoto/contracts'
import { api, useInvalidate } from '../lib/api'
import { Button, ErrorState, Field, Spinner } from '../ui/primitives'
import { Input, ToggleField } from '../ui/fields'
import { Icon } from '../ui/icons'
import { Appearance } from '../ui/Appearance'

function SettingsForm({ initial }: { initial: SiteSettings }) {
  const [settings, setSettings] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const invalidate = useInvalidate(),
    patch = (next: Partial<SiteSettings>) => setSettings((settings) => ({ ...settings, ...next }))
  return (
    <form
      className="settings-layout"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
          await api('/admin/settings', { method: 'PATCH', body: JSON.stringify(settings) })
          await invalidate()
          toast('设置已保存')
        } catch (error) {
          setError((error as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="settings-main">
        <section className="settings-section surface">
          <h2>关于这面照片墙</h2>
          <Field label="站点名称">
            <Input
              className="text-input"
              value={settings.title}
              required
              maxLength={40}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </Field>
          <Field label="作者">
            <Input
              className="text-input"
              value={settings.author}
              required
              maxLength={80}
              onChange={(event) => patch({ author: event.target.value })}
            />
          </Field>
          <Field label="一句介绍">
            <Input
              className="text-input"
              value={settings.description}
              maxLength={160}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </Field>
        </section>
        <section className="settings-section surface">
          <h2>展示与隐私</h2>
          <ToggleField
            label="显示拍摄地点"
            hint="隐藏公开的地点、坐标字段，并排除地点字段搜索；标题和描述不会自动改写。"
            checked={settings.showLocation}
            onChange={(showLocation) => patch({ showLocation })}
          />
          <ToggleField
            label="允许下载高清照片"
            hint="公开下载文件不含嵌入 EXIF；原文件仅在工作室可取。"
            checked={settings.allowDownloads}
            onChange={(allowDownloads) => patch({ allowDownloads })}
          />
          <ToggleField
            label="保留上传原文件"
            hint="仅影响新导入照片；原文件不对访客开放。"
            checked={settings.keepOriginals}
            onChange={(keepOriginals) => patch({ keepOriginals })}
          />
          <ToggleField
            label="导入时抹去位置信息"
            hint="移除坐标与地点，并且不存储可能包含 GPS 的原始文件；仍保留高清清洁副本。"
            checked={settings.stripLocationOnUpload}
            onChange={(stripLocationOnUpload) => patch({ stripLocationOnUpload })}
          />
        </section>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button variant="solid" type="submit" disabled={busy}>
            {busy ? <Spinner /> : '保存设置'}
          </Button>
        </div>
      </div>
      <aside className="settings-side">
        <section className="settings-section surface">
          <Appearance />
        </section>
        <section className="settings-section surface">
          <h2>图库资料</h2>
          <p>导出元数据、相册与文件清单。完整备份请在服务器运行备份命令。</p>
          <a className="button button--outline" href="/api/admin/export">
            <Icon name="export" size={18} />
            导出元数据
          </a>
        </section>
      </aside>
    </form>
  )
}
export default function Settings() {
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ settings: SiteSettings }>('/admin/settings'),
  })
  return (
    <section className="studio-page">
      <header className="page-heading">
        <div>
          <h1>设置</h1>
          <p>让这里，更像你。</p>
        </div>
      </header>
      {query.isPending ? (
        <div className="studio-loading">
          <Spinner />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <SettingsForm initial={query.data!.settings} />
      )}
    </section>
  )
}
