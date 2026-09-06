import type { Context } from 'hono'
import { z } from 'zod'
import type { ApiEnv } from './types'
export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
export async function readJson<T extends z.ZodTypeAny>(
  c: Context<ApiEnv>,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new ApiError(400, 'INVALID_JSON', '请求内容不是有效的 JSON')
  }
  return schema.parse(body)
}
export function notFound(message = '这条记录不存在，或已被移除'): never {
  throw new ApiError(404, 'NOT_FOUND', message)
}
