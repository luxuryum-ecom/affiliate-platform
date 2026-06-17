'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'
import { uploadProductImage, formatProductImageUploadError } from '@/lib/product-image-upload'
import { isValidMediaUrl } from '@/lib/product-media'
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
  const t = useTranslations('admin.productForm')
  const tc = useTranslations('admin.common')

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
      else onError(t('coverDropError'))
    },
    [processFile, onError, t]
  )

  const hasCover = isValidMediaUrl(coverUrl)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted">
          {t('coverTitle')}{' '}
          <span className="text-faint font-normal">{t('coverHint')}</span>
        </p>
        {hasCover ? (
          <span className="text-xs px-1.5 py-0.5 rounded border bg-success-soft text-success-fg border-success font-medium">
            {t('coverLoaded')}
          </span>
        ) : (
          <span className="text-xs px-1.5 py-0.5 rounded border bg-warning-soft text-warning-fg border-warning font-medium">
            {t('coverNone')}
          </span>
        )}
      </div>

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
            ? 'border-primary bg-surface-2'
            : hasCover
            ? 'border-success hover:border-success hover:bg-success-soft/30'
            : 'border-warning hover:border-warning hover:bg-warning-soft/30',
          (disabled || uploading) && 'opacity-60 cursor-not-allowed pointer-events-none'
        )}
      >
        <ProductThumbnail
          src={coverUrl || null}
          name={productName || tc('productFallback')}
          className="w-24 h-24 rounded-xl border border-line text-xl"
        />

        <div className="flex-1 text-center sm:text-left min-w-0">
          {uploading ? (
            <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-muted">
              <span className="inline-block w-4 h-4 border-2 border-muted border-t-transparent rounded-full animate-spin" />
              {t('coverUploading')}
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                {hasCover ? t('coverReplace') : t('coverAdd')}
              </p>
              <p className="text-xs text-faint mt-1">{t('coverFileHint')}</p>
              <p className="text-xs text-faint">
                {t('coverBucketHint')}{' '}
                <code className="font-mono bg-surface-2 px-1 rounded">product-images</code>
              </p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
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
