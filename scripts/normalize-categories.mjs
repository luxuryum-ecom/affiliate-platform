#!/usr/bin/env node
// ─── Normalisation des catégories produits → taxonomie canonique (Sub-lot 0) ──
// CONTEXTE : les catégories en base sont en partie des noms LEGACY libres
// (« Mode & Textile », « Electronique », « Beaute »…) qui ne matchent pas la
// taxonomie canonique (src/lib/taxonomy.ts). Avant d'appliquer le canal par
// catégorie (D2), on RE-MAPPE ces noms vers les catégories canoniques.
//
// AFFICHAGE/DONNÉE PUR — PATCH UNIQUEMENT `category` / `subcategory`. NE TOUCHE
// AUCUNE colonne d'argent (sell_price/factory_cost/commission/wholesale_tiers/
// affiliate_enabled). Le basculement de CANAL (affiliate_enabled) est un AUTRE
// script (Sub-lot 1), volontairement séparé.
//
// SÛR : idempotent (les noms canoniques ne matchent plus après 1er passage),
// dry-run par défaut. Mapping validé avec Abdou (2026-06-20).
//
// Usage :
//   node scripts/normalize-categories.mjs           # DRY-RUN (compte, n'écrit rien)
//   node scripts/normalize-categories.mjs --apply    # applique les PATCH
//
// ⚠️ BACKUP de la base AVANT `--apply`.
//
// Lit NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY depuis .env.local (env only).

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

// Mapping legacy → canonique (identités omises). Validé Abdou 2026-06-20.
const MAP = {
  'Mode & Textile': 'Textile',
  'Electronique': 'Électronique & gadgets',
  'Électronique & Tech': 'Électronique & gadgets',
  'Maison': 'Maison & packaging',
  'Maison & Décoration': 'Maison & packaging',
  'Beaute': 'Cosmétique & hygiène',
  'Beauté & Cosmétique': 'Cosmétique & hygiène',
  'Alimentaire & Bio': 'Alimentaire',
  'Sport': 'Sport & Fitness', // « Sport & Fitness » legacy = déjà canonique → pas dans le map
  'Enfants': 'Jouets & enfants',
  'Jouets & Enfants': 'Jouets & enfants',
  'Accessoires': 'Accessoires & maroquinerie',
  'Accessoires & Sacs': 'Accessoires & maroquinerie',
}

const APPLY = process.argv.includes('--apply')
const enc = (s) => encodeURIComponent(s)

async function normalizeTable(table) {
  console.log(`\n=== ${table} ===`)
  let changed = 0
  for (const [legacy, canonical] of Object.entries(MAP)) {
    // Compter d'abord (dry-run et log)
    const rows = await api(`${table}?select=id&category=eq.${enc(legacy)}`)
    if (!rows.length) continue
    console.log(`  ${APPLY ? '✅' : '•'} "${legacy}" → "${canonical}" : ${rows.length} ligne(s)`)
    if (APPLY) {
      await api(`${table}?category=eq.${enc(legacy)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ category: canonical }),
      })
    }
    changed += rows.length
  }
  return changed
}

// Cas spécial produits : catégorie VIDE = burkinis → Textile / Burkini (validé : les 4 sont des burkinis).
async function normalizeEmptyBurkini() {
  console.log(`\n=== products (catégorie vide → burkini) ===`)
  const rows = await api(`products?select=id,name&category=eq.`)
  const burkini = rows.filter((r) => /burkini/i.test(r.name || ''))
  const other = rows.filter((r) => !/burkini/i.test(r.name || ''))
  console.log(`  vides: ${rows.length} · burkini: ${burkini.length} · autres (laissés): ${other.length}`)
  other.forEach((r) => console.log(`  ⏭️  laissé vide (à classer): ${r.name}`))
  for (const r of burkini) {
    console.log(`  ${APPLY ? '✅' : '•'} ${r.name} → Textile / Burkini`)
    if (APPLY) {
      await api(`products?id=eq.${r.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ category: 'Textile', subcategory: 'Burkini' }),
      })
    }
  }
  return burkini.length
}

const a = await normalizeTable('products')
const b = await normalizeTable('supplier_products')
const c = await normalizeEmptyBurkini()
console.log(
  APPLY
    ? `\n✅ Normalisation appliquée : products+supplier ${a + b} + burkini ${c}.`
    : `\nDRY-RUN : ${a} (products) + ${b} (supplier) + ${c} (burkini) lignes à normaliser. Relance avec --apply (après BACKUP).`,
)
