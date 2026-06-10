'use client'

import { useState } from 'react'
import { ProductThumbnail } from '@/components/shared/product-thumbnail'

interface ProductGalleryProps {
  coverUrl: string | null
  galleryUrls: string[]
  productName: string
}

export function ProductGallery({ coverUrl, galleryUrls, productName }: ProductGalleryProps) {
  const allUrls = [coverUrl, ...galleryUrls.filter((u) => u !== coverUrl)].filter(
    (u): u is string => !!u
  )
  const [active, setActive] = useState(0)
  const current = allUrls[active] ?? null

  return (
    <div className="space-y-3">
      <ProductThumbnail
        src={current}
        name={productName}
        className="aspect-square w-full rounded-2xl border border-gray-100 text-5xl"
      />
      {allUrls.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
          {allUrls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 snap-start rounded-xl border-2 transition-colors ${
                i === active ? 'border-gray-900' : 'border-transparent'
              }`}
            >
              <ProductThumbnail
                src={url}
                name={`${productName} ${i + 1}`}
                className="h-16 w-16 rounded-lg"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
