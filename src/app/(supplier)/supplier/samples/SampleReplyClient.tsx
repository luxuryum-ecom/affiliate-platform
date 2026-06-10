'use client'

import { useActionState, useRef, useState } from 'react'
import { uploadSampleReplyFile } from '@/app/actions/sample-requests'

const initial = { error: null, success: false }

export default function SampleReplyClient({ requestId }: { requestId: string }) {
  const [state, action, isPending] = useActionState(uploadSampleReplyFile, initial)
  const [filename, setFilename] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFilename(e.target.files?.[0]?.name ?? '')
  }

  return (
    <form action={action} className="flex items-center gap-3 flex-wrap">
      <input type="hidden" name="sample_request_id" value={requestId} />
      {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="w-full text-xs text-green-700">Fichier uploadé — en attente de validation admin.</p>}
      <div className="border border-gray-300 rounded-lg px-3 py-1.5 flex-1 min-w-[180px]">
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
        <label htmlFor={`reply-file-${requestId}`} className="cursor-pointer text-xs text-gray-500">
          {filename || 'Choisir un fichier (PDF, image, vidéo)'}
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending || !filename}
        className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? '...' : 'Envoyer'}
      </button>
    </form>
  )
}
