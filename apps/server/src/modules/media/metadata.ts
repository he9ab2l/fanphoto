import exifr from 'exifr'
import { exifSchema, type Exif } from '@fanphoto/contracts'

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined

function number(value: unknown): number | undefined {
  if (Array.isArray(value)) return number(value[0])
  if (typeof value === 'string' && /^\d+\/\d+$/.test(value)) {
    const [a, b] = value.split('/').map(Number)
    return b ? a / b : undefined
  }
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(result) && result > 0 ? result : undefined
}

export function captureDate(raw: unknown, rawOffset: unknown) {
  const source = raw instanceof Date ? raw.toISOString().slice(0, 19) : String(raw || '')
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(source)
  if (!match) return { takenAt: null, capturedLocal: null, capturedOffset: null }
  const local = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`
  const offset =
    typeof rawOffset === 'string' && /^[+-](0\d|1[0-4]):[0-5]\d$/.test(rawOffset) ? rawOffset : null
  // Unknown EXIF timezones stay unknown. UTC is a sorting surrogate only;
  // the UI displays capturedLocal and explicitly labels a missing timezone.
  const timestamp = Date.parse(local + (offset || 'Z'))
  if (
    !Number.isFinite(timestamp) ||
    new Date(Date.parse(local + 'Z')).toISOString().slice(0, 19) !== local
  )
    return { takenAt: null, capturedLocal: null, capturedOffset: null }
  return { takenAt: timestamp, capturedLocal: local, capturedOffset: offset }
}

export async function extractMetadata(bytes: Uint8Array) {
  let data: Record<string, unknown> = {}
  try {
    data = (await exifr.parse(bytes, { reviveValues: false, xmp: true, iptc: true })) || {}
  } catch {
    // Malformed XMP must not discard otherwise valid camera EXIF.
    try {
      data = (await exifr.parse(bytes, { reviveValues: false, xmp: false, iptc: false })) || {}
    } catch {
      // Sharp validates the image separately; absent metadata stays absent.
    }
  }
  const entries: Record<string, unknown> = {
    make: text(data.Make, 120),
    model: text(data.Model, 120),
    lens: text(data.LensModel ?? data.Lens ?? data.lens, 180),
    iso: number(data.ISO ?? data.ISOSpeedRatings ?? data.PhotographicSensitivity),
    aperture: number(data.FNumber),
    exposureTime: number(data.ExposureTime),
    focalLength: number(data.FocalLength),
    focalLength35: number(data.FocalLengthIn35mmFormat ?? data.FocalLengthIn35mmFilm),
    software: text(data.Software, 120),
    artist: text(data.Artist ?? data.Creator, 120),
    copyright: text(data.Copyright ?? data.Rights, 240),
  }
  // Validate each field independently: one malformed tag must not erase every
  // other camera field. GPS/serials/MakerNote are never part of the public EXIF.
  const exif: Exif = {}
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) continue
    const result = exifSchema.safeParse({ [key]: value })
    if (result.success) Object.assign(exif, result.data)
  }
  let latitude: number | null = null,
    longitude: number | null = null
  try {
    const gps = await exifr.gps(bytes)
    if (
      gps &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude) &&
      Math.abs(gps.latitude) <= 90 &&
      Math.abs(gps.longitude) <= 180
    ) {
      latitude = gps.latitude
      longitude = gps.longitude
    }
  } catch {
    /* no valid coordinate pair */
  }
  return {
    exif,
    latitude,
    longitude,
    location: [
      ...new Set(
        [
          text(data.Sublocation ?? data.SubLocation, 60),
          text(data.City, 60),
          text(data.State ?? data.ProvinceState, 60),
          text(data.Country ?? data.CountryName, 60),
        ].filter(Boolean),
      ),
    ]
      .join(' · ')
      .slice(0, 160),
    ...captureDate(
      data.DateTimeOriginal ?? data.CreateDate,
      data.OffsetTimeOriginal ?? data.OffsetTime,
    ),
  }
}
