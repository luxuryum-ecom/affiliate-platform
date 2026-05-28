const MAX_INPUT_BYTES = 10 * 1024 * 1024
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const MAX_DIMENSION = 1600
const DEFAULT_QUALITY = 0.85

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export class ImageCompressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageCompressError'
  }
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
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageCompressError('Format non supporté. Utilisez JPEG, PNG ou WebP.')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageCompressError('Image trop lourde (max 10 Mo avant compression).')
  }
  if (file.type === 'image/gif' && file.size <= 512 * 1024) {
    return file
  }

  const img = await loadImage(file)
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

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'product'
  return new File([blob], `${baseName}.${ext}`, { type: outputType, lastModified: Date.now() })
}
