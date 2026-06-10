'use client'

// ─── Carte de liaison Telegram (autoportante) ────────────────────────────────
// À monter dans n'importe quelle page fournisseur :
//   import { TelegramLinkCard } from '@/components/supplier/telegram-link-card'
//   <TelegramLinkCard initialStatus={await getTelegramLinkStatus()} />

import { useActionState } from 'react'
import {
  generateTelegramLinkCode,
  type TelegramLinkState,
} from '@/app/actions/telegram-link'

export function TelegramLinkCard({ initialStatus }: { initialStatus?: TelegramLinkState }) {
  const [state, action, isPending] = useActionState(
    generateTelegramLinkCode,
    initialStatus ?? { error: null },
  )

  const botUsername = state.botUsername ?? initialStatus?.botUsername ?? null

  if (state.linked || initialStatus?.linked) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-sm font-semibold text-emerald-800">Compte Telegram lié ✅</p>
        <p className="mt-1 text-xs text-emerald-700">
          Envoyez une photo de produit avec une courte description au bot
          {botUsername ? ` @${botUsername}` : ''}. Chaque produit est vérifié par un
          administrateur avant publication.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-semibold text-gray-900">Ajouter des produits par Telegram</p>
      <p className="mt-1 text-xs text-gray-500">
        Liez votre compte une seule fois, puis envoyez simplement photo + description au bot.
      </p>

      {state.code ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500">
            Ouvrez {botUsername ? `@${botUsername}` : 'le bot'} sur Telegram et envoyez&nbsp;:
          </p>
          <code className="block rounded-lg bg-gray-900 px-4 py-3 text-center text-lg font-mono tracking-widest text-white">
            /link {state.code}
          </code>
          <p className="text-xs text-gray-400">
            Code valable {state.expiresInMinutes ?? 30} minutes, à usage unique.
          </p>
        </div>
      ) : (
        <form action={action} className="mt-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? 'Génération…' : 'Générer mon code de liaison'}
          </button>
        </form>
      )}

      {state.error && <p className="mt-3 text-xs text-red-600">{state.error}</p>}
    </div>
  )
}
