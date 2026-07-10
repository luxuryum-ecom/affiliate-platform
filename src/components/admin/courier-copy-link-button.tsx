'use client'

import { useState } from 'react'

interface CourierCopyLinkButtonProps {
  url: string
  strings: { copy: string; copied: string }
}

/**
 * Copie le lien d'accès cloisonné du livreur (/courier?code=...). Calque exact
 * de `components/affiliate/copy-link-button.tsx` — données sérialisables
 * uniquement (RÈGLE ABSOLUE CLAUDE.md #2).
 */
export function CourierCopyLinkButton({ url, strings }: CourierCopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
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
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
        copied
          ? 'bg-success-soft border-success text-success-fg'
          : 'bg-surface border-line text-muted hover:bg-surface-2'
      }`}
    >
      {copied ? `✓ ${strings.copied}` : strings.copy}
    </button>
  )
}
