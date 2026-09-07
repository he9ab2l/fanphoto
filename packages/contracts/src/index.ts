import { z } from 'zod'

export const API_VERSION = 1
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 52 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 80_000_000
export const variants = ['original', 'sm', 'md', 'lg'] as const
export type Variant = (typeof variants)[number]
export const variantSizes = { original: 16380, sm: 400, md: 800, lg: 1600 } as const
export const idSchema = z.string().uuid()
const text = (max: number) => z.string().trim().max(max)
const tagsSchema = z
  .array(text(40).min(1))
  .max(30)
  .transform((tags) => [...new Set(tags.map((tag) => tag.normalize('NFC')))])
const httpUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//.test(value))

export const exifSchema = z
  .object({
    make: text(120).optional(),
    model: text(120).optional(),
    lens: text(180).optional(),
    iso: z.number().finite().positive().max(10_000_000).optional(),
    aperture: z.number().finite().positive().max(1024).optional(),
    exposureTime: z.number().finite().positive().max(86400).optional(),
    focalLength: z.number().finite().positive().max(100000).optional(),
    focalLength35: z.number().finite().positive().max(100000).optional(),
    software: text(120).optional(),
    artist: text(120).optional(),
    copyright: text(240).optional(),
  })
  .strip()
export type Exif = z.infer<typeof exifSchema>
export interface Analysis {
  colors: string[]
  histogram: number[]
  brightness: number
  contrast: number
  tone: 'low-key' | 'high-key' | 'high-contrast' | 'balanced'
}
export const attributionSchema = z
  .object({
    author: text(400),
    sourceUrl: httpUrl,
    license: text(200),
    licenseUrl: z.union([z.literal(''), httpUrl]),
  })
  .strict()
export type Attribution = z.infer<typeof attributionSchema>

export const uploadSchema = z
  .object({
    clientId: idSchema,
    title: text(160).min(1).optional(),
    description: text(3000).default(''),
    location: text(160).default(''),
    tags: tagsSchema.default([]),
    albumIds: z.array(idSchema).max(20).default([]),
    isPublic: z.boolean().default(true),
    favorite: z.boolean().default(false),
    stripLocation: z.boolean().default(false),
    attribution: attributionSchema.nullable().default(null),
  })
  .strict()
export type UploadOptions = z.infer<typeof uploadSchema>
export const photoEditSchema = z
  .object({
    title: text(160).min(1),
    description: text(3000),
    location: text(160),
    tags: tagsSchema,
    albumIds: z.array(idSchema).max(20),
    isPublic: z.boolean(),
    favorite: z.boolean(),
  })
  .strict()
export type PhotoEdit = z.infer<typeof photoEditSchema>

export const listSchema = z.object({
  q: text(160).default(''),
  tag: text(40).default(''),
  album: z.union([z.literal(''), idSchema]).default(''),
  orientation: z.enum(['all', 'landscape', 'portrait', 'square', 'panorama']).default('all'),
  favorite: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  status: z.enum(['all', 'public', 'private', 'trash']).default('all'),
  limit: z.coerce.number().int().min(1).max(80).default(24),
  cursor: z.string().max(1000).optional(),
})
export type ListOptions = z.infer<typeof listSchema>
export const batchSchema = z
  .object({
    ids: z
      .array(idSchema)
      .min(1)
      .max(100)
      .transform((ids) => [...new Set(ids)]),
    action: z.enum([
      'trash',
      'restore',
      'publish',
      'unpublish',
      'favorite',
      'unfavorite',
      'add-to-album',
    ]),
    albumId: idSchema.optional(),
  })
  .strict()
export type BatchAction = z.infer<typeof batchSchema>
export const albumSchema = z
  .object({
    title: text(100).min(1),
    description: text(1000).default(''),
  })
  .strict()
export type AlbumInput = z.infer<typeof albumSchema>
export const settingsSchema = z
  .object({
    title: text(40).min(1),
    description: text(160),
    author: text(80).min(1),
    showLocation: z.boolean(),
    allowDownloads: z.boolean(),
    keepOriginals: z.boolean(),
    stripLocationOnUpload: z.boolean(),
  })
  .strict()
export type SiteSettings = z.infer<typeof settingsSchema>
export const defaultSettings: SiteSettings = {
  title: 'FanPhoto',
  description: '一些日常，一些远方。',
  author: 'Fan',
  showLocation: true,
  allowDownloads: true,
  keepOriginals: true,
  stripLocationOnUpload: false,
}
export interface Asset {
  url: string
  width: number
  height: number
  bytes: number
}
export interface PhotoSummary {
  id: string
  title: string
  width: number
  height: number
  capturedAt: string | null
  capturedLocal: string | null
  capturedOffset: string | null
  location: string
  tags: string[]
  favorite: boolean
  thumbHash: string | null
  assets: Record<Variant, Asset>
}
export interface Photo extends PhotoSummary {
  description: string
  latitude: number | null
  longitude: number | null
  exif: Exif
  analysis: Analysis
  attribution: Attribution | null
  albumIds: string[]
  createdAt: string
  updatedAt: string
  isPublic: boolean
  deletedAt: string | null
  file: {
    name: string | null
    mime: string
    bytes: number
    width: number
    height: number
    originalAvailable: boolean
  }
}
export interface PhotoPage {
  items: PhotoSummary[]
  page: { nextCursor: string | null; total: number; limit: number }
}
export interface AdminPhotoPage {
  items: Photo[]
  page: PhotoPage['page']
}
export interface PhotoDetail {
  photo: Photo
  neighbors: { previous: string | null; next: string | null }
}
export interface Album {
  id: string
  title: string
  description: string
  count: number
  cover: PhotoSummary | null
}
export interface SiteInfo {
  site: Pick<SiteSettings, 'title' | 'description' | 'author' | 'showLocation' | 'allowDownloads'>
  counts: { photos: number; albums: number }
  tags: { name: string; count: number }[]
}
export interface SessionInfo {
  authenticated: boolean
  csrfToken?: string
  expiresAt?: string
}
export interface LibraryStats {
  total: number
  public: number
  private: number
  trash: number
  favorites: number
  bytes: number
  albums: number
}
