import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AuthState, SiteResponse, PhotoList, Album, Photo } from '@fanphoto/shared'
let csrf = ''
export const setCsrf = (token: string) => {
  csrf = token
}
export const getCsrf = () => csrf
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json')
  if (options.method && !['GET', 'HEAD'].includes(options.method)) headers.set('X-CSRF-Token', csrf)
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login')
      window.dispatchEvent(new Event('fanphoto:session-expired'))
    throw new ApiError(
      body?.error?.message || '暂时无法连接，请重试',
      response.status,
      body?.error?.code || 'UNKNOWN',
    )
  }
  return body as T
}
export function useAuth() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const auth = await api<AuthState>('/auth/me')
      setCsrf(auth.csrfToken || '')
      return auth
    },
    staleTime: 60_000,
  })
}
export const useSite = () =>
  useQuery({ queryKey: ['site'], queryFn: () => api<SiteResponse>('/site'), staleTime: 60_000 })
export const useAlbums = (admin = false) =>
  useQuery({
    queryKey: ['albums', admin],
    queryFn: () => api<{ albums: Album[] }>(admin ? '/admin/albums' : '/albums'),
    staleTime: 30_000,
  })
export function usePhotos(params: Record<string, string> = {}, admin = false) {
  return useInfiniteQuery({
    queryKey: ['photos', admin, params],
    initialPageParam: '',
    staleTime: 30_000,
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams(Object.entries(params).filter(([, value]) => !!value))
      if (pageParam) search.set('cursor', pageParam)
      return api<PhotoList>(`${admin ? '/admin/photos' : '/photos'}?${search}`)
    },
    getNextPageParam: (last) => last.nextCursor || undefined,
  })
}
export function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
}
export function srcSet(photo: Photo) {
  return (['sm', 'md', 'lg'] as const)
    .map((variant) => {
      const cap = { sm: 400, md: 800, lg: 1600 }[variant]
      return `${photo.urls[variant]} ${Math.round(photo.width * Math.min(1, cap / Math.max(photo.width, photo.height)))}w`
    })
    .join(', ')
}
export function formatBytes(value: number) {
  return value < 1024 * 1024
    ? `${Math.round(value / 1024)} KB`
    : value < 1024 ** 3
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : `${(value / 1024 ** 3).toFixed(2)} GB`
}
export const shortDate = (date: string | null) =>
  date
    ? new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(date))
    : '日期未记录'
