'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { getProductInitials } from '@/lib/product-media'

interface ProductThumbnailProps {
  src: string | null | undefined
  name: string
  /** Container classes (controls size via w-/h-/aspect-) */
  className?: string
  imgClassName?: string
  /** Image object-fit */
  fit?: 'cover' | 'contain'
}

export function ProductThumbnail({
  src,
  name,
  className,
  imgClassName,
  fit = 'cover',
}: ProductThumbnailProps) {
  const [broken, setBroken] = useState(false)
  const showImage = Boolean(src?.trim()) && !broken
  const initials = getProductInitials(name)

  return (
    <div
      className={cn(
        'overflow-hidden bg-surface-2 flex items-center justify-center shrink-0',
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={name}
          className={cn(
            'w-full h-full',
            fit === 'cover' ? 'object-cover' : 'object-contain',
            imgClassName
          )}
          onError={() => setBroken(true)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          className="font-bold text-faint select-none"
          aria-hidden="true"
        >
          {initials}
        </span>
      )}
    </div>
  )
}
