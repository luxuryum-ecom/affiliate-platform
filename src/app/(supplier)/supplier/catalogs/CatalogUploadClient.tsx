'use client'

import { useActionState, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { uploadSupplierCatalog } from '@/app/actions/supplier-catalogs'

const initial = { error: null, success: false }

export default function CatalogUploadClient() {
  const [state, action, isPending] = useActionState(uploadSupplierCatalog, initial)
  const [filename, setFilename] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('supplier.catalogUpload')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFilename(e.target.files?.[0]?.name ?? '')
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</div>
      )}
      {state.success && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          {t('successMessage')}
        </div>
      )}

      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-gray-400 transition-colors">
        <input
          ref={fileRef}
          name="file"
          type="file"
          accept=".pdf,.xlsx,.xls,.zip"
          required
          onChange={handleChange}
          className="hidden"
          id="catalog-input"
        />
        <label htmlFor="catalog-input" className="cursor-pointer">
          {filename ? (
            <div>
              <p className="text-sm font-medium text-gray-900">{filename}</p>
              <p className="text-xs text-gray-500 mt-1">{t('dropzoneActive')}</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500">{t('dropzoneEmpty')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('dropzoneHint')}</p>
            </div>
          )}
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending || !filename}
        className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? t('uploading') : t('ctaUpload')}
      </button>
    </form>
  )
}
