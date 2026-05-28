'use client'

import { useCallback, useRef, useState } from 'react'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { uploadProductImage, formatProductImageUploadError } from '@/lib/product-image-upload'
import { cn } from '@/lib/utils'

interface ProductCoverUploadProps {
  coverUrl: string
  productName: string
  disabled?: boolean
  onUploaded: (url: string) => void
  onError: (message: string) => void
}

export function ProductCoverUpload({
  coverUrl,
  productName,
  disabled = false,
  onUploaded,
  onError,
}: ProductCoverUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const processFile = useCallback(
    async (file: File) => {
      if (disabled || uploading) return
      setUploading(true)

      try {
        const url = await uploadProductImage(file)
        onUploaded(url)
      } catch (err) {
        onError(formatProductImageUploadError(err))
      } finally {
        setUploading(false)
        setDragOver(false)
      }
    },
    [disabled, uploading, onUploaded, onError]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file?.type.startsWith('image/')) void processFile(file)
      else onError('Déposez un fichier image (JPEG, PNG ou WebP).')
    },
    [processFile, onError]
  )

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600">
        Image de couverture <span className="text-gray-400 font-normal">(miniature catalogue)</span>
      </p>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled && !uploading) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={cn(
          'relative flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border-2 border-dashed transition-colors cursor-pointer',
          dragOver
            ? 'border-gray-900 bg-gray-50'
            : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50/50',
          (disabled || uploading) && 'opacity-60 cursor-not-allowed pointer-events-none'
        )}
      >
        <ProductThumbnail
          src={coverUrl || null}
          name={productName || 'Produit'}
          className="w-24 h-24 rounded-xl border border-gray-200 text-xl"
        />

        <div className="flex-1 text-center sm:text-left min-w-0">
          {uploading ? (
            <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-gray-600">
              <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Compression et upload en cours…
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-800">
                Glissez une image ici ou cliquez pour parcourir
              </p>
              <p className="text-xs text-gray-400 mt-1">
                JPEG, PNG, WebP · max 10 Mo · redimensionné automatiquement
              </p>
              <p className="text-xs text-gray-400">
                Bucket Supabase{' '}
                <code className="font-mono bg-gray-100 px-1 rounded">product-images</code>
              </p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void processFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
