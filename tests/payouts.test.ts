import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/app/actions/_guards', () => ({ requireAdmin: vi.fn() }))

import { requireAdmin } from '@/app/actions/_guards'
import { createPayout } from '@/app/actions/payouts'

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>
const emptyState = { error: null, success: false, payoutId: null, amount: null }

function fd(obj: Record<string, string>) {
  const f = new FormData()
  for (const k in obj) f.set(k, obj[k])
  return f
}

// NB : l'idempotence RÉELLE (rejeu/double-clic neutralisés, montant dérivé) est
// garantie côté Postgres par la RPC `create_payout` (atomique + ON CONFLICT sur la clé).
// Ici on garde le CONTRAT JS : le montant n'est jamais transmis (dérivé serveur).
// Lot F (mig 130) : APRÈS create_payout, l'action appelle aussi
// `generate_payout_statement` (relevé figé) — d'où >1 appel rpc possible ; on cible
// donc explicitement l'appel `create_payout`.

describe('createPayout — contrat d’idempotence (côté JS)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clé d’idempotence manquante → erreur, aucune RPC appelée', async () => {
    const rpc = vi.fn()
    mocked(requireAdmin).mockResolvedValue({ supabase: { rpc }, error: null, userId: 'admin1' })
    const res = await createPayout(emptyState, fd({ affiliateId: 'aff1' })) // pas de idempotencyKey
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/clé/i)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('transmet la clé d’idempotence à la RPC et NE passe PAS de montant (dérivé serveur)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'po1', amount: 250 }, error: null })
    mocked(requireAdmin).mockResolvedValue({ supabase: { rpc }, error: null, userId: 'admin1' })

    const res = await createPayout(emptyState, fd({ affiliateId: 'aff1', idempotencyKey: 'KEY-123', reference: 'REF', notes: 'n' }))

    // `create_payout` appelé EXACTEMENT une fois (l'appel `generate_payout_statement`
    // du Lot F est un appel rpc distinct, autorisé).
    const createCalls = rpc.mock.calls.filter((c) => c[0] === 'create_payout')
    expect(createCalls).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('create_payout', expect.objectContaining({
      p_affiliate_id: 'aff1',
      p_idempotency_key: 'KEY-123',
    }))
    // Le montant n'est jamais saisi/transmis côté client → dérivé par la RPC
    const args = createCalls[0][1] as Record<string, unknown>
    expect(args).not.toHaveProperty('p_amount')
    expect(res.success).toBe(true)
    expect(res.amount).toBe(250)
    expect(res.payoutId).toBe('po1')
  })
})
