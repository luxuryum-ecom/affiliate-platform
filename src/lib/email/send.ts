// ─── Envoi email best-effort (module Livreurs, Lot E) ────────────────────────
//
// Transport email SANS dépendance : appel direct de l'API REST Resend via `fetch`
// (pur, sûr serverless Vercel). Best-effort total : si `RESEND_API_KEY` /
// `EMAIL_FROM` ne sont pas configurés, ou si l'appel échoue, on log et on RETOURNE
// (jamais d'exception qui remonterait dans un flux appelant). Aucune notif/email
// ne doit JAMAIS bloquer une écriture (règle Lot E).
//
// Config (env, non commité) : RESEND_API_KEY (clé API Resend), EMAIL_FROM
// (adresse expéditeur vérifiée), et le destinataire passé en argument (Abdou).

export interface SendEmailInput {
  to: string
  subject: string
  /** Corps HTML (déjà rendu). */
  html: string
}

export interface SendEmailResult {
  sent: boolean
  reason?: string
}

/**
 * Envoie un email via Resend (fetch). Ne throw JAMAIS. Renvoie `{sent:false, reason}`
 * si non configuré ou en échec — l'appelant ignore le résultat (best-effort).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY / EMAIL_FROM non configuré — envoi ignoré (best-effort).')
    return { sent: false, reason: 'not_configured' }
  }
  if (!input.to) return { sent: false, reason: 'no_recipient' }

  // @finance P2-1 : timeout court (10s) — borne la latence externe. L'email étant
  // best-effort post-écriture, un endpoint qui pend ne doit pas suspendre l'appelant.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[email] échec Resend (${res.status}): ${body.slice(0, 200)}`)
      return { sent: false, reason: `http_${res.status}` }
    }
    return { sent: true }
  } catch (e) {
    console.error('[email] exception envoi:', e instanceof Error ? e.message : String(e))
    return { sent: false, reason: 'exception' }
  } finally {
    clearTimeout(timeout)
  }
}
