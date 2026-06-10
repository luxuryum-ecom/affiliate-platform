import Papa from 'papaparse'
import { SUPPLIER_CATEGORIES } from '@/types/database'
import type { BulkImportReportRow } from '@/types/database'

export interface ParsedProductRow {
  product_name: string
  category: string
  description: string
  moq: number
  unit: string
  supplier_unit_price_usd: number
  stock_quantity: number | null
  export_country: string
  lead_time_days: number | null
  photos: string[]
  // Variants
  variants: Array<{ color?: string; size?: string; model?: string }>
  // MOQ tiers — expects "100:2.5,500:2.2,1000:1.9" format
  moq_tiers: Array<{ min_quantity: number; unit_price_usd: number }>
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return isNaN(n) ? null : n
}

function parseMoqTiers(raw: string): Array<{ min_quantity: number; unit_price_usd: number }> {
  if (!raw) return []
  return raw
    .split(',')
    .map((pair) => {
      const [qty, price] = pair.trim().split(':')
      const min_quantity = parseInt(qty ?? '', 10)
      const unit_price_usd = parseFloat(price ?? '')
      if (isNaN(min_quantity) || isNaN(unit_price_usd)) return null
      return { min_quantity, unit_price_usd }
    })
    .filter((t): t is { min_quantity: number; unit_price_usd: number } => t !== null)
}

function parseVariants(colorRaw: string, sizeRaw: string, modelRaw: string) {
  const colors = colorRaw ? colorRaw.split('|').map((s) => s.trim()) : []
  const sizes  = sizeRaw  ? sizeRaw.split('|').map((s) => s.trim())  : []
  const models = modelRaw ? modelRaw.split('|').map((s) => s.trim()) : []
  const max = Math.max(colors.length, sizes.length, models.length)
  if (max === 0) return []
  return Array.from({ length: max }, (_, i) => ({
    color: colors[i] ?? undefined,
    size:  sizes[i]  ?? undefined,
    model: models[i] ?? undefined,
  }))
}

function validateRow(
  row: Record<string, string>,
  rowIndex: number,
): { parsed: ParsedProductRow | null; reportRow: BulkImportReportRow } {
  const errors: string[] = []

  const product_name = (row['product_name'] ?? row['Product Name'] ?? '').trim()
  const category = (row['category'] ?? row['Category'] ?? '').trim()
  const description = (row['description'] ?? row['Description'] ?? '').trim()
  const moqRaw = parseNumber(row['moq'] ?? row['MOQ'] ?? row['min_quantity'])
  const unit = (row['unit'] ?? row['Unit'] ?? 'pcs').trim()
  const priceRaw = parseNumber(row['supplier_unit_price_usd'] ?? row['supplier_price'] ?? row['Price USD'])
  const stockRaw = parseNumber(row['stock_quantity'] ?? row['stock'] ?? row['Stock'])
  const exportCountry = (row['export_country'] ?? row['Export Country'] ?? row['origin_country'] ?? '').trim()
  const leadTimeRaw = parseNumber(row['lead_time'] ?? row['lead_time_days'] ?? row['Lead Time'])
  const imagesRaw = (row['images_urls'] ?? row['image_urls'] ?? row['photos'] ?? row['Images'] ?? '').trim()
  const photos = imagesRaw ? imagesRaw.split('|').map((u) => u.trim()).filter(Boolean) : []
  const moqTiersRaw = (row['moq_tiers'] ?? row['MOQ Tiers'] ?? '').trim()
  const colorRaw = (row['color'] ?? row['Color'] ?? row['colors'] ?? '').trim()
  const sizeRaw  = (row['size']  ?? row['Size']  ?? row['sizes']  ?? '').trim()
  const modelRaw = (row['model'] ?? row['Model'] ?? row['models'] ?? '').trim()

  if (!product_name) errors.push('product_name requis')
  if (!category) {
    errors.push('category requis')
  } else if (!(SUPPLIER_CATEGORIES as readonly string[]).includes(category)) {
    errors.push(`category invalide: "${category}"`)
  }
  if (!moqRaw || moqRaw <= 0) errors.push('moq invalide (doit être > 0)')
  if (!priceRaw || priceRaw <= 0) errors.push('supplier_unit_price_usd invalide')
  if (!exportCountry) errors.push('export_country requis')

  const reportRow: BulkImportReportRow = {
    row: rowIndex,
    product_name: product_name || `Ligne ${rowIndex}`,
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors,
  }

  if (errors.length > 0) return { parsed: null, reportRow }

  return {
    parsed: {
      product_name,
      category,
      description,
      moq: moqRaw!,
      unit: unit || 'pcs',
      supplier_unit_price_usd: priceRaw!,
      stock_quantity: stockRaw,
      export_country: exportCountry,
      lead_time_days: leadTimeRaw != null ? Math.round(leadTimeRaw) : null,
      photos,
      variants: parseVariants(colorRaw, sizeRaw, modelRaw),
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
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  const rawRows = result.data
  const rows: ParsedProductRow[] = []
  const report: BulkImportReportRow[] = []

  rawRows.forEach((raw, i) => {
    const { parsed, reportRow } = validateRow(raw, i + 2)
    report.push(reportRow)
    if (parsed) rows.push(parsed)
  })

  const rowsValid   = report.filter((r) => r.status === 'valid').length
  const rowsInvalid = report.filter((r) => r.status === 'invalid').length

  return {
    rows,
    report,
    rowsValid,
    rowsInvalid,
    rowsTotal: rawRows.length,
  }
}
