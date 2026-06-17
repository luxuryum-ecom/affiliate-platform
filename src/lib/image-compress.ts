const MAX_INPUT_BYTES = 10 * 1024 * 1024
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const MAX_DIMENSION = 1600
const DEFAULT_QUALITY = 0.85

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

export class ImageCompressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageCompressError'
  }
}

/** HEIC/HEIF — détecté par MIME, sinon par extension (iOS livre souvent un MIME vide). */
export function isHeic(file: { type: string; name: string }): boolean {
  return HEIC_TYPES.has(file.type) || /\.hei[cf]$/i.test(file.name)
}

/**
 * Décode un HEIC/HEIF en JPEG côté client. La lib (libheif/WASM) est chargée
 * À LA DEMANDE : aucun impact sur le bundle initial ni sur les autres formats.
 */
async function decodeHeicToJpeg(file: File): Promise<File> {
  let convert: typeof import('heic2any')['default']
  try {
    convert = (await import('heic2any')).default
  } catch {
    throw new ImageCompressError(
      'Lecture HEIC indisponible sur cet appareil. Convertissez la photo en JPEG.'
    )
  }
  let out: Blob | Blob[]
  try {
    out = await convert({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  } catch {
    throw new ImageCompressError('Impossible de convertir cette image HEIC. Essayez un JPEG.')
  }
  const blob = Array.isArray(out) ? out[0] : out
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'product'
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageCompressError('Impossible de lire le fichier image.'))
    }
    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

function scaleDimensions(
  width: number,
  height: number,
  maxDim: number
): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) {
    return { width, height }
  }
  const ratio = Math.min(maxDim / width, maxDim / height)
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  }
}

/**
 * Resize and compress an image client-side before Supabase upload.
 * GIFs under 512 KB are kept as-is to preserve animation.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageCompressError('Image trop lourde (max 10 Mo avant compression).')
  }

  // HEIC/HEIF (format par défaut iPhone) : convertir en JPEG AVANT le pipeline canvas
  // (Chrome/Firefox/Android ne décodent pas HEIC nativement).
  let working = file
  if (isHeic(file)) {
    working = await decodeHeicToJpeg(file)
  } else if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageCompressError('Format non supporté. Utilisez JPEG, PNG, WebP ou HEIC.')
  }

  if (working.type === 'image/gif' && working.size <= 512 * 1024) {
    return working
  }

  const img = await loadImage(working)
  const { width, height } = scaleDimensions(img.naturalWidth, img.naturalHeight, MAX_DIMENSION)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageCompressError('Compression impossible dans ce navigateur.')

  ctx.drawImage(img, 0, 0, width, height)

  const preferWebp = typeof canvas.toDataURL('image/webp') === 'string'
    && canvas.toDataURL('image/webp').startsWith('data:image/webp')
  const outputType = preferWebp ? 'image/webp' : 'image/jpeg'
  const ext = preferWebp ? 'webp' : 'jpg'

  let quality = DEFAULT_QUALITY
  let blob = await canvasToBlob(canvas, outputType, quality)

  while (blob && blob.size > MAX_OUTPUT_BYTES && quality > 0.5) {
    quality -= 0.1
    blob = await canvasToBlob(canvas, outputType, quality)
  }

  if (!blob) {
    throw new ImageCompressError('Échec de la compression image.')
  }

  const baseName = working.name.replace(/\.[^.]+$/, '') || 'product'
  return new File([blob], `${baseName}.${ext}`, { type: outputType, lastModified: Date.now() })
}
