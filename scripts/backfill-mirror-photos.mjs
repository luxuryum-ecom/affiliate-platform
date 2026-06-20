#!/usr/bin/env node
// ─── Backfill photos des produits-miroirs (approbation fournisseur) ──────────
// CONTEXTE : `buildSupplierMirror` ne copiait pas `supplier_products.photos` vers
// `products.images`/`media` → tout produit auto-provisionné à l'approbation affichait
// les INITIALES au lieu de la photo. Le code est corrigé pour les FUTURS produits ;
// ce script rattrape les produits-miroirs DÉJÀ créés sans image.
//
// AFFICHAGE PUR — n'écrit QUE les colonnes `media` (jsonb [{url,type:image}]) et
// `images` (text[] legacy dérivé). NE TOUCHE À AUCUNE colonne d'argent
// (sell_price/factory_cost_mad/commission/paliers). ZÉRO calcul.
//
// SÛR : idempotent (ignore les produits qui ont déjà une photo valide), ne touche
// que les lignes liées à un supplier_product (source_supplier_product_id NOT NULL).
//
// Usage :
//   node scripts/backfill-mirror-photos.mjs           # DRY-RUN (liste, n'écrit rien)
//   node scripts/backfill-mirror-photos.mjs --apply   # applique les UPDATE
//
// ⚠️ Faire un BACKUP de la base AVANT `--apply` (cf. ETAT_SYSTEME → SÉCURITÉ/BACKUP).
//
// Lit NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY depuis .env.local.

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

// Même filtre que src/lib/product-media.ts (http/https uniquement).
const isValidUrl = (u) => {
  if (typeof u !== 'string' || !u.trim()) return false
  try {
    const p = new globalThis.URL(u.trim())
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch {
    return false
  }
}
// Une ligne a-t-elle déjà une cover valide ? (media jsonb OU images legacy)
const hasCover = (row) => {
  const fromMedia = (row.media ?? []).some((m) => m && m.type === 'image' && isValidUrl(m.url))
  const fromImages = (row.images ?? []).some(isValidUrl)
  return fromMedia || fromImages
}

const APPLY = process.argv.includes('--apply')

// 1. Tous les produits-miroirs (liés à un supplier_product).
const mirrors = await api(
  'products?source_supplier_product_id=not.is.null&select=id,name,media,images,source_supplier_product_id',
)
const missing = mirrors.filter((p) => !hasCover(p))

console.log(`Produits-miroirs : ${mirrors.length} · sans photo : ${missing.length}`)
if (missing.length === 0) {
  console.log('Rien à backfiller. ✅')
  process.exit(0)
}

// 2. Photos des supplier_products source (une seule requête).
const spIds = [...new Set(missing.map((p) => p.source_supplier_product_id))]
const sps = await api(`supplier_products?id=in.(${spIds.join(',')})&select=id,photos`)
const photosById = new Map(sps.map((s) => [s.id, (s.photos ?? []).filter(isValidUrl)]))

let updated = 0
let stillEmpty = 0
for (const p of missing) {
  const validPhotos = photosById.get(p.source_supplier_product_id) ?? []
  if (validPhotos.length === 0) {
    stillEmpty++
    console.log(`  ⏭️  ${p.name} — source sans photo valide (reste initiales)`)
    continue
  }
  const media = validPhotos.map((url) => ({ url, type: 'image' }))
  console.log(`  ${APPLY ? '✅' : '•'} ${p.name} — ${validPhotos.length} photo(s)`)
  if (APPLY) {
    await api(`products?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ media, images: validPhotos }),
    })
    updated++
  }
}

console.log(
  APPLY
    ? `\n✅ ${updated} produit(s) mis à jour · ${stillEmpty} source(s) sans photo.`
    : `\nDRY-RUN : ${missing.length - stillEmpty} à mettre à jour · ${stillEmpty} source(s) sans photo. Relance avec --apply (après BACKUP).`,
)
