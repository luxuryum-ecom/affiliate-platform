// ─── Étiquettes de livraison PDF (Lot B) — route de téléchargement admin ─────
//
// GET /admin/couriers/labels → planche PDF des commandes à livrer (file de scan),
// pour impression + collage sur les colis. Admin uniquement. Lit la vue
// `v_courier_scan_queue` (colonnes non sensibles : réf, ville, montant COD) via
// le client user-scopé (rempart staff de la vue → my_role='admin').

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildDeliveryLabelsPdf, type DeliveryLabel } from '@/lib/courier/labels-pdf'
import type { Profile } from '@/types/database'

export async function GET() {
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

  const { data: rows, error } = await supabase
    .from('v_courier_scan_queue')
    .select('order_id, reference, customer_city, total_amount')
    .order('status', { ascending: true })
  if (error) return new NextResponse(error.message, { status: 500 })

  const labels: DeliveryLabel[] = (rows ?? []).map((r) => ({
    orderId: r.order_id as string,
    reference: (r.reference as string).slice(0, 8).toUpperCase(),
    city: (r.customer_city as string | null) ?? '',
    amountMad: Number(r.total_amount ?? 0),
  }))

  const pdfBytes = await buildDeliveryLabelsPdf(labels)

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="etiquettes-livraison.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
