// ─── Téléchargement du relevé livreur signable (PDF) ─────────────────────────
//
// GET /api/statements/courier/[id]?lang=fr|ar|en
//
// Sécurité (@security) :
//   - authentifié obligatoire ;
//   - lecture via le client RLS-scoped ; la policy « courier_statements: admin read »
//     (mig 130) restreint à l'admin (les données livreurs sont admin-only, Lot A).
//     Un non-admin obtient 0 ligne → 404. Aucune donnée d'un livreur exposée hors admin.
//   - PDF rendu à la volée depuis le SNAPSHOT FIGÉ (aucun recalcul) ; zone de double
//     signature pour la preuve papier anti-litige.

import { NextResponse } from 'next/server'
import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import {
  buildCourierStatementPdf,
  type CourierStatementSnapshot,
} from '@/lib/statements/courier-statement-pdf'
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

  const { data: stmt } = (await supabase
    .from('courier_statements')
    .select('id, snapshot, generated_at, period_start')
    .eq('id', id)
    .single()) as {
    data: { id: string; snapshot: CourierStatementSnapshot; generated_at: string; period_start: string } | null
  }

  if (!stmt) return NextResponse.json({ error: 'Relevé introuvable.' }, { status: 404 })

  const url = new URL(req.url)
  const langParam = url.searchParams.get('lang')
  const locale = normalizeStatementLocale(langParam ?? (await getLocale()))

  let pdf: Uint8Array
  try {
    pdf = await buildCourierStatementPdf(stmt.snapshot, { generatedAt: stmt.generated_at }, locale)
  } catch (e) {
    console.error('courier statement pdf render:', id, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Génération du relevé impossible.' }, { status: 500 })
  }

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="releve-livreur-${stmt.id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
