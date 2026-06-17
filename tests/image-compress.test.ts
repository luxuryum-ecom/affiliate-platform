import { describe, it, expect } from 'vitest'
import { isHeic } from '@/lib/image-compress'

describe('isHeic', () => {
  it('détecte par MIME HEIC/HEIF', () => {
    expect(isHeic({ type: 'image/heic', name: 'photo.jpg' })).toBe(true)
    expect(isHeic({ type: 'image/heif', name: 'photo' })).toBe(true)
    expect(isHeic({ type: 'image/heic-sequence', name: 'x' })).toBe(true)
    expect(isHeic({ type: 'image/heif-sequence', name: 'x' })).toBe(true)
  })

  it('détecte par extension quand le MIME est vide (cas iPhone fréquent)', () => {
    expect(isHeic({ type: '', name: 'IMG_1234.HEIC' })).toBe(true)
    expect(isHeic({ type: '', name: 'img.heif' })).toBe(true)
    expect(isHeic({ type: 'application/octet-stream', name: 'a.heic' })).toBe(true)
  })

  it('ne déclenche pas sur les formats déjà acceptés', () => {
    expect(isHeic({ type: 'image/jpeg', name: 'photo.jpg' })).toBe(false)
    expect(isHeic({ type: 'image/png', name: 'photo.png' })).toBe(false)
    expect(isHeic({ type: 'image/webp', name: 'photo.webp' })).toBe(false)
    expect(isHeic({ type: 'image/gif', name: 'anim.gif' })).toBe(false)
  })
})
