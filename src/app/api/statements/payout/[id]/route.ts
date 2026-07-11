// ─── Téléchargement du relevé de paiement affilié (PDF) ──────────────────────
//
// GET /api/statements/payout/[id]?lang=fr|ar|en
//   [id] = payout_id (unique sur payout_statements) — disponible côté admin (liste
//   des payouts) comme côté affilié (liste de ses relevés).
//
// Sécurité (@security) :
//   - authentifié obligatoire ;
//   - lecture via le client RLS-scoped (`@/lib/supabase/server`), JAMAIS service_role ;
//   - la policy « payout_statements: own or admin read » (mig 130) garantit qu'un
//     affilié ne voit QUE ses relevés (affiliate_id = auth.uid()), l'admin voit tout.
//     Aucune fuite inter-affiliés possible, aucune donnée d'un autre.
//   - le PDF est rendu à la volée depuis le SNAPSHOT FIGÉ (aucun recalcul).

import { NextResponse } from 'next/server'
import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildPayoutStatementPdf,
  type PayoutStatementSnapshot,
} from '@/lib/statements/payout-statement-pdf'
import { normalizeStatementLocale } from '@/lib/statements/pdf-i18n'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })

  // RLS : own-or-admin. Un affilié tiers obtient 0 ligne → 404. Recherche par
  // payout_id (unique), pratique côté admin (liste payouts) et affilié (ses relevés).
  const { data: stmt } = (await supabase
    .from('payout_statements')
    .select('id, snapshot, reference')
    .eq('payout_id', id)
    .maybeSingle()) as { data: { id: string; snapshot: PayoutStatementSnapshot; reference: string | null } | null }

  if (!stmt) return NextResponse.json({ error: 'Relevé introuvable.' }, { status: 404 })

  // Langue : ?lang= explicite (impression AR/FR/EN), sinon la locale de session.
  const url = new URL(req.url)
  const langParam = url.searchParams.get('lang')
  const locale = normalizeStatementLocale(langParam ?? (await getLocale()))

  let pdf: Uint8Array
  try {
    pdf = await buildPayoutStatementPdf(stmt.snapshot, locale)
  } catch (e) {
    console.error('payout statement pdf render:', id, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Génération du relevé impossible.' }, { status: 500 })
  }

  const tag = (stmt.reference ?? stmt.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '')
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="releve-paiement-${tag}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
