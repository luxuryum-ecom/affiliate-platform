// ─── Telegram Bot API — appels sortants (serveur uniquement) ─────────────────
// Le bot token reste côté serveur. Téléchargement borné (anti-abus).

import { validateImage, type ImageMediaType, type ImageExt } from '@/lib/image-validate'

export type { ImageMediaType }

const TELEGRAM_API = 'https://api.telegram.org'
const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // 10 MB — aligné sur le bucket Storage

function botToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN manquant')
  return t
}

export async function telegramSendMessage(chatId: number, text: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/bot${botToken()}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
  } catch {
    // L'échec d'un message de courtoisie ne doit jamais casser l'ingestion.
  }
}

export type DownloadedPhoto = {
  bytes: Uint8Array
  base64: string
  mediaType: ImageMediaType
  ext: ImageExt
}

/**
 * getFile → télécharge l'image, borne la taille, VALIDE le vrai type (magic bytes)
 * et les dimensions (anti décompression-bomb), renvoie bytes + base64.
 * Le type/extension proviennent des octets, JAMAIS du file_path Telegram.
 */
export async function telegramDownloadPhoto(fileId: string): Promise<DownloadedPhoto> {
  const metaRes = await fetch(
    `${TELEGRAM_API}/bot${botToken()}/getFile?file_id=${encodeURIComponent(fileId)}`,
  )
  const meta = (await metaRes.json()) as {
    ok: boolean
    result?: { file_path?: string; file_size?: number }
  }
  if (!meta.ok || !meta.result?.file_path) throw new Error('getFile a échoué')
  if (meta.result.file_size && meta.result.file_size > MAX_PHOTO_BYTES) {
    throw new Error('Photo trop volumineuse')
  }

  const filePath = meta.result.file_path
  const fileRes = await fetch(`${TELEGRAM_API}/file/bot${botToken()}/${filePath}`)
  if (!fileRes.ok) throw new Error('Téléchargement photo échoué')

  // Borne AVANT de bufferiser : rejette sur Content-Length si annoncé.
  const declared = fileRes.headers.get('content-length')
  if (declared && Number(declared) > MAX_PHOTO_BYTES) {
    throw new Error('Photo trop volumineuse')
  }

  const buf = new Uint8Array(await fileRes.arrayBuffer())
  if (buf.byteLength > MAX_PHOTO_BYTES) throw new Error('Photo trop volumineuse')

  // Vrai type via magic bytes + bornes dimensions (rejette svg/gif/pdf/bombe).
  const v = validateImage(buf, { maxBytes: MAX_PHOTO_BYTES })
  if (!v.ok) throw new Error(`image rejetée (${v.reason})`)

  return { bytes: buf, base64: Buffer.from(buf).toString('base64'), mediaType: v.mediaType, ext: v.ext }
}
