'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/types/orders'

const fail = (msg: string): ActionState => ({ error: msg, success: false })
const ok: ActionState = { error: null, success: true }

/**
 * Wholesaler requests an invoice for a delivered order.
 * Can only be called once per order (invoice_requested is a one-way flag).
 * Billing fields are optional — pre-filled from profile but can be overridden.
 */
export async function requestInvoice(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const orderId = (formData.get('orderId') as string)?.trim()
  if (!orderId) return fail('Commande introuvable.')

  const invoice_company_name      = ((formData.get('company_name') as string)?.trim()) || null
  const invoice_ice               = ((formData.get('ice') as string)?.trim()) || null
  const invoice_registre_commerce = ((formData.get('registre_commerce') as string)?.trim()) || null
  const invoice_billing_address   = ((formData.get('billing_address') as string)?.trim()) || null

  // Fuite E1 (mig 116) : lecture via la vue redacted acheteur (WHERE buyer_id =
  // auth.uid() embarqué → ne renvoie que SES commandes ; plus de SELECT base). Le
  // garde order.buyer_id !== user.id devient redondant mais reste (défense en profondeur).
  const { data: order } = (await supabase
    .from('wholesale_orders_buyer_read')
    .select('id, status, buyer_id, invoice_requested')
    .eq('id', orderId)
    .single()) as {
    data: {
      id: string
      status: string
      buyer_id: string
      invoice_requested: boolean
    } | null
    error: unknown
  }

  if (!order) return fail('Commande introuvable.')
  if (order.buyer_id !== user.id) return fail('Accès non autorisé.')
  if (order.status !== 'delivered') return fail('La demande de facture est disponible uniquement après livraison.')
  if (order.invoice_requested) return fail('Une demande de facture a déjà été envoyée pour cette commande.')

  const { error } = await supabase
    .from('wholesale_orders')
    .update({
      invoice_requested: true,
      invoice_requested_at: new Date().toISOString(),
      invoice_company_name,
      invoice_ice,
      invoice_registre_commerce,
      invoice_billing_address,
    })
    .eq('id', orderId)

  if (error) return fail(error.message)

  revalidatePath('/wholesale/orders')
  return ok
}
