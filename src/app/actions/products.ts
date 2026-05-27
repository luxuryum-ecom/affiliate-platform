'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { WholesaleTier } from '@/types/database'

export type ProductFormState = { error: string | null }

/**
 * Create or update a product.
 * Pass id as a hidden form field to update; omit it to create.
 */
export async function upsertProduct(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const supabase = await createClient()

  const id = (formData.get('id') as string) || null
  const name = (formData.get('name') as string)?.trim()
  const description = ((formData.get('description') as string)?.trim()) || null
  const type = formData.get('type') as string
  const sell_price = parseFloat(formData.get('sell_price') as string)
  const commission_amount = parseFloat(formData.get('commission_amount') as string) || 0
  const wholesale_min_qty = parseInt(formData.get('wholesale_min_qty') as string) || 1
  const stock_count = parseInt(formData.get('stock_count') as string) || 0
  // Checkbox is 'on' when checked, absent when unchecked
  const active = formData.get('active') === 'on'

  if (!name) return { error: 'Le nom du produit est requis.' }
  if (!['local', 'imported'].includes(type)) return { error: 'Type de produit invalide.' }
  if (isNaN(sell_price) || sell_price <= 0)
    return { error: 'Le prix de vente doit être supérieur à 0 MAD.' }
  if (commission_amount < 0) return { error: 'La commission ne peut pas être négative.' }
  if (wholesale_min_qty < 1) return { error: 'La quantité minimale doit être ≥ 1.' }
  if (stock_count < 0) return { error: 'Le stock ne peut pas être négatif.' }

  let wholesale_tiers: WholesaleTier[] = []
  try {
    wholesale_tiers = JSON.parse((formData.get('wholesale_tiers') as string) || '[]')
  } catch {
    return { error: 'Format des paliers de prix invalide.' }
  }

  let images: string[] = []
  try {
    images = (JSON.parse((formData.get('images') as string) || '[]') as string[]).filter(
      (u) => u.trim().length > 0
    )
  } catch {
    images = []
  }

  const payload = {
    name,
    description,
    type: type as 'local' | 'imported',
    sell_price,
    commission_amount,
    wholesale_min_qty,
    wholesale_tiers,
    stock_count,
    images,
    active,
  }

  if (id) {
    const { error } = await supabase.from('products').update(payload).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('products').insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/products')
  redirect('/admin/products')
}

/**
 * Toggle a product's active status from the product list.
 * Bound on the client: toggleProductActive.bind(null, id, newActive)
 */
export async function toggleProductActive(id: string, newActive: boolean): Promise<void> {
  const supabase = await createClient()
  await supabase.from('products').update({ active: newActive }).eq('id', id)
  revalidatePath('/admin/products')
}

/**
 * Hard-delete a product. Irreversible.
 * Bound on the client: deleteProduct.bind(null, id)
 */
export async function deleteProduct(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('products').delete().eq('id', id)
  revalidatePath('/admin/products')
}
