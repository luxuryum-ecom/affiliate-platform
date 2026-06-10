'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { submitSampleRequest } from '@/app/actions/sample-requests'

const initial = { error: null, success: false }

interface TSample {
  typeLabel: string
  typePlaceholder: string
  typePhotos: string
  typeVideo: string
  typeTechnicalSheet: string
  typeSample: string
  messageLabel: string
  messagePlaceholder: string
  submit: string
  submitting: string
  success: string
  successSubtitle: string
  trackLink: string
}

export default function SampleRequestClient({
  supplierProductId,
  tSample,
}: {
  supplierProductId: string
  tSample: TSample
}) {
  const [state, action, isPending] = useActionState(submitSampleRequest, initial)

  if (state.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-sm font-semibold text-green-800">{tSample.success}</p>
        <p className="text-xs text-green-600 mt-1">{tSample.successSubtitle}</p>
        <Link
          href="/wholesale/samples"
          className="inline-block mt-3 text-xs text-green-700 underline underline-offset-2 hover:no-underline"
        >
          {tSample.trackLink}
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="supplier_product_id" value={supplierProductId} />

      {state.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{state.error}</div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">{tSample.typeLabel}</label>
        <select
          name="request_type"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">{tSample.typePlaceholder}</option>
          <option value="photos">{tSample.typePhotos}</option>
          <option value="video">{tSample.typeVideo}</option>
          <option value="technical_sheet">{tSample.typeTechnicalSheet}</option>
          <option value="sample">{tSample.typeSample}</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">{tSample.messageLabel}</label>
        <textarea
          name="message"
          rows={3}
          placeholder={tSample.messagePlaceholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? tSample.submitting : tSample.submit}
      </button>
    </form>
  )
}
