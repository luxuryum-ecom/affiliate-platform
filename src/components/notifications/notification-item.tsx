'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { markNotificationRead, type NotificationView } from '@/app/actions/notifications'

/**
 * Une ligne de notification : libellé + corps + date, marquée lue au clic.
 * Les libellés/date arrivent déjà résolus (strings) depuis la server action.
 */
export function NotificationItem({
  notification,
  onRead,
}: {
  notification: NotificationView
  onRead: (id: string) => void
}) {
  const [, startTransition] = useTransition()
  const n = notification

  function handleRead() {
    if (n.isRead) return
    onRead(n.id) // maj optimiste côté client
    startTransition(() => {
      markNotificationRead(n.id)
    })
  }

  const inner = (
    <div className="flex items-start gap-2 px-4 py-3">
      {!n.isRead && (
        <span className="mt-1.5 w-2 h-2 rounded-full bg-gold-500 shrink-0" aria-hidden />
      )}
      <div className={`min-w-0 ${n.isRead ? 'opacity-60 ms-4' : ''}`}>
        <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
        {n.body && <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.body}</p>}
        <p className="text-[11px] text-faint mt-1">{n.dateLabel}</p>
      </div>
    </div>
  )

  return (
    <li className="hover:bg-surface-2 transition-colors">
      {n.href ? (
        <Link href={n.href} onClick={handleRead} className="block">
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={handleRead} className="block w-full text-start">
          {inner}
        </button>
      )}
    </li>
  )
}
