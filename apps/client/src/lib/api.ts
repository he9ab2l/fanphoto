import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Album, PhotoPage, AdminPhotoPage, SiteInfo, SessionInfo } from '@fanphoto/contracts'
let csrf = ''
export const getCsrf = () => csrf
export const setCsrf = (value: string) => {
  csrf = value
}
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json')
  if (options.method && !['GET', 'HEAD'].includes(options.method)) headers.set('X-CSRF-Token', csrf)
  const response = await fetch('/api' + path, {
    ...options,
    headers,
    credentials: 'same-origin',
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && path !== '/session')
      window.dispatchEvent(new Event('fanphoto:session-expired'))
    throw new RequestError(
      body?.error?.message || '连接暂不可用，请重试',
      response.status,
      body?.error?.code || 'NETWORK',
    )
  }
  return body
}
export const useSite = () =>
  useQuery({ queryKey: ['site'], queryFn: () => api<SiteInfo>('/site'), staleTime: 30000 })
export const useSession = () =>
  useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const session = await api<SessionInfo>('/session')
      csrf = session.csrfToken || ''
      return session
    },
    staleTime: 60000,
  })
export function usePhotos(filters: Record<string, string>, admin = false, enabled = true) {
  return useInfiniteQuery({
    enabled,
    queryKey: ['photos', admin, filters],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''))
      if (pageParam) query.set('cursor', pageParam)
      return api<PhotoPage | AdminPhotoPage>(`${admin ? '/admin' : ''}/photos?${query}`, { signal })
    },
    getNextPageParam: (page) => page.page.nextCursor || undefined,
    staleTime: 30000,
  })
}
export const useAlbums = (admin = false) =>
  useQuery({
    queryKey: ['albums', admin],
    queryFn: () => api<{ items: Album[] }>(`${admin ? '/admin' : ''}/albums`),
    staleTime: 30000,
  })
export function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
}
