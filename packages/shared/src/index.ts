import { z } from 'zod'
export { cleanCanvasWebp } from './webp'

export const variants = ['original', 'sm', 'md', 'lg'] as const
export type Variant = (typeof variants)[number]
export const variantSizes: Record<Variant, number> = { original: 2048, sm: 400, md: 800, lg: 1600 }
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024
export const MAX_VIDEO_BYTES = 12 * 1024 * 1024
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/, '无效的记录 ID')
const text = (max: number) => z.string().trim().max(max)
const tagsSchema = z
  .array(text(30).min(1))
  .max(20)
  .transform((v) => [...new Set(v)])
const dateSchema = z.string().datetime({ offset: true }).nullable()
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const exifSchema = z
  .object({
    make: text(120).optional(),
    model: text(120).optional(),
    lens: text(180).optional(),
    iso: z.number().finite().min(0).max(10_000_000).optional(),
    aperture: z.number().finite().positive().max(1024).optional(),
    exposureTime: z.number().finite().positive().max(86400).optional(),
    focalLength: z.number().finite().positive().max(100000).optional(),
    focalLength35: z.number().finite().positive().max(100000).optional(),
    software: text(120).optional(),
    artist: text(120).optional(),
    copyright: text(240).optional(),
  })
  .strip()
export const analysisSchema = z.object({
  colors: z.array(colorSchema).min(1).max(6),
  histogram: z.array(z.number().finite().min(0).max(1)).length(64),
  brightness: z.number().finite().min(0).max(100),
  contrast: z.number().finite().min(0).max(100),
  tone: z.enum(['low-key', 'high-key', 'high-contrast', 'balanced']),
})
export const photoEditSchema = z
  .object({
    title: text(160).min(1, '请填写照片标题'),
    description: text(3000),
    takenAt: dateSchema,
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    location: text(160),
    tags: tagsSchema,
    albumIds: z.array(idSchema).max(20),
    featured: z.boolean(),
    published: z.boolean(),
  })
  .strict()
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: '经纬度需要同时填写或清除',
    path: ['latitude'],
  })
export const uploadSchema = z
  .object({
    clientId: z.string().uuid(),
    title: text(160).min(1),
    description: text(3000).default(''),
    width: z.number().int().positive().max(2048),
    height: z.number().int().positive().max(2048),
    takenAt: dateSchema.default(null),
    latitude: z.number().finite().min(-90).max(90).nullable().default(null),
    longitude: z.number().finite().min(-180).max(180).nullable().default(null),
    location: text(160).default(''),
    exif: exifSchema.default({}),
    tags: tagsSchema.default([]),
    albumIds: z.array(idSchema).max(20).default([]),
    featured: z.boolean().default(false),
    published: z.boolean().default(true),
    eraseLocation: z.boolean().default(false),
    thumbHash: z
      .string()
      .regex(/^[A-Za-z0-9+/=]*$/)
      .max(100)
      .nullable()
      .default(null),
    analysis: analysisSchema.nullable().default(null),
    sourceName: text(240).default(''),
  })
  .strict()
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: '经纬度需要成对提供',
    path: ['latitude'],
  })
const webUrl = z.union([
  z.literal(''),
  z
    .string()
    .url()
    .max(400)
    .refine((v) => /^https?:\/\//.test(v), '仅支持 HTTP / HTTPS 链接'),
])
export const siteSchema = z
  .object({
    title: text(40).min(1),
    slogan: text(120),
    author: text(60).min(1),
    bio: text(2000),
    location: text(100),
    website: webUrl,
    instagram: webUrl,
    showLocation: z.boolean(),
    eraseLocationOnUpload: z.boolean(),
    allowDownload: z.boolean(),
  })
  .strict()
export const albumSchema = z
  .object({
    title: text(100).min(1, '请填写相册名称'),
    description: text(1000).default(''),
    coverId: idSchema.nullable().default(null),
  })
  .strict()
export const batchSchema = z
  .object({
    ids: z
      .array(idSchema)
      .min(1)
      .max(100)
      .transform((v) => [...new Set(v)]),
    action: z.enum([
      'trash',
      'restore',
      'publish',
      'unpublish',
      'feature',
      'unfeature',
      'add-to-album',
    ]),
    albumId: idSchema.optional(),
  })
  .strict()
export type Exif = z.infer<typeof exifSchema>
export type Analysis = z.infer<typeof analysisSchema>
export type PhotoEdit = z.infer<typeof photoEditSchema>
export type UploadMeta = z.infer<typeof uploadSchema>
export type SiteSettings = z.infer<typeof siteSchema>
export type AlbumInput = z.infer<typeof albumSchema>
export type BatchInput = z.infer<typeof batchSchema>
export interface Photo {
  id: string
  title: string
  description: string
  width: number
  height: number
  takenAt: string | null
  createdAt: string
  updatedAt: string
  latitude: number | null
  longitude: number | null
  location: string
  exif: Exif
  tags: string[]
  albumIds: string[]
  featured: boolean
  published: boolean
  deletedAt: string | null
  thumbHash: string | null
  analysis: Analysis | null
  urls: Record<Variant, string>
  videoUrl: string | null
  bytes: number
  sourceName: string
  isDemo: boolean
}
export interface PhotoList {
  photos: Photo[]
  nextCursor: string | null
  total: number
}
export interface PhotoDetail {
  photo: Photo
  previousId: string | null
  nextId: string | null
}
export interface Album {
  id: string
  title: string
  description: string
  coverId: string | null
  cover: Photo | null
  photoCount: number
  createdAt: string
}
export interface SiteResponse {
  site: SiteSettings
  stats: { photos: number; albums: number; locations: number }
  tags: { name: string; count: number }[]
}
export interface AuthState {
  authenticated: boolean
  csrfToken?: string
  expiresAt?: string
}
export interface AdminStats {
  photos: number
  published: number
  featured: number
  trash: number
  albums: number
  bytes: number
  recent: Photo[]
  months: { month: string; count: number }[]
}
export const defaultSite: SiteSettings = {
  title: 'Fanphoto',
  slogan: '把瞬间，留在这里。',
  author: 'Fan',
  bio: '一些日常，一些远方。\n用照片，收集值得记住的瞬间。',
  location: 'Somewhere on Earth',
  website: '',
  instagram: '',
  showLocation: true,
  eraseLocationOnUpload: false,
  allowDownload: true,
}
