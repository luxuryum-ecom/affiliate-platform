#!/usr/bin/env node
// ─── Backfill canal affilié (D2, Sub-lot 1) ───────────────────────────────────
// Met `affiliate_enabled=false` sur les produits qui NE DOIVENT PAS être au canal
// affilié, selon la décision figée D2 :
//   (a) MIROIRS d'approbation (source_supplier_product_id NOT NULL) — grossiste only,
//       prix grossiste SANS capital → ferme la fuite (bug défaut `true`).
//   (b) produits en catégorie GROSSISTE-SEUL (Matières premières, Alimentaire, Autres,
//       + vide/inconnue) ayant affiliate_enabled=true.
//
// ARGENT : PATCH UNIQUEMENT la colonne `affiliate_enabled` (jamais sell_price/
// factory_cost/commission/wholesale_tiers). On RESTREINT l'exposition affilié ; aucun
// montant stocké n'est recalculé. @finance + @security GO (conditions A4/C1/C4/C5).
//
// SÛR : idempotent (après 1er passage, plus aucune ligne ne matche), dry-run par défaut,
// log old→new par produit. Clé via env (jamais en dur).
//
// Usage :
//   node scripts/backfill-affiliate-channel.mjs           # DRY-RUN
//   node scripts/backfill-affiliate-channel.mjs --apply    # applique
// ⚠️ BACKUP avant `--apply`.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = readFileSync(join(ROOT, '.env.local'), 'utf8')
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
const URL = pick('NEXT_PUBLIC_SUPABASE_URL')
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const api = async (path, init = {}) => {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t}`)
  return t ? JSON.parse(t) : null
}

// Catégories AFFILIÉ-possibles (= complément de grossiste-seul). Doit refléter
// AFFILIATE_ALLOWED_CATEGORIES de src/lib/taxonomy.ts (fail-closed : tout le reste = grossiste).
const AFFILIATE_ALLOWED = new Set([
  'Textile', 'Chaussures', 'Cosmétique & hygiène', 'Maison & packaging', 'Artisanat',
  'Électronique & gadgets', 'Sport & Fitness', 'Jouets & enfants', 'Accessoires & maroquinerie',
])

const APPLY = process.argv.includes('--apply')

// Tous les produits affiliate_enabled=true (on filtre la cible en JS = clair + auditable).
const rows = await api('products?select=id,name,category,affiliate_enabled,source_supplier_product_id&affiliate_enabled=eq.true')

const targets = rows.filter(
  (p) => p.source_supplier_product_id != null || !AFFILIATE_ALLOWED.has(p.category),
)

// Garde-fou @finance : un miroir n'a JAMAIS dû générer de commission affilié.
const mirrors = rows.filter((p) => p.source_supplier_product_id != null)
console.log(`produits affiliate_enabled=true : ${rows.length}`)
console.log(`  dont miroirs (fuyants) : ${mirrors.length}`)
console.log(`  à basculer grossiste : ${targets.length}`)
if (mirrors.length > 0) {
  console.log('  ⚠️ MIROIRS FUYANTS détectés — verifier en aval qu aucune commande affilie n a ete facturee dessus (incident potentiel).')
}
for (const p of targets) {
  const why = p.source_supplier_product_id != null ? 'miroir' : `cat="${p.category}" grossiste-seul`
  console.log(`  ${APPLY ? '✅' : '•'} ${p.name} (${why}) : affiliate_enabled true → false`)
  if (APPLY) {
    await api(`products?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ affiliate_enabled: false }),
    })
  }
}
console.log(
  APPLY
    ? `\n✅ ${targets.length} produit(s) basculés grossiste. Aucun montant touché.`
    : `\nDRY-RUN : ${targets.length} à basculer. Relance avec --apply (après BACKUP).`,
)
