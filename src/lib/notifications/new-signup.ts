import { telegramSendMessage } from '@/lib/telegram/client'

/**
 * Notifie l'admin (Abdou) qu'un nouveau compte vient de s'inscrire et attend
 * validation (statut `pending`). BEST-EFFORT TOTAL : ne lève JAMAIS, ne bloque
 * jamais le signup. Canal = Telegram admin (ADMIN_TELEGRAM_CHAT_ID, serveur only).
 *
 * Zéro donnée sensible : seulement rôle + nom (saisis par l'inscrit) + rappel du
 * panneau d'approbation. Pas d'email/téléphone.
 */
export async function notifyAdminNewSignup(params: {
  role: string
  fullName: string
}): Promise<void> {
  try {
    const adminChat = process.env.ADMIN_TELEGRAM_CHAT_ID
    if (!adminChat) return

    const roleLabel =
      params.role === 'wholesaler' ? 'Grossiste'
      : params.role === 'supplier' ? 'Fournisseur'
      : params.role === 'affiliate' ? 'Affilié'
      : params.role

    const name = params.fullName?.trim() || '(sans nom)'
    const text =
      `🆕 Nouvelle inscription en attente de validation\n` +
      `• Rôle : ${roleLabel}\n` +
      `• Nom : ${name}\n` +
      `→ Approuver / rejeter dans /admin/users`

    await telegramSendMessage(Number(adminChat), text)
  } catch (e) {
    // Best-effort total : une notif ratée ne doit jamais casser l'inscription.
    console.error('notifyAdminNewSignup', e)
  }
}
