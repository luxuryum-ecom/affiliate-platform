import { describe, it, expect } from 'vitest'
import {
  buildMessageKey,
  pickLargestPhoto,
  telegramUpdateSchema,
} from '@/lib/telegram/schema'

// Idempotence : la clé de dédoublonnage est déterministe à partir de
// (chat_id, message_id). C'est cette clé qui porte la contrainte UNIQUE en base
// (telegram_inbound.telegram_message_id + index unique sur supplier_products).
describe('buildMessageKey (idempotence)', () => {
  it('produit une clé stable pour le même message', () => {
    expect(buildMessageKey(42, 1001)).toBe('42:1001')
    expect(buildMessageKey(42, 1001)).toBe(buildMessageKey(42, 1001))
  })

  it('distingue deux messages différents', () => {
    expect(buildMessageKey(42, 1001)).not.toBe(buildMessageKey(42, 1002))
    expect(buildMessageKey(43, 1001)).not.toBe(buildMessageKey(42, 1001))
  })
})

describe('pickLargestPhoto', () => {
  it('choisit la plus grande taille', () => {
    const chosen = pickLargestPhoto([
      { file_id: 'a', file_size: 100 },
      { file_id: 'b', file_size: 900 },
      { file_id: 'c', file_size: 400 },
    ])
    expect(chosen?.file_id).toBe('b')
  })

  it('renvoie null si aucune photo', () => {
    expect(pickLargestPhoto([])).toBeNull()
  })

  it('tolère des tailles manquantes', () => {
    const chosen = pickLargestPhoto([{ file_id: 'a' }, { file_id: 'b', file_size: 10 }])
    expect(chosen?.file_id).toBe('b')
  })
})

describe('telegramUpdateSchema (validation webhook)', () => {
  it('valide un update photo + légende réaliste', () => {
    const res = telegramUpdateSchema.safeParse({
      update_id: 1,
      message: {
        message_id: 55,
        from: { id: 777, is_bot: false, username: 'fournisseur' },
        chat: { id: 777, type: 'private' },
        date: 1700000000,
        caption: 'Sac cuir 120 dh',
        photo: [{ file_id: 'small', file_size: 100 }, { file_id: 'big', file_size: 900 }],
      },
    })
    expect(res.success).toBe(true)
  })

  it('rejette une charge utile non conforme', () => {
    expect(telegramUpdateSchema.safeParse({ foo: 'bar' }).success).toBe(false)
    expect(telegramUpdateSchema.safeParse({ update_id: 'x' }).success).toBe(false)
  })

  it('accepte un update sans message (ack silencieux côté webhook)', () => {
    expect(telegramUpdateSchema.safeParse({ update_id: 2 }).success).toBe(true)
  })
})
