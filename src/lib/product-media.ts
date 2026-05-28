import type { MediaItem } from '@/types/database'

/** Minimal product shape needed to resolve cover / gallery URLs. */
export type ProductMediaSource = {
  name: string
  media?: MediaItem[] | null
  images?: string[] | null
}

const IMAGE_MEDIA_TYPES = new Set<MediaItem['type']>(['image'])

/** Returns true for non-empty http(s) URLs. */
export function isValidMediaUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** All image URLs in display order — media[] first, then legacy images[], deduped. */
export function getProductImageUrls(source: ProductMediaSource): string[] {
  const fromMedia = (source.media ?? [])
    .filter((m) => IMAGE_MEDIA_TYPES.has(m.type) && isValidMediaUrl(m.url))
    .map((m) => m.url.trim())

  const fromLegacy = (source.images ?? [])
    .filter(isValidMediaUrl)
    .map((u) => u.trim())

  const seen = new Set<string>()
  const result: string[] = []
  for (const url of [...fromMedia, ...fromLegacy]) {
    if (!seen.has(url)) {
      seen.add(url)
      result.push(url)
    }
  }
  return result
}

/** Cover / thumbnail URL — first valid image, or null. */
export function getProductCoverUrl(source: ProductMediaSource): string | null {
  return getProductImageUrls(source)[0] ?? null
}

/** Gallery URLs excluding the cover (for detail page thumbnails). */
export function getProductGalleryUrls(source: ProductMediaSource): string[] {
  return getProductImageUrls(source).slice(1)
}

/** Two-letter placeholder from product name. */
export function getProductInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '??'
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}
