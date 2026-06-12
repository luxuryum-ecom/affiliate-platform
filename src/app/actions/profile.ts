'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/types/orders'

const fail = (msg: string): ActionState => ({ error: msg, success: false })
const ok: ActionState = { error: null, success: true }

// Même format E.164 et même normalisation qu'à l'inscription (actions/auth.ts).
const E164_RE = /^\+[1-9]\d{6,14}$/

/**
 * Update optional wholesaler contact + billing fields on the current user's profile.
 * Only updates profiles with role = 'wholesaler' (ou wholesale_access).
 * All fields are optional — pass empty string to clear them. Le téléphone, s'il est
 * fourni, doit respecter le format international E.164 (sinon erreur).
 */
export async function updateWholesalerBilling(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Non authentifié.')

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role, status, wholesale_access')
    .eq('id', user.id)
    .single()) as { data: { role: string; status: string; wholesale_access: boolean } | null; error: unknown }

  if (profile?.role !== 'wholesaler' && !profile?.wholesale_access) {
    return fail('Accès réservé aux grossistes.')
  }

  const company_name      = ((formData.get('company_name') as string)?.trim()) || null
  const ice               = ((formData.get('ice') as string)?.trim()) || null
  const registre_commerce = ((formData.get('registre_commerce') as string)?.trim()) || null
  const billing_address   = ((formData.get('billing_address') as string)?.trim()) || null
  const city              = ((formData.get('city') as string)?.trim()) || null

  // Téléphone : normalisation (retrait espaces/tirets/points/parenthèses) puis
  // validation E.164 si non vide. Optionnel — vide = effacé.
  const phoneNormalized = ((formData.get('phone') as string) ?? '').replace(/[\s\-().]/g, '')
  const phone = phoneNormalized || null
  if (phone && !E164_RE.test(phone)) {
    return fail('Numéro de téléphone invalide (format international, ex : +212600000000).')
  }

  const { error } = await supabase
    .from('profiles')
    .update({ company_name, ice, registre_commerce, billing_address, city, phone })
    .eq('id', user.id)

  if (error) return fail(error.message)

  revalidatePath('/wholesale/account')
  revalidatePath('/wholesale/dashboard')
  return ok
}
