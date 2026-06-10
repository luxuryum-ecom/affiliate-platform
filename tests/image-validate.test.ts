import { describe, it, expect } from 'vitest'
import { detectImageType, validateImage } from '@/lib/image-validate'

// Constructeurs d'en-têtes minimaux valides (octets réels, pas de vraie image).
function png(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, // IHDR
    (w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255,
    (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255,
  ])
}
function jpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0, 0, 0, 0,
  ])
}
function webpVP8X(w: number, h: number): Uint8Array {
  const a = new Uint8Array(30)
  for (let i = 0; i < 4; i++) a[i] = 'RIFF'.charCodeAt(i)
  for (let i = 0; i < 4; i++) a[8 + i] = 'WEBP'.charCodeAt(i)
  for (let i = 0; i < 4; i++) a[12 + i] = 'VP8X'.charCodeAt(i)
  const W = w - 1, H = h - 1
  a[24] = W & 255; a[25] = (W >> 8) & 255; a[26] = (W >> 16) & 255
  a[27] = H & 255; a[28] = (H >> 8) & 255; a[29] = (H >> 16) & 255
  return a
}
function webpVP8(w: number, h: number): Uint8Array {
  const a = new Uint8Array(30)
  for (let i = 0; i < 4; i++) a[i] = 'RIFF'.charCodeAt(i)
  for (let i = 0; i < 4; i++) a[8 + i] = 'WEBP'.charCodeAt(i)
  for (let i = 0; i < 4; i++) a[12 + i] = 'VP8 '.charCodeAt(i)
  a[23] = 0x9d; a[24] = 0x01; a[25] = 0x2a // start code
  a[26] = w & 0xff; a[27] = (w >> 8) & 0x3f
  a[28] = h & 0xff; a[29] = (h >> 8) & 0x3f
  return a
}
function webpVP8L(w: number, h: number): Uint8Array {
  const a = new Uint8Array(30)
  for (let i = 0; i < 4; i++) a[i] = 'RIFF'.charCodeAt(i)
  for (let i = 0; i < 4; i++) a[8 + i] = 'WEBP'.charCodeAt(i)
  for (let i = 0; i < 4; i++) a[12 + i] = 'VP8L'.charCodeAt(i)
  a[20] = 0x2f // signature
  const W = w - 1, H = h - 1
  a[21] = W & 0xff
  a[22] = ((W >> 8) & 0x3f) | ((H & 0x3) << 6)
  a[23] = (H >> 2) & 0xff
  a[24] = (H >> 10) & 0x0f
  return a
}
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0])
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

describe('detectImageType (magic bytes, jamais l\'extension)', () => {
  it('reconnaît jpg / png / webp', () => {
    expect(detectImageType(jpeg(10, 10))).toBe('image/jpeg')
    expect(detectImageType(png(10, 10))).toBe('image/png')
    expect(detectImageType(webpVP8X(10, 10))).toBe('image/webp')
  })
  it('rejette svg / gif / vide / aléatoire → null', () => {
    expect(detectImageType(svg)).toBeNull()
    expect(detectImageType(gif)).toBeNull()
    expect(detectImageType(new Uint8Array(0))).toBeNull()
    expect(detectImageType(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })
})

describe('validateImage', () => {
  it('valide png/jpeg/webp + extrait dimensions', () => {
    const p = validateImage(png(100, 200))
    expect(p).toMatchObject({ ok: true, mediaType: 'image/png', ext: 'png', width: 100, height: 200 })
    const j = validateImage(jpeg(640, 480))
    expect(j).toMatchObject({ ok: true, mediaType: 'image/jpeg', width: 640, height: 480 })
    const w = validateImage(webpVP8X(800, 600))
    expect(w).toMatchObject({ ok: true, mediaType: 'image/webp', width: 800, height: 600 })
  })

  it('type forcé par le contenu, pas le nom (un PNG reste PNG)', () => {
    const r = validateImage(png(50, 50))
    expect(r.ok && r.mediaType).toBe('image/png')
  })

  it('rejette SVG (vecteur de script) et GIF', () => {
    expect(validateImage(svg)).toEqual({ ok: false, reason: 'not_an_image' })
    expect(validateImage(gif)).toEqual({ ok: false, reason: 'not_an_image' })
  })

  it('rejette dimensions excessives (anti décompression-bomb)', () => {
    expect(validateImage(png(20000, 100))).toEqual({ ok: false, reason: 'dimensions_too_large' })
    expect(validateImage(png(10000, 10000))).toEqual({ ok: false, reason: 'too_many_pixels' })
  })

  it('rejette vide et trop volumineux', () => {
    expect(validateImage(new Uint8Array(0))).toEqual({ ok: false, reason: 'empty' })
    expect(validateImage(png(10, 10), { maxBytes: 10 })).toEqual({ ok: false, reason: 'too_large' })
  })

  it('rejette dimensions nulles', () => {
    expect(validateImage(png(0, 100))).toEqual({ ok: false, reason: 'invalid_dimensions' })
  })

  it('gère les variantes WebP VP8 (lossy) et VP8L (lossless)', () => {
    expect(validateImage(webpVP8(100, 200))).toMatchObject({ ok: true, mediaType: 'image/webp', width: 100, height: 200 })
    expect(validateImage(webpVP8L(100, 200))).toMatchObject({ ok: true, mediaType: 'image/webp', width: 100, height: 200 })
  })

  it('rejette un en-tête tronqué proprement (pas de crash)', () => {
    expect(validateImage(png(100, 200).slice(0, 18))).toEqual({ ok: false, reason: 'unreadable_dimensions' })
  })

  it('rejette un PDF déguisé', () => {
    expect(validateImage(pdf)).toEqual({ ok: false, reason: 'not_an_image' })
  })
})
