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

const INPUT = 'w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 bg-surface text-foreground placeholder:text-faint'
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

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
      <div className="bg-success-soft border border-success rounded-xl p-4 text-center">
        <p className="text-sm font-semibold text-success-fg">{tSample.success}</p>
        <p className="text-xs text-success-fg mt-1">{tSample.successSubtitle}</p>
        <Link
          href="/wholesale/samples"
          className="inline-block mt-3 text-xs text-success-fg underline underline-offset-2 hover:no-underline"
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
        <div className="text-xs text-danger-fg bg-danger-soft border border-danger rounded-lg px-4 py-3">{state.error}</div>
      )}

      <div>
        <label className={LABEL}>{tSample.typeLabel}</label>
        <select
          name="request_type"
          required
          className={INPUT}
        >
          <option value="">{tSample.typePlaceholder}</option>
          <option value="photos">{tSample.typePhotos}</option>
          <option value="video">{tSample.typeVideo}</option>
          <option value="technical_sheet">{tSample.typeTechnicalSheet}</option>
          <option value="sample">{tSample.typeSample}</option>
        </select>
      </div>

      <div>
        <label className={LABEL}>{tSample.messageLabel}</label>
        <textarea
          name="message"
          rows={3}
          placeholder={tSample.messagePlaceholder}
          className={`${INPUT} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? tSample.submitting : tSample.submit}
      </button>
    </form>
  )
}
