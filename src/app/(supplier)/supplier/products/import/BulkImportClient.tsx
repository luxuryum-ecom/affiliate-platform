'use client'

import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { validateBulkImport, publishBulkImport } from '@/app/actions/supplier-bulk'
import type { BulkImportReportRow } from '@/types/database'

type ValidateState = {
  error: string | null
  success: boolean
  importId?: string
  report?: BulkImportReportRow[]
  rowsValid?: number
  rowsInvalid?: number
  rowsTotal?: number
}
type PublishState = { error: string | null; success: boolean }

const initialValidate: ValidateState = { error: null, success: false }
const initialPublish: PublishState = { error: null, success: false }

// Colonne « price » = prix dans VOTRE devise (déterminée par votre pays), converti en MAD.
const CSV_TEMPLATE = [
  'product_name,category,description,moq,unit,price,stock_quantity,export_country,lead_time,images_urls,moq_tiers,color,size,model',
  'T-shirt Homme Coton,Textile,T-shirt 100% coton,100,pcs,25,5000,Turquie,21,https://cdn.exemple.com/1.jpg,100:2.5|500:2.2|1000:1.9,Blanc|Noir,S|M|L,',
].join('\n')

export default function BulkImportClient() {
  const t = useTranslations('supplier.bulkImport')
  const [validateState, validateAction, isValidating] = useActionState(validateBulkImport, initialValidate)
  const [publishState, publishAction, isPublishing] = useActionState(publishBulkImport, initialPublish)
  const [csvText, setCsvText] = useState('')
  const [filename, setFilename] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFilename(f.name)
    const text = await f.text()
    setCsvText(text)
  }

  const report = validateState.report ?? []
  const validRows   = report.filter((r) => r.status === 'valid')
  const invalidRows = report.filter((r) => r.status === 'invalid')

  if (publishState.success) {
    return (
      <div className="bg-success-soft border border-success rounded-xl p-8 text-center">
        <p className="text-sm font-semibold text-success-fg mb-1">{t('successTitle')}</p>
        <p className="text-xs text-success-fg">
          {t('successBody')}
        </p>
        <Link href="/supplier/products" className="mt-4 inline-block text-xs px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
          {t('ctaViewProducts')}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Template download */}
      <div className="bg-surface-2 border border-line rounded-xl p-4">
        <p className="text-xs font-semibold text-foreground mb-1">{t('csvFormatTitle')}</p>
        <p className="text-xs text-muted mb-3">
          {t('csvFormatBody')} <code className="bg-surface px-1 rounded border border-line">product_name</code>, <code className="bg-surface px-1 rounded border border-line">category</code>, <code className="bg-surface px-1 rounded border border-line">moq</code>, <code className="bg-surface px-1 rounded border border-line">unit</code>, <code className="bg-surface px-1 rounded border border-line">price</code> (votre devise), <code className="bg-surface px-1 rounded border border-line">export_country</code>
        </p>
        <p className="text-xs text-muted mb-3">
          {t('csvVariantsNote')} <code className="bg-surface px-1 rounded border border-line">100:2.5,500:2.2,1000:1.9</code>
        </p>
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'template_import_produits.csv'
            a.click()
          }}
          className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          {t('ctaDownloadTemplate')}
        </button>
      </div>

      {/* Upload form */}
      <form action={validateAction} className="bg-surface rounded-xl border border-line p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">{t('step1Title')}</h2>

        {validateState.error && (
          <div className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-4 py-3 mb-4">
            {validateState.error}
          </div>
        )}

        <div className="border-2 border-dashed border-line rounded-xl p-8 text-center hover:border-muted transition-colors">
          <input
            ref={fileRef}
            name="file"
            type="file"
            accept=".csv,.xlsx"
            required
            onChange={handleFileChange}
            className="hidden"
            id="file-input"
          />
          <label htmlFor="file-input" className="cursor-pointer">
            {filename ? (
              <div>
                <p className="text-sm font-medium text-foreground">{filename}</p>
                <p className="text-xs text-muted mt-1">{t('dropzoneActive')}</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted">{t('dropzoneEmpty')}</p>
                <p className="text-xs text-faint mt-1">{t('dropzoneHint')}</p>
              </div>
            )}
          </label>
        </div>

        <button
          type="submit"
          disabled={isValidating || !filename}
          className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isValidating ? t('validating') : t('ctaValidate')}
        </button>
      </form>

      {/* Validation report */}
      {validateState.success && report.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface rounded-xl border border-line p-4 text-center">
              <p className="text-xs text-muted">{t('summaryTotal')}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{validateState.rowsTotal}</p>
            </div>
            <div className="bg-success-soft rounded-xl border border-success p-4 text-center">
              <p className="text-xs text-muted">{t('summaryValidRows')}</p>
              <p className="text-2xl font-bold text-success-fg mt-1">{validateState.rowsValid}</p>
            </div>
            <div className="bg-danger-soft rounded-xl border border-danger p-4 text-center">
              <p className="text-xs text-muted">{t('summaryInvalidRows')}</p>
              <p className="text-2xl font-bold text-danger-fg mt-1">{validateState.rowsInvalid}</p>
            </div>
          </div>

          {/* Invalid rows detail */}
          {invalidRows.length > 0 && (
            <div className="bg-surface rounded-xl border border-danger overflow-hidden">
              <div className="px-4 py-3 bg-danger-soft border-b border-danger">
                <p className="text-xs font-semibold text-danger-fg">{t('invalidSectionTitle')}</p>
              </div>
              <div className="divide-y divide-line">
                {invalidRows.map((r) => (
                  <div key={r.row} className="px-4 py-3">
                    <p className="text-xs font-medium text-foreground">{t('rowLabel', { row: r.row, name: r.product_name })}</p>
                    <ul className="mt-1 space-y-0.5">
                      {r.errors.map((e, i) => (
                        <li key={i} className="text-xs text-danger-fg">• {e}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valid rows preview */}
          {validRows.length > 0 && (
            <div className="bg-surface rounded-xl border border-success overflow-hidden">
              <div className="px-4 py-3 bg-success-soft border-b border-success">
                <p className="text-xs font-semibold text-success-fg">{t('validSectionTitle')}</p>
              </div>
              <div className="divide-y divide-line max-h-64 overflow-y-auto">
                {validRows.map((r) => (
                  <div key={r.row} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-success-soft flex items-center justify-center flex-shrink-0">
                      <span className="text-success-fg text-xs">✓</span>
                    </span>
                    <p className="text-xs text-foreground">{t('rowLabel', { row: r.row, name: r.product_name })}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Publish */}
          {validRows.length > 0 && validateState.importId && (
            <form action={publishAction} className="bg-surface rounded-xl border border-line p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">
                {t('step2Title', { count: validRows.length })}
              </h2>
              <p className="text-xs text-muted mb-4">
                {t('step2Body')}
              </p>
              {publishState.error && (
                <p className="text-xs text-danger-fg mb-3">{publishState.error}</p>
              )}
              <input type="hidden" name="import_id" value={validateState.importId} />
              <input type="hidden" name="csv_text" value={csvText} />
              <input type="hidden" name="filename" value={filename} />
              <button
                type="submit"
                disabled={isPublishing}
                className="px-5 py-2.5 bg-success text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPublishing ? t('publishing') : t('ctaPublish', { count: validRows.length })}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
