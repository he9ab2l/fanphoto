import type { ContentfulStatusCode } from 'hono/utils/http-status'
export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
export const notFound = () => {
  throw new ApiError(404, 'NOT_FOUND', '内容不存在或尚未公开')
}
