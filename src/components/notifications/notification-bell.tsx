'use client'

import { useEffect, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  getNotifications,
  markAllRead,
  type NotificationView,
} from '@/app/actions/notifications'
import { NotificationItem } from '@/components/notifications/notification-item'

/**
 * Cloche de notifications in-app (modèle Shopify) : badge compteur non-lus +
 * dropdown liste. Composant 100 % autonome (aucune prop) → se monte directement
 * dans un en-tête Server Component. Récupère ses données via la server action
 * RLS-scopée (chaque utilisateur ne voit que les siennes).
 */
export function NotificationBell() {
  const t = useTranslations('notifications.ui')
  const isRtl = useLocale().split('-')[0] === 'ar'

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationView[]>([])
  const [unread, setUnread] = useState(0)
  const [, startTransition] = useTransition()

  async function load() {
    const res = await getNotifications({ limit: 20 })
    setItems(res.items)
    setUnread(res.unreadCount)
  }

  useEffect(() => {
    load()
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) load()
  }

  function onMarkAll() {
    startTransition(async () => {
      await markAllRead()
      await load()
    })
  }

  function onItemRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    setUnread((u) => Math.max(0, u - 1))
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={t('ariaLabel')}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-foreground transition-colors"
      >
        <span className="text-lg leading-none" aria-hidden>
          🔔
        </span>
        {unread > 0 && (
          <span
            className={`absolute -top-0.5 ${isRtl ? '-left-0.5' : '-right-0.5'} min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-gold-500 text-ink-900 text-[10px] font-bold`}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Overlay invisible pour fermer au clic extérieur */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className={`absolute z-40 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg ${isRtl ? 'left-0' : 'right-0'}`}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
              <span className="text-sm font-semibold text-foreground">{t('title')}</span>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={onMarkAll}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  {t('markAll')}
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-faint">{t('empty')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={onItemRead} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
