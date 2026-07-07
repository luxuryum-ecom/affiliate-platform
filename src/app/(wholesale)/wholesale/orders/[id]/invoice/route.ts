// ─── Téléchargement de la facture PDF (grossiste) ────────────────────────────
//
// GET /wholesale/orders/[id]/invoice
//
// Sécurité (revu @security) :
//   - authentifié obligatoire ;
//   - la commande est lue via la vue redacted `wholesale_orders_buyer_read`
//     (WHERE buyer_id = auth.uid() embarqué → l'acheteur ne voit QUE ses
//     commandes, zéro colonne de marge) + garde explicite `buyer_id === user.id`
//     en défense en profondeur ;
//   - la facture n'est délivrée que si la commande est `delivered` ET
//     `invoice_requested` (mêmes conditions que le formulaire de demande) ;
//   - aucune écriture, aucun `service_role` : lecture seule sous RLS acheteur.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildInvoicePdf, type InvoiceLineInput } from '@/lib/invoice/pdf'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  // Commande via la vue redacted acheteur (own-rows only, sans marge).
  const { data: order } = (await supabase
    .from('wholesale_orders_buyer_read')
    .select(
      'id, buyer_id, status, total_amount, delivery_cost, created_at, ' +
        'invoice_requested, invoice_company_name, invoice_ice, ' +
        'invoice_registre_commerce, invoice_billing_address',
    )
    .eq('id', id)
    .eq('buyer_id', user.id)
    .single()) as {
    data: {
      id: string
      buyer_id: string
      status: string
      total_amount: number
      delivery_cost: number | null
      created_at: string
      invoice_requested: boolean
      invoice_company_name: string | null
      invoice_ice: string | null
      invoice_registre_commerce: string | null
      invoice_billing_address: string | null
    } | null
  }

  if (!order || order.buyer_id !== user.id) {
    return NextResponse.json({ error: 'Commande introuvable.' }, { status: 404 })
  }
  if (order.status !== 'delivered' || !order.invoice_requested) {
    return NextResponse.json(
      { error: 'Facture indisponible pour cette commande.' },
      { status: 403 },
    )
  }

  // Profil (fallback pour la raison sociale/adresse si non figées à la demande).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, company_name, ice, registre_commerce, billing_address')
    .eq('id', user.id)
    .single()

  // Lignes de commande.
  const { data: itemsData } = await supabase
    .from('wholesale_order_items')
    .select('id, quantity, unit_price_snapshot, subtotal, tier_label_snapshot, product:products(name)')
    .eq('order_id', id)

  type ItemRow = {
    id: string
    quantity: number
    unit_price_snapshot: number
    subtotal: number
    tier_label_snapshot: string | null
    product: { name: string } | { name: string }[] | null
  }
  const items = (itemsData ?? []) as unknown as ItemRow[]

  const productName = (p: ItemRow['product']): string => {
    if (!p) return 'Produit'
    const rec = Array.isArray(p) ? p[0] : p
    return rec?.name ?? 'Produit'
  }

  const lines: InvoiceLineInput[] = items.map((it) => ({
    label: productName(it.product),
    detail: it.tier_label_snapshot ?? undefined,
    quantity: it.quantity,
    unitPriceMad: it.unit_price_snapshot,
    totalMad: it.subtotal,
  }))

  if (order.delivery_cost != null && order.delivery_cost > 0) {
    lines.push({
      label: 'Livraison',
      quantity: null,
      unitPriceMad: null,
      totalMad: order.delivery_cost,
    })
  }

  let pdfBytes: Uint8Array
  try {
    pdfBytes = await buildInvoicePdf({
      orderId: order.id,
      orderedAtIso: order.created_at,
      totalAmountMad: order.total_amount,
      buyer: {
        fullName: profile?.full_name ?? null,
        companyName: order.invoice_company_name ?? profile?.company_name ?? null,
        ice: order.invoice_ice ?? profile?.ice ?? null,
        registreCommerce: order.invoice_registre_commerce ?? profile?.registre_commerce ?? null,
        billingAddress: order.invoice_billing_address ?? profile?.billing_address ?? null,
      },
      lines,
    })
  } catch (e) {
    // Filet : une erreur de rendu PDF renvoie un 500 JSON propre, jamais une
    // stacktrace brute. L'assainissement WinAnsi (pdf.ts) devrait déjà l'éviter.
    console.error('invoice pdf render failed:', order.id, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Génération de la facture impossible.' }, { status: 500 })
  }

  const filename = `facture-${order.id.slice(0, 8).toUpperCase()}.pdf`

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
