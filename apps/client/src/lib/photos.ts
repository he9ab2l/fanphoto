import type { PhotoSummary, Exif } from '@fanphoto/contracts'
export const imageSet = (photo: PhotoSummary) =>
  [
    ...new Map(
      (['sm', 'md', 'lg'] as const).map((variant) => [
        photo.assets[variant].width,
        photo.assets[variant].url,
      ]),
    ).entries(),
  ]
    .map(([width, url]) => `${url} ${width}w`)
    .join(', ')
export const formatBytes = (value: number) =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : value >= 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : `${Math.max(1, Math.round(value / 1024))} KB`
export const captureLabel = (photo: PhotoSummary, time = false) =>
  photo.capturedLocal
    ? photo.capturedLocal.slice(0, time ? 19 : 10).replace('T', ' ')
    : photo.capturedAt
      ? new Intl.DateTimeFormat('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(photo.capturedAt))
      : '拍摄时间未记录'
export const exposure = (exif: Exif) =>
  exif.exposureTime
    ? exif.exposureTime < 1 &&
      Math.abs(1 / exif.exposureTime - Math.round(1 / exif.exposureTime)) < 0.001
      ? `1/${Math.round(1 / exif.exposureTime)} s`
      : `${Number(exif.exposureTime.toFixed(5))} s`
    : '未记录'
export const apiFilters = (search: URLSearchParams) =>
  Object.fromEntries(
    ['q', 'tag', 'album', 'orientation', 'favorite', 'sort'].map((key) => [
      key,
      search.get(key) || '',
    ]),
  )
