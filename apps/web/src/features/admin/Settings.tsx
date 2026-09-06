import { useEffect, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ShieldCheck, Save, MapPin } from 'lucide-react'
import type { SiteSettings } from '@fanphoto/shared'
import { api, useInvalidate } from '../../lib/api'
import { Confirm, ErrorState, Spinner, Switch, useToast } from '../../components/ui'
export function Settings() {
  const result = useQuery({
      queryKey: ['settings'],
      queryFn: () => api<{ site: SiteSettings }>('/settings'),
      refetchOnWindowFocus: false,
    }),
    [form, setForm] = useState<SiteSettings | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [erase, setErase] = useState(false),
    invalidate = useInvalidate(),
    toast = useToast()
  useEffect(() => {
    if (result.data && !form) setForm(result.data.site)
  }, [result.data, form])
  if (result.isError) return <ErrorState error={result.error} retry={() => void result.refetch()} />
  if (!form)
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    )
  const update = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) =>
    setForm({ ...form, [key]: value })
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError('')
    try {
      await api('/settings', { method: 'PATCH', body: JSON.stringify(form) })
      await invalidate()
      toast('设置已保存')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }
  return (
    <section>
      <form onSubmit={save}>
        <div className="admin-page-heading">
          <h1>设置</h1>
          <button className="button primary" type="submit" disabled={pending}>
            {pending ? (
              <Spinner />
            ) : (
              <>
                <Save size={17} />
                保存
              </>
            )}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="settings-grid">
          <div className="settings-card glass">
            <h2>站点</h2>
            <div className="field-pair">
              <label className="field">
                <span>站点名称</span>
                <input
                  required
                  maxLength={40}
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                />
              </label>
              <label className="field">
                <span>作者</span>
                <input
                  required
                  maxLength={60}
                  value={form.author}
                  onChange={(e) => update('author', e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>一句话</span>
              <input
                maxLength={120}
                value={form.slogan}
                onChange={(e) => update('slogan', e.target.value)}
              />
            </label>
            <label className="field">
              <span>关于</span>
              <textarea
                rows={5}
                maxLength={2000}
                value={form.bio}
                onChange={(e) => update('bio', e.target.value)}
              />
            </label>
            <label className="field">
              <span>所在地点</span>
              <input
                maxLength={100}
                value={form.location}
                onChange={(e) => update('location', e.target.value)}
              />
            </label>
            <label className="field">
              <span>个人主页</span>
              <input
                type="url"
                placeholder="https://"
                maxLength={400}
                value={form.website}
                onChange={(e) => update('website', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Instagram</span>
              <input
                type="url"
                placeholder="https://instagram.com/"
                maxLength={400}
                value={form.instagram}
                onChange={(e) => update('instagram', e.target.value)}
              />
            </label>
          </div>
          <div className="settings-side">
            <div className="settings-card glass">
              <h2>
                <ShieldCheck size={18} />
                隐私
              </h2>
              <Switch
                label="允许下载"
                detail="公开照片的 WebP 原图"
                checked={form.allowDownload}
                onChange={(v) => update('allowDownload', v)}
              />
              <Switch
                label="公开拍摄位置"
                detail="照片详情与足迹地图"
                checked={form.showLocation}
                onChange={(v) => update('showLocation', v)}
              />
              <Switch
                label="上传时清除 GPS"
                detail="只影响之后上传的照片"
                checked={form.eraseLocationOnUpload}
                onChange={(v) => update('eraseLocationOnUpload', v)}
              />
            </div>
            <div className="settings-card glass">
              <h2>数据</h2>
              <a className="button glass full-width" href="/api/admin/export" download>
                <Download size={17} />
                导出元数据
              </a>
              <p className="muted small">
                JSON 包含照片信息、相册和设置。原图请使用服务器备份脚本单独备份。
              </p>
              <button
                className="button danger-outline full-width"
                type="button"
                onClick={() => setErase(true)}
              >
                <MapPin size={16} />
                清除所有位置
              </button>
            </div>
            <div className="settings-card glass">
              <h2>账号</h2>
              <p className="muted small">管理员密码由服务器环境管理，密钥不会发送到浏览器。</p>
              <span className="secure-label">
                <ShieldCheck size={15} />
                HttpOnly · CSRF 防护
              </span>
            </div>
          </div>
        </div>
      </form>
      {erase && (
        <Confirm
          title="清除所有拍摄位置？"
          detail="包括回收站中的照片。经纬度与地点文字会被永久清除，无法撤销。"
          confirmLabel="永久清除位置"
          danger
          onClose={() => setErase(false)}
          onConfirm={async () => {
            await api('/admin/privacy/erase-location', {
              method: 'POST',
              body: JSON.stringify({ confirm: 'ERASE_LOCATION' }),
            })
            await invalidate()
            toast('位置信息已清除')
          }}
        />
      )}
    </section>
  )
}
