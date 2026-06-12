'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { assignWholesaleOrder } from '@/app/actions/orders'

type Member = { id: string; name: string }

export function WholesaleOrderAssignForm({
  orderId,
  members,
  currentAgentId,
}: {
  orderId: string
  members: Member[]
  currentAgentId: string | null
}) {
  const t    = useTranslations('admin.wholesaleAssign')
  const tErr = useTranslations()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<string>(currentAgentId ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (members.length === 0)
    return <p className="text-xs text-faint italic">{t('noMembers')}</p>

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    startTransition(async () => {
      const result = await assignWholesaleOrder(orderId, selected)
      setMsg({ ok: result.success, text: result.error ? tErr(result.error) : t('assignSuccess') })
      if (result.success) router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted mb-1">{t('assignTo')}</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          <option value="">{t('selectMember')}</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.ok ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'}`}>
          {msg.text}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending || !selected || selected === currentAgentId}
        className="w-full py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isPending ? t('assigning') : t('assign')}
      </button>
    </form>
  )
}
