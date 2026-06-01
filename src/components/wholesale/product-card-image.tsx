'use client'

import { useState } from 'react'

interface ProductCardImageProps {
  src: string
  alt: string
}

export function ProductCardImage({ src, alt }: ProductCardImageProps) {
  const [errored, setErrored] = useState(false)

  if (errored) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-stone-50 to-amber-50">
        <span className="text-3xl opacity-40">🏷️</span>
        <span className="text-[10px] text-stone-400 font-medium text-center px-2 leading-tight line-clamp-2">{alt}</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
      onError={() => setErrored(true)}
    />
  )
}
