// ─── Validation d'image (source non fiable) — magic bytes + dimensions ───────
// Cadrage @security (B1/B2) : le type vient EXCLUSIVEMENT des octets de signature
// (jamais du nom/extension/Content-Type annoncé). SVG/GIF/PDF/HTML rejetés.
// Dimensions lues depuis l'en-tête (sans décoder l'image) → anti décompression-bomb.
// Pur, sans dépendance native (pas de sharp). Réutilisé par Telegram ET CSV.

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'
export type ImageExt = 'jpg' | 'png' | 'webp'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB (aligné bucket)
const MAX_DIMENSION = 12000 // px par côté
const MAX_PIXELS = 40_000_000 // 40 Mpx (anti pixel-flood)

const EXT_BY_TYPE: Record<ImageMediaType, ImageExt> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export type ImageValidation =
  | { ok: true; mediaType: ImageMediaType; ext: ImageExt; width: number; height: number }
  | { ok: false; reason: string }

// ── Détection par magic bytes (allowlist stricte : jpg/png/webp) ─────────────

export function detectImageType(b: Uint8Array): ImageMediaType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return 'image/png'
  // WebP : 'RIFF' (0-3) .... 'WEBP' (8-11)
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp'
  return null
}

// ── Lecture des dimensions depuis l'en-tête (pas de décodage complet) ────────

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u32be = (b: Uint8Array, o: number) =>
  b[o] * 0x1000000 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]

function pngDimensions(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null
  // chunk IHDR (type à 12-15)
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null
  return { width: u32be(b, 16), height: u32be(b, 20) }
}

function jpegDimensions(b: Uint8Array): { width: number; height: number } | null {
  let o = 2
  while (o + 9 < b.length) {
    if (b[o] !== 0xff) { o++; continue }
    let marker = b[o + 1]
    while (marker === 0xff && o + 1 < b.length) { o++; marker = b[o + 1] }
    o += 2
    // marqueurs sans segment de longueur
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (o + 1 >= b.length) break
    const segLen = u16be(b, o)
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isSof) {
      if (o + 7 >= b.length) break
      return { width: u16be(b, o + 5), height: u16be(b, o + 3) }
    }
    o += segLen
  }
  return null
}

function webpDimensions(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null
  const fmt = String.fromCharCode(b[12], b[13], b[14], b[15])
  if (fmt === 'VP8 ') {
    // lossy : start code 9D 01 2A à 23-25, dims 14-bit LE à 26 / 28
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff }
  }
  if (fmt === 'VP8L') {
    if (b[20] !== 0x2f) return null // signature
    const b1 = b[21], b2 = b[22], b3 = b[23], b4 = b[24]
    const width = (b1 | ((b2 & 0x3f) << 8)) + 1
    const height = (((b2 & 0xc0) >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) + 1
    return { width, height }
  }
  if (fmt === 'VP8X') {
    // étendu : canvas width-1 / height-1 en 24-bit LE à 24 / 27
    const width = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1
    const height = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1
    return { width, height }
  }
  return null
}

export function readDimensions(
  b: Uint8Array,
  type: ImageMediaType,
): { width: number; height: number } | null {
  if (type === 'image/png') return pngDimensions(b)
  if (type === 'image/jpeg') return jpegDimensions(b)
  return webpDimensions(b)
}

// ── Validation complète ──────────────────────────────────────────────────────

export function validateImage(
  b: Uint8Array,
  opts?: { maxBytes?: number; maxDimension?: number; maxPixels?: number },
): ImageValidation {
  const maxBytes = opts?.maxBytes ?? MAX_BYTES
  const maxDimension = opts?.maxDimension ?? MAX_DIMENSION
  const maxPixels = opts?.maxPixels ?? MAX_PIXELS

  if (b.length === 0) return { ok: false, reason: 'empty' }
  if (b.length > maxBytes) return { ok: false, reason: 'too_large' }

  const type = detectImageType(b)
  if (!type) return { ok: false, reason: 'not_an_image' } // svg/gif/pdf/html/… rejetés

  const dims = readDimensions(b, type)
  if (!dims) return { ok: false, reason: 'unreadable_dimensions' }
  if (dims.width <= 0 || dims.height <= 0) return { ok: false, reason: 'invalid_dimensions' }
  if (dims.width > maxDimension || dims.height > maxDimension) {
    return { ok: false, reason: 'dimensions_too_large' }
  }
  if (dims.width * dims.height > maxPixels) return { ok: false, reason: 'too_many_pixels' }

  return { ok: true, mediaType: type, ext: EXT_BY_TYPE[type], width: dims.width, height: dims.height }
}
