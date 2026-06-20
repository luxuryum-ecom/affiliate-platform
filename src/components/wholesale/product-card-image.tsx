'use client'

import { useState } from 'react'

export const CATEGORY_ICONS: Record<string, string> = {
  'Textile':              '👗',
  'Matières premières':   '🧵',
  'Chaussures':           '👟',
  'Cosmétique & hygiène': '💄',
  'Alimentaire':          '🥗',
  'Maison & packaging':   '📦',
  'Artisanat':            '🧶',
}

interface ProductCardImageProps {
  src: string
  alt: string
  category?: string
}

export function ProductCardImage({ src, alt, category }: ProductCardImageProps) {
  const [errored, setErrored] = useState(false)
  const icon = (category && CATEGORY_ICONS[category]) ?? '🏷️'

  if (errored) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-bg border-b border-line">
        <span className="text-4xl">{icon}</span>
        <span className="text-[10px] text-muted font-semibold text-center px-2 leading-tight line-clamp-2">{alt}</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
      onError={() => setErrored(true)}
    />
  )
}
