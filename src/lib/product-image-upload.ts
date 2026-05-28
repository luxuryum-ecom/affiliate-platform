'use client'

import { createClient } from '@/lib/supabase/client'
import { compressImageForUpload, ImageCompressError } from '@/lib/image-compress'

export function formatProductImageUploadError(err: unknown): string {
  if (err instanceof ImageCompressError) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: string }).message)
    if (msg.includes('bucket')) {
      return 'Bucket "product-images" introuvable — créez-le dans Supabase Storage (public).'
    }
    if (msg.includes('policy') || msg.includes('permission') || msg.includes('JWT')) {
      return 'Permission refusée — connectez-vous en tant qu\'admin.'
    }
    return `Upload échoué : ${msg}`
  }
  return 'Upload échoué. Réessayez.'
}

/** Compress, upload to product-images bucket, return public CDN URL. */
export async function uploadProductImage(file: File): Promise<string> {
  const compressed = await compressImageForUpload(file)
  const supabase = createClient()
  const ext = compressed.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(filename, compressed, {
      contentType: compressed.type,
      upsert: false,
      cacheControl: '31536000',
    })

  if (error) throw error

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(data.path)

  return urlData.publicUrl
}
