// ─── Bordereau de ramassage PDF (Lot D module Livreurs) — route admin ────────
//
// GET /admin/couriers/tours/[tourId]/slip → bordereau de ramassage d'une
// tournée (preuve papier du transfert de garde dépôt → livreur, double
// signature). Admin uniquement. Détail de tournée via `getTourDetail`
// (server action existante, colonnes non sensibles uniquement), identité
// livreur lue via le client user-scopé (RLS staff-only sur `couriers`).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTourDetail } from '@/app/actions/courier-tours'
import { buildPickupSlipPdf, type PickupSlipItem } from '@/lib/courier/pickup-slip-pdf'
import type { Profile } from '@/types/database'

export async function GET(_req: Request, { params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: profile } = (await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()) as { data: Pick<Profile, 'role'> | null; error: unknown }
  if (profile?.role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const { error, detail } = await getTourDetail(tourId)
  if (error || !detail) return new NextResponse(error ?? 'Tournée introuvable.', { status: 404 })

  const { data: courierRow, error: courierErr } = await supabase
    .from('couriers')
    .select('name, courier_type')
    .eq('id', detail.tour.courierId)
    .maybeSingle()
  if (courierErr) return new NextResponse(courierErr.message, { status: 500 })

  const items: PickupSlipItem[] = detail.orders.map((o) => ({
    reference: o.orderId.slice(0, 8).toUpperCase(),
    city: o.customerCity ?? '',
    amountMad: o.totalAmount,
  }))

  const pdfBytes = await buildPickupSlipPdf({
    courierName: courierRow?.name ?? '—',
    courierType: courierRow?.courier_type ?? '',
    tourDate: detail.tour.tourDate,
    items,
  })

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="bordereau-ramassage.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
