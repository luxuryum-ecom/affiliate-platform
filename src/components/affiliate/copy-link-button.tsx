'use client'

import { useState } from 'react'

interface CopyLinkButtonProps {
  url: string
  strings: { copy: string; copied: string }
}

/**
 * Copies the affiliate referral URL to clipboard and shows brief feedback.
 */
export function CopyLinkButton({ url, strings }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`w-full py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
        copied
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {copied ? `✓ ${strings.copied}` : strings.copy}
    </button>
  )
}
