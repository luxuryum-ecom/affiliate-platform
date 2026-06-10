'use client'

import { useActionState } from 'react'
import { cancelWholesaleOrderBuyer, updateWholesaleOrderBuyerNote } from '@/app/actions/orders'
import type { ActionState } from '@/types/orders'
import type { WholesaleOrderStatus } from '@/types/database'

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? '212600000000'

function WhatsAppIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.116 1.524 5.847L0 24l6.338-1.499A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.003-1.369l-.36-.213-3.732.882.938-3.629-.234-.373A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182c5.421 0 9.818 4.398 9.818 9.818 0 5.421-4.397 9.818-9.818 9.818z" />
    </svg>
  )
}

interface Props {
  orderId: string
  currentNote: string | null
  status: WholesaleOrderStatus
  orderRef?: string | null
}

const init: ActionState = { error: null, success: false }

export function WholesalePendingActions({ orderId, currentNote, status, orderRef }: Props) {
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelWholesaleOrderBuyer, init)
  const [noteState, noteAction, notePending] = useActionState(updateWholesaleOrderBuyerNote, init)

  const shortRef = orderRef ?? orderId.slice(0, 8).toUpperCase()

  function handleCancel(e: React.FormEvent) {
    if (!window.confirm('Annuler définitivement cette commande ?')) e.preventDefault()
  }

  if (status === 'pending') {
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Modifier la commande</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Commande en attente — vous pouvez mettre à jour votre note ou l&apos;annuler avant traitement.
          </p>
        </div>

        <form action={noteAction} className="space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <label className="block text-xs font-medium text-gray-600">Note pour l&apos;équipe</label>
          <textarea
            name="buyer_notes"
            defaultValue={currentNote ?? ''}
            rows={2}
            placeholder="Délai souhaité, instructions spéciales…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
          {noteState.error && (
            <p className="text-xs text-red-600">{noteState.error}</p>
          )}
          {noteState.success && (
            <p className="text-xs text-green-600">Note mise à jour.</p>
          )}
          <button
            type="submit"
            disabled={notePending}
            className="px-4 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {notePending ? 'Sauvegarde…' : 'Sauvegarder la note'}
          </button>
        </form>

        <hr className="border-gray-100" />

        <form action={cancelAction} onSubmit={handleCancel}>
          <input type="hidden" name="orderId" value={orderId} />
          {cancelState.error && (
            <p className="text-xs text-red-600 mb-2">{cancelState.error}</p>
          )}
          <button
            type="submit"
            disabled={cancelPending}
            className="px-4 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {cancelPending ? 'Annulation…' : 'Annuler la commande'}
          </button>
        </form>
      </div>
    )
  }

  if (status === 'confirmed' || status === 'sourcing' || status === 'shipped') {
    const msg = encodeURIComponent(
      `Bonjour, je souhaite demander l'annulation de ma commande #${shortRef}. Merci de me confirmer la procédure.`
    )
    return (
      <div className="bg-white rounded-xl border border-amber-200 p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Demander une annulation</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Commande en cours de traitement — l&apos;annulation se fait via notre équipe.
          </p>
        </div>
        <a
          href={`https://wa.me/${WHATSAPP_PHONE}?text=${msg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <WhatsAppIcon />
          Contacter via WhatsApp — #{shortRef}
        </a>
      </div>
    )
  }

  if (status === 'delivered') {
    const msg = encodeURIComponent(
      `Bonjour, je souhaite signaler un problème ou initier un retour pour ma commande #${shortRef}. Merci de me guider.`
    )
    return (
      <div className="bg-white rounded-xl border border-teal-200 p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Signaler un problème ou un retour</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Commande livrée — contactez-nous dans les 48h pour tout problème ou demande de retour.
          </p>
        </div>
        <a
          href={`https://wa.me/${WHATSAPP_PHONE}?text=${msg}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <WhatsAppIcon />
          Contacter via WhatsApp — #{shortRef}
        </a>
      </div>
    )
  }

  return null
}
