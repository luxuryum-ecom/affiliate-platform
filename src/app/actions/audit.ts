'use server'

import { requireAdmin } from './_guards'
import { getLocale } from 'next-intl/server'

/**
 * LOT 1E — Lecture du journal d'audit global (admin-only).
 *
 * SÉCURITÉ : client RLS-scopé via requireAdmin() (la table admin_audit_log a une
 * policy SELECT admin-only ; on ne lit jamais en service_role). Append-only :
 * aucune écriture/modification possible ici.
 *
 * RÈGLE #2 : noms d'acteurs et dates résolus CÔTÉ SERVEUR → on ne renvoie que des
 * strings sérialisables au client.
 */

export interface AuditRow {
  id: string
  actorName: string
  actorRole: string
  action: string
  target: string
  change: string
  dateLabel: string
}

interface RawAuditRow {
  id: string
  actor_id: string | null
  actor_role: string | null
  action: string
  target_table: string | null
  target_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 300

/** Résumé compact « ancienne → nouvelle » d'un changement (strings sérialisables). */
function summarizeChange(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null): string {
  if (!newV && !oldV) return ''
  const keys = Array.from(new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})]))
  return keys
    .map((k) => {
      const o = oldV?.[k]
      const n = newV?.[k]
      const os = o == null ? '—' : String(o)
      const ns = n == null ? '—' : String(n)
      return o === undefined ? `${k}: ${ns}` : `${k}: ${os} → ${ns}`
    })
    .join(' · ')
}

export async function getAuditLog(opts?: { action?: string; limit?: number }): Promise<AuditRow[]> {
  const { supabase, error } = await requireAdmin()
  if (error) return []

  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const locale = await getLocale()

  let query = supabase
    .from('admin_audit_log')
    .select('id, actor_id, actor_role, action, target_table, target_id, old_value, new_value, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (opts?.action) query = query.eq('action', opts.action)

  const { data: rows } = (await query) as { data: RawAuditRow[] | null }
  if (!rows || rows.length === 0) return []

  // Résolution des noms d'acteurs côté serveur.
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v)))
  const nameOf = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles } = (await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds)) as { data: { id: string; full_name: string }[] | null }
    ;(profiles ?? []).forEach((p) => nameOf.set(p.id, p.full_name))
  }

  const numLocale =
    locale.split('-')[0] === 'ar' ? 'ar-MA-u-nu-latn' : locale.split('-')[0] === 'en' ? 'en-GB' : 'fr-MA'
  const dateFmt = new Intl.DateTimeFormat(numLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return rows.map((r) => ({
    id: r.id,
    actorName: r.actor_id ? nameOf.get(r.actor_id) ?? '—' : 'Système',
    actorRole: r.actor_role ?? '—',
    action: r.action,
    target: [r.target_table, r.target_id ? r.target_id.slice(0, 8) : null].filter(Boolean).join(' · '),
    change: summarizeChange(r.old_value, r.new_value),
    dateLabel: dateFmt.format(new Date(r.created_at)),
  }))
}
