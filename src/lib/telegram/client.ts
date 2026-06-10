// ─── Telegram Bot API — appels sortants (serveur uniquement) ─────────────────
// Le bot token reste côté serveur. Téléchargement borné (anti-abus).

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

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

export type DownloadedPhoto = {
  bytes: Uint8Array
  base64: string
  mediaType: ImageMediaType
  ext: 'jpg' | 'png' | 'webp'
}

function mediaFromPath(filePath: string): { mediaType: ImageMediaType; ext: 'jpg' | 'png' | 'webp' } {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (ext === 'png') return { mediaType: 'image/png', ext: 'png' }
  if (ext === 'webp') return { mediaType: 'image/webp', ext: 'webp' }
  return { mediaType: 'image/jpeg', ext: 'jpg' }
}

/** getFile → télécharge l'image, borne la taille, renvoie bytes + base64. */
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

  const { mediaType, ext } = mediaFromPath(filePath)
  return { bytes: buf, base64: Buffer.from(buf).toString('base64'), mediaType, ext }
}
