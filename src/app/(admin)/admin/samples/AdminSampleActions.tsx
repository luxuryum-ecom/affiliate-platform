'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updateSampleStatus, updateSampleFileApproval } from '@/app/actions/sample-requests'
import { updateCatalogStatus, updateAttachmentStatus } from '@/app/actions/supplier-catalogs'
import type { SampleRequestStatus, AttachmentAdminStatus } from '@/types/database'

const APPROVE_CLS = 'bg-success-soft text-success-fg border border-success hover:opacity-80'
const REJECT_CLS = 'bg-danger-soft text-danger-fg border border-danger hover:opacity-80'

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
      className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-opacity ${cls}`}
    >
      {isPending ? '…' : label}
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
  const t = useTranslations('admin.samples')
  const [isPending, startTransition] = useTransition()
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateSampleFileApproval(fileId, approved) })}
      className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-opacity ${
        approved ? APPROVE_CLS : REJECT_CLS
      }`}
    >
      {isPending ? '…' : approved ? t('approve') : t('reject')}
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
  const t = useTranslations('admin.samples')
  const [isPending, startTransition] = useTransition()
  const label = newStatus === 'approved' ? t('approve') : t('reject')
  const cls = newStatus === 'approved' ? APPROVE_CLS : REJECT_CLS

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateCatalogStatus(catalogId, newStatus) })}
      className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-opacity ${cls}`}
    >
      {isPending ? '…' : label}
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
  const t = useTranslations('admin.samples')
  const [isPending, startTransition] = useTransition()
  const label = newStatus === 'approved' ? t('approve') : t('reject')
  const cls = newStatus === 'approved' ? APPROVE_CLS : REJECT_CLS

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await updateAttachmentStatus(attachmentId, newStatus) })}
      className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-50 transition-opacity ${cls}`}
    >
      {isPending ? '…' : label}
    </button>
  )
}
