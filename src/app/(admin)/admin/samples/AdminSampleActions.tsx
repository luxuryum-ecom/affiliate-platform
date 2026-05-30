'use client'

import { useTransition } from 'react'
import { updateSampleStatus, updateSampleFileApproval } from '@/app/actions/sample-requests'
import { updateCatalogStatus, updateAttachmentStatus } from '@/app/actions/supplier-catalogs'
import type { SampleRequestStatus, AttachmentAdminStatus } from '@/types/database'

export function SampleStatusButton({
  requestId,
  newStatus,
  label,
  cls,
}: {
  requestId: string
  newStatus: SampleRequestStatus
  label: string
  cls: string
}) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateSampleStatus(requestId, newStatus) })}
      className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors ${cls}`}
    >
      {isPending ? '...' : label}
    </button>
  )
}

export function FileApprovalButton({
  fileId,
  approved,
}: {
  fileId: string
  approved: boolean
}) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateSampleFileApproval(fileId, approved) })}
      className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors ${
        approved ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-500 text-white hover:bg-red-600'
      }`}
    >
      {isPending ? '...' : approved ? 'Approuver' : 'Rejeter'}
    </button>
  )
}

export function CatalogStatusButton({
  catalogId,
  newStatus,
}: {
  catalogId: string
  newStatus: AttachmentAdminStatus
}) {
  const [isPending, startTransition] = useTransition()
  const label = newStatus === 'approved' ? 'Approuver' : 'Rejeter'
  const cls = newStatus === 'approved'
    ? 'bg-green-600 text-white hover:bg-green-700'
    : 'bg-red-500 text-white hover:bg-red-600'

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateCatalogStatus(catalogId, newStatus) })}
      className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors ${cls}`}
    >
      {isPending ? '...' : label}
    </button>
  )
}

export function AttachmentStatusButton({
  attachmentId,
  newStatus,
}: {
  attachmentId: string
  newStatus: AttachmentAdminStatus
}) {
  const [isPending, startTransition] = useTransition()
  const label = newStatus === 'approved' ? 'Approuver' : 'Rejeter'
  const cls = newStatus === 'approved'
    ? 'bg-green-600 text-white hover:bg-green-700'
    : 'bg-red-500 text-white hover:bg-red-600'

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateAttachmentStatus(attachmentId, newStatus) })}
      className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors ${cls}`}
    >
      {isPending ? '...' : label}
    </button>
  )
}
