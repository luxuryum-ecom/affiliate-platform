import Papa from 'papaparse'
import { z } from 'zod'
import { SUPPLIER_CATEGORIES } from '@/types/database'
import type { BulkImportReportRow } from '@/types/database'
import { sanitizeCsvCell, MAX_CSV_ROWS, hasForbiddenHeader } from '@/lib/csv-sanitize'

export interface ParsedProductRow {
  product_name: string
  category: string
  description: string
  moq: number
  unit: string
  /** Prix dans la DEVISE du fournisseur (pas USD/MAD) — converti à la publication. */
  price_source: number
  stock_quantity: number | null
  export_country: string
  lead_time_days: number | null
  photos: string[]
  variants: Array<{ color?: string; size?: string; model?: string }>
  // MOQ tiers (USD) — fonctionnalité avancée inchangée. Format "100:2.5,500:2.2".
  moq_tiers: Array<{ min_quantity: number; unit_price_usd: number }>
}

const MAX_PRICE_SOURCE = 1_000_000

function parseNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseMoqTiers(raw: string): Array<{ min_quantity: number; unit_price_usd: number }> {
  if (!raw) return []
  return raw
    .split(',')
    .map((pair) => {
      const [qty, price] = pair.trim().split(':')
      const min_quantity = parseInt(qty ?? '', 10)
      const unit_price_usd = parseFloat(price ?? '')
      if (!Number.isInteger(min_quantity) || min_quantity <= 0) return null
      if (!Number.isFinite(unit_price_usd) || unit_price_usd <= 0) return null
      return { min_quantity, unit_price_usd }
    })
    .filter((t): t is { min_quantity: number; unit_price_usd: number } => t !== null)
}

function parseVariants(colorRaw: string, sizeRaw: string, modelRaw: string) {
  const split = (s: string) => (s ? s.split('|').map((x) => sanitizeCsvCell(x.trim())).filter(Boolean) : [])
  const colors = split(colorRaw)
  const sizes = split(sizeRaw)
  const models = split(modelRaw)
  const max = Math.max(colors.length, sizes.length, models.length)
  if (max === 0) return []
  return Array.from({ length: max }, (_, i) => ({
    color: colors[i] ?? undefined,
    size: sizes[i] ?? undefined,
    model: models[i] ?? undefined,
  }))
}

// Schéma zod par ligne — type-checking strict (rejette NaN/Infinity/négatif).
const parsedRowSchema = z.object({
  product_name: z.string().min(1).max(200),
  category: z.string().min(1),
  description: z.string().max(5000),
  moq: z.number().int().positive(),
  unit: z.string().max(50),
  price_source: z.number().finite().positive().max(MAX_PRICE_SOURCE),
  stock_quantity: z.number().int().nonnegative().nullable(),
  export_country: z.string().min(1).max(100),
  lead_time_days: z.number().int().nonnegative().nullable(),
})

function validateRow(
  row: Record<string, string>,
  rowIndex: number,
): { parsed: ParsedProductRow | null; reportRow: BulkImportReportRow } {
  // Champs libres assainis (anti CSV-injection) ; catégorie/nombres contraints.
  const product_name = sanitizeCsvCell((row['product_name'] ?? row['Product Name'] ?? '').trim())
  const category = (row['category'] ?? row['Category'] ?? '').trim()
  const description = sanitizeCsvCell((row['description'] ?? row['Description'] ?? '').trim())
  const moq = parseNumber(row['moq'] ?? row['MOQ'] ?? row['min_quantity'])
  const unit = sanitizeCsvCell((row['unit'] ?? row['Unit'] ?? 'pcs').trim() || 'pcs')
  // Prix = montant dans la devise du fournisseur (converti à la publication).
  const price_source = parseNumber(
    row['price'] ?? row['prix'] ?? row['supplier_price'] ?? row['unit_price'] ?? row['supplier_unit_price_usd'] ?? row['Price'],
  )
  const stock_quantity = parseNumber(row['stock_quantity'] ?? row['stock'] ?? row['Stock'])
  const export_country = sanitizeCsvCell((row['export_country'] ?? row['Export Country'] ?? row['origin_country'] ?? '').trim())
  const leadTimeRaw = parseNumber(row['lead_time'] ?? row['lead_time_days'] ?? row['Lead Time'])
  const imagesRaw = (row['images_urls'] ?? row['image_urls'] ?? row['photos'] ?? row['Images'] ?? '').trim()
  const photos = imagesRaw ? imagesRaw.split('|').map((u) => u.trim()).filter(Boolean) : []
  const moqTiersRaw = (row['moq_tiers'] ?? row['MOQ Tiers'] ?? '').trim()

  const candidate = {
    product_name,
    category,
    description,
    moq,
    unit,
    // @finance : arrondi 2 décimales À LA SOURCE (comme Telegram) — sinon un prix
    // MAD à >2 déc. violerait l'invariant DB sp_mad_identity (mad === price_source)
    // et l'insert échouerait silencieusement.
    price_source: price_source != null ? Math.round(price_source * 100) / 100 : null,
    stock_quantity,
    export_country,
    lead_time_days: leadTimeRaw != null ? Math.round(leadTimeRaw) : null,
  }

  const errors: string[] = []
  const result = parsedRowSchema.safeParse(candidate)
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push(`${issue.path.join('.') || 'ligne'}: ${issue.message}`)
    }
  }
  if (category && !(SUPPLIER_CATEGORIES as readonly string[]).includes(category)) {
    errors.push(`category invalide: "${category}"`)
  }

  const reportRow: BulkImportReportRow = {
    row: rowIndex,
    product_name: product_name || `Ligne ${rowIndex}`,
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors,
  }

  if (errors.length > 0 || !result.success) return { parsed: null, reportRow }

  return {
    parsed: {
      ...result.data,
      photos,
      variants: parseVariants(
        (row['color'] ?? row['Color'] ?? row['colors'] ?? '').trim(),
        (row['size'] ?? row['Size'] ?? row['sizes'] ?? '').trim(),
        (row['model'] ?? row['Model'] ?? row['models'] ?? '').trim(),
      ),
      moq_tiers: parseMoqTiers(moqTiersRaw),
    },
    reportRow,
  }
}

export function parseCsvText(
  csvText: string,
  _filename?: string,
): {
  rows: ParsedProductRow[]
  report: BulkImportReportRow[]
  rowsValid: number
  rowsInvalid: number
  rowsTotal: number
  fatalError?: string
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  // Sécurité : en-tête de pollution de prototype → rejet immédiat.
  const headers = result.meta.fields ?? []
  if (hasForbiddenHeader(headers)) {
    return { rows: [], report: [], rowsValid: 0, rowsInvalid: 0, rowsTotal: 0, fatalError: 'En-tête CSV interdit détecté.' }
  }

  const rawRows = result.data
  if (rawRows.length > MAX_CSV_ROWS) {
    return {
      rows: [], report: [], rowsValid: 0, rowsInvalid: 0, rowsTotal: rawRows.length,
      fatalError: `Trop de lignes (${rawRows.length} > ${MAX_CSV_ROWS}).`,
    }
  }

  const rows: ParsedProductRow[] = []
  const report: BulkImportReportRow[] = []

  rawRows.forEach((raw, i) => {
    const { parsed, reportRow } = validateRow(raw, i + 2)
    report.push(reportRow)
    if (parsed) rows.push(parsed)
  })

  return {
    rows,
    report,
    rowsValid: report.filter((r) => r.status === 'valid').length,
    rowsInvalid: report.filter((r) => r.status === 'invalid').length,
    rowsTotal: rawRows.length,
  }
}
