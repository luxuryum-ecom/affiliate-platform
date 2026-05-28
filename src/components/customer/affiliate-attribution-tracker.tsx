'use client'

import { useEffect } from 'react'
import { recordAffiliateClick } from '@/app/actions/affiliate-clicks'
import { getOrCreateSessionId, storeAttribution } from '@/lib/affiliate-attribution'

interface AffiliateAttributionTrackerProps {
  productId: string
  affiliateId: string | null
}

export function AffiliateAttributionTracker({
  productId,
  affiliateId,
}: AffiliateAttributionTrackerProps) {
  useEffect(() => {
    if (!affiliateId) return

    const sessionId = getOrCreateSessionId()

    recordAffiliateClick(affiliateId, productId, sessionId).then(({ clickId }) => {
      storeAttribution({
        affiliateId,
        productId,
        clickId,
        sessionId,
      })
    })
  }, [affiliateId, productId])

  return null
}
