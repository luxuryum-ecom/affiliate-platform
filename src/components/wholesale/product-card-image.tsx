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
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-100">
        <span className="text-3xl text-gray-300">📦</span>
        <span className="text-[10px] text-gray-400 text-center px-2 leading-tight">{alt}</span>
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
