'use client'

import { useActionState, useRef, useState } from 'react'
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

const CSV_TEMPLATE = [
  'product_name,category,description,moq,unit,supplier_unit_price_usd,stock_quantity,export_country,lead_time,images_urls,moq_tiers,color,size,model',
  'T-shirt Homme Coton,Textile Homme,T-shirt 100% coton,100,pcs,2.50,5000,Turquie,21,https://img.example.com/1.jpg,100:2.5|500:2.2|1000:1.9,Blanc|Noir,S|M|L,',
].join('\n')

export default function BulkImportClient() {
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
      <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
        <p className="text-sm font-semibold text-green-800 mb-1">Import publié avec succès</p>
        <p className="text-xs text-green-600">
          Vos produits ont été soumis et sont en attente de validation par l&apos;administrateur.
        </p>
        <a href="/supplier/products" className="mt-4 inline-block text-xs px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
          Voir mes produits →
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Template download */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-800 mb-1">Format attendu (CSV)</p>
        <p className="text-xs text-blue-600 mb-3">
          Colonnes obligatoires : <code className="bg-blue-100 px-1 rounded">product_name</code>, <code className="bg-blue-100 px-1 rounded">category</code>, <code className="bg-blue-100 px-1 rounded">moq</code>, <code className="bg-blue-100 px-1 rounded">unit</code>, <code className="bg-blue-100 px-1 rounded">supplier_unit_price_usd</code>, <code className="bg-blue-100 px-1 rounded">export_country</code>
        </p>
        <p className="text-xs text-blue-500 mb-3">
          Variants : séparer les valeurs par <code className="bg-blue-100 px-1 rounded">|</code> — ex: Blanc|Noir · MOQ tiers : <code className="bg-blue-100 px-1 rounded">100:2.5,500:2.2,1000:1.9</code>
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
          className="text-xs px-3 py-1.5 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors"
        >
          Télécharger le modèle CSV
        </button>
      </div>

      {/* Upload form */}
      <form action={validateAction} className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">1. Importer le fichier CSV</h2>

        {validateState.error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            {validateState.error}
          </div>
        )}

        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-gray-400 transition-colors">
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
                <p className="text-sm font-medium text-gray-900">{filename}</p>
                <p className="text-xs text-gray-500 mt-1">Cliquer pour changer de fichier</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">Glisser-déposer ou cliquer pour sélectionner</p>
                <p className="text-xs text-gray-400 mt-1">CSV ou XLSX — max 10 MB</p>
              </div>
            )}
          </label>
        </div>

        <button
          type="submit"
          disabled={isValidating || !filename}
          className="mt-4 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isValidating ? 'Validation en cours...' : 'Valider le fichier'}
        </button>
      </form>

      {/* Validation report */}
      {validateState.success && report.length > 0 && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{validateState.rowsTotal}</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
              <p className="text-xs text-gray-500">Lignes valides</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{validateState.rowsValid}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
              <p className="text-xs text-gray-500">Lignes invalides</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{validateState.rowsInvalid}</p>
            </div>
          </div>

          {/* Invalid rows detail */}
          {invalidRows.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
              <div className="px-4 py-3 bg-red-50 border-b border-red-200">
                <p className="text-xs font-semibold text-red-700">Lignes invalides — à corriger avant import</p>
              </div>
              <div className="divide-y divide-gray-100">
                {invalidRows.map((r) => (
                  <div key={r.row} className="px-4 py-3">
                    <p className="text-xs font-medium text-gray-800">Ligne {r.row} — {r.product_name}</p>
                    <ul className="mt-1 space-y-0.5">
                      {r.errors.map((e, i) => (
                        <li key={i} className="text-xs text-red-600">• {e}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valid rows preview */}
          {validRows.length > 0 && (
            <div className="bg-white rounded-xl border border-green-200 overflow-hidden">
              <div className="px-4 py-3 bg-green-50 border-b border-green-200">
                <p className="text-xs font-semibold text-green-700">Lignes valides — prêtes à importer</p>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {validRows.map((r) => (
                  <div key={r.row} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600 text-xs">✓</span>
                    </span>
                    <p className="text-xs text-gray-800">Ligne {r.row} — {r.product_name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Publish */}
          {validRows.length > 0 && validateState.importId && (
            <form action={publishAction} className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                2. Publier les {validRows.length} produit{validRows.length > 1 ? 's' : ''} valide{validRows.length > 1 ? 's' : ''}
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Les produits seront soumis en statut &quot;En attente&quot; et devront être approuvés par l&apos;administrateur.
              </p>
              {publishState.error && (
                <p className="text-xs text-red-600 mb-3">{publishState.error}</p>
              )}
              <input type="hidden" name="import_id" value={validateState.importId} />
              <input type="hidden" name="csv_text" value={csvText} />
              <input type="hidden" name="filename" value={filename} />
              <button
                type="submit"
                disabled={isPublishing}
                className="px-5 py-2.5 bg-green-700 text-white text-sm font-medium rounded-lg hover:bg-green-800 disabled:opacity-50 transition-colors"
              >
                {isPublishing ? 'Publication en cours...' : `Publier ${validRows.length} produit${validRows.length > 1 ? 's' : ''}`}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
