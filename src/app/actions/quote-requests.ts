'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from './_guards'
import type { QuoteRequestStatus } from '@/types/database'

export type QuoteRequestFormState = { error: string | null; success?: boolean }

// ─── Submit quote request (wholesaler) ────────────────────────────────────────

export async function submitQuoteRequest(
  _prev: QuoteRequestFormState,
  formData: FormData,
): Promise<QuoteRequestFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const quantity = parseInt(formData.get('quantity_requested') as string, 10)
  if (!quantity || quantity < 1) return { error: 'Quantité invalide.' }

  const destination_country = (formData.get('destination_country') as string)?.trim()
  if (!destination_country) return { error: 'Pays de destination requis.' }

  const whatsapp_number = (formData.get('whatsapp_number') as string)?.trim()
  if (!whatsapp_number) return { error: 'Numéro WhatsApp requis.' }

  const product_id = (formData.get('product_id') as string)?.trim()
  if (!product_id) return { error: 'Produit manquant.' }

  const { error } = await supabase.from('quote_requests').insert({
    buyer_id: user.id,
    product_id,
    quantity_requested: quantity,
    destination_country,
    destination_city: (formData.get('destination_city') as string)?.trim() || null,
    preferred_shipping_mode: (formData.get('preferred_shipping_mode') as string)?.trim() || null,
    colors_or_variants: (formData.get('colors_or_variants') as string)?.trim() || null,
    sizes: (formData.get('sizes') as string)?.trim() || null,
    buyer_notes: (formData.get('buyer_notes') as string)?.trim() || null,
    whatsapp_number,
  })

  if (error) return { error: error.message }

  revalidatePath('/wholesale/quote-requests')
  return { error: null, success: true }
}

// ─── Update quote request status (admin) ──────────────────────────────────────

export async function updateQuoteRequestStatus(
  requestId: string,
  status: QuoteRequestStatus,
  adminNotes: string | undefined,
  adminNotesPublic: boolean,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, error, userId } = await requireAdmin()
  if (error || !userId) return { success: false, error: error ?? 'Erreur.' }

  const update: Record<string, unknown> = { status, admin_notes_public: adminNotesPublic }
  if (adminNotes !== undefined) update.admin_notes = adminNotes || null

  const { error: dbError } = await supabase
    .from('quote_requests')
    .update(update)
    .eq('id', requestId)

  if (dbError) return { success: false, error: dbError.message }

  revalidatePath('/admin/quote-requests')
  revalidatePath(`/admin/quote-requests/${requestId}`)
  revalidatePath('/wholesale/quote-requests')
  return { success: true }
}
