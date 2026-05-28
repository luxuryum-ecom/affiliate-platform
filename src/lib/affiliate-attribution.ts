/** Client-side affiliate attribution persistence (30-day window). */

const STORAGE_KEY = 'affipartner_ref'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface StoredAttribution {
  affiliateId: string
  productId: string
  clickId: string | null
  sessionId: string
  capturedAt: number
}

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  let sid = sessionStorage.getItem('affipartner_sid')
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem('affipartner_sid', sid)
  }
  return sid
}

export function storeAttribution(data: Omit<StoredAttribution, 'capturedAt'>): void {
  if (typeof window === 'undefined') return
  const payload: StoredAttribution = { ...data, capturedAt: Date.now() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function readAttribution(productId: string): StoredAttribution | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredAttribution
    if (Date.now() - parsed.capturedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    if (parsed.productId !== productId) return null
    return parsed
  } catch {
    return null
  }
}

export function resolveAffiliateId(
  urlRef: string | null,
  productId: string
): { affiliateId: string | null; clickId: string | null; sessionId: string } {
  const sessionId = getOrCreateSessionId()
  if (urlRef) {
    return { affiliateId: urlRef, clickId: null, sessionId }
  }
  const stored = readAttribution(productId)
  if (stored) {
    return {
      affiliateId: stored.affiliateId,
      clickId: stored.clickId,
      sessionId: stored.sessionId,
    }
  }
  return { affiliateId: null, clickId: null, sessionId }
}
