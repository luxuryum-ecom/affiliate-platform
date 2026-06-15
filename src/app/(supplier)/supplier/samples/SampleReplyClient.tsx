'use client'

import { useActionState, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { uploadSampleReplyFile } from '@/app/actions/sample-requests'

const initial = { error: null, success: false }

export default function SampleReplyClient({ requestId }: { requestId: string }) {
  const [state, action, isPending] = useActionState(uploadSampleReplyFile, initial)
  const [filename, setFilename] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const t = useTranslations('supplier.sampleReply')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFilename(e.target.files?.[0]?.name ?? '')
  }

  return (
    <form action={action} className="flex items-center gap-3 flex-wrap">
      <input type="hidden" name="sample_request_id" value={requestId} />
      {state.error && <p className="w-full text-xs text-danger-fg">{state.error}</p>}
      {state.success && <p className="w-full text-xs text-success-fg">{t('successMessage')}</p>}
      <div className="border border-line rounded-lg px-3 py-1.5 flex-1 min-w-[180px]">
        <input
          ref={fileRef}
          name="file"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov"
          required
          onChange={handleChange}
          className="hidden"
          id={`reply-file-${requestId}`}
        />
        <label htmlFor={`reply-file-${requestId}`} className="cursor-pointer text-xs text-muted">
          {filename || t('filePlaceholder')}
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending || !filename}
        className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? t('sending') : t('ctaSend')}
      </button>
    </form>
  )
}
