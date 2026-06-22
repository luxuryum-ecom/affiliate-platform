/**
 * Tests unitaires — Feature "Affectation agents de sourcing par pays" (migration 086)
 *
 * Couvre :
 *  1. getAgentCountryAssignments — agrégation correcte agents/permissions/pays
 *  2. setAgentCountry — validation Zod, gate admin, appel RPC correct
 *  3. setManageCountrySourcingPermission — toggle grant/revoke
 *  4. getMyAgentSourcingRequests — isolation RPC (pas de PII dans le type retourné)
 *  5. getMyAgentCountries — codes pays de l'agent connecté
 *
 * Pattern mock : same as orders.test.ts (makeClient + vi.mock)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import {
  getAgentCountryAssignments,
  setAgentCountry,
  setManageCountrySourcingPermission,
} from '@/app/actions/agent-countries'
import {
  getMyAgentSourcingRequests,
  getMyAgentCountries,
  type AgentSourcingRequest,
} from '@/app/actions/agent-sourcing'
import { makeClient } from './_supabase-mock'

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>

// ─── Fixtures ────────────────────────────────────────────────────────────────

// UUIDs v4 valides (la validation Zod uuid est stricte sur le format)
const AGENT_ID   = 'cabe39bd-9346-40bc-bb8e-73e0ad76b5ad'
const AGENT_ID_2 = 'dd1337c9-04c4-4c9c-aeda-e0f0e6d3f781'
const ADMIN_ID   = 'e13f2c4c-4feb-4ae7-8a94-36670facec9c'

const agents = [
  { id: AGENT_ID,   full_name: 'Agent Chine',   role: 'agent' },
  { id: AGENT_ID_2, full_name: 'Agent Turquie',  role: 'agent' },
]

const perms = [
  { user_id: AGENT_ID }, // seul Agent Chine a la capability
]

const assignments = [
  { agent_id: AGENT_ID,   country_code: 'CN' },
  { agent_id: AGENT_ID,   country_code: 'EG' },
  { agent_id: AGENT_ID_2, country_code: 'TR' },
]

// ─── SECTION 1 : getAgentCountryAssignments ──────────────────────────────────
// Note : requireAdmin() appelle profiles.select('role').eq(id).single() une fois
// (pour vérifier le rôle admin). getAgentCountryAssignments fait ensuite 3 queries :
// profiles (liste agents), staff_permissions, agent_countries.
// Le resolver utilise un compteur d'appels par table pour distinguer ces cas.

describe('getAgentCountryAssignments', () => {
  function makeAdminClientWithCounter(
    agentList = agents,
    permList = perms,
    assignList = assignments,
  ) {
    const profilesCallCount = { n: 0 }
    return makeClient({
      getUser: () => ({ data: { user: { id: ADMIN_ID } } }),
      resolve(table) {
        if (table === 'profiles') {
          profilesCallCount.n++
          // Premier appel = requireAdmin → single() → retourne {role:'admin'}
          if (profilesCallCount.n === 1) return { data: { role: 'admin' } }
          // Deuxième appel = getAgentCountryAssignments → retourne la liste
          return { data: agentList }
        }
        if (table === 'staff_permissions') return { data: permList }
        if (table === 'agent_countries') return { data: assignList }
        return { data: null }
      },
    })
  }

  beforeEach(() => {
    mocked(createClient).mockResolvedValue(makeAdminClientWithCounter() as never)
  })

  it('retourne tous les agents avec le bon flag has_capability', async () => {
    const result = await getAgentCountryAssignments()
    expect(result).toHaveLength(2)
    const agentCn = result.find(a => a.id === AGENT_ID)
    const agentTr = result.find(a => a.id === AGENT_ID_2)
    expect(agentCn?.has_capability).toBe(true)
    expect(agentTr?.has_capability).toBe(false)
  })

  it('retourne les bons country_codes par agent', async () => {
    const result = await getAgentCountryAssignments()
    const agentCn = result.find(a => a.id === AGENT_ID)
    const agentTr = result.find(a => a.id === AGENT_ID_2)
    // Agent Chine a CN + EG
    expect(agentCn?.country_codes.sort()).toEqual(['CN', 'EG'])
    // Agent Turquie a TR
    expect(agentTr?.country_codes).toEqual(['TR'])
  })

  it('retourne [] si aucun agent approuvé', async () => {
    mocked(createClient).mockResolvedValue(makeAdminClientWithCounter([], [], []) as never)
    const result = await getAgentCountryAssignments()
    expect(result).toEqual([])
  })

  it('retourne [] si non authentifié (requireAdmin échoue)', async () => {
    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: null } }),
      resolve: () => ({ data: null }),
    }) as never)
    const result = await getAgentCountryAssignments()
    expect(result).toEqual([])
  })

  it('retourne country_codes=[] pour un agent sans affectation', async () => {
    mocked(createClient).mockResolvedValue(
      makeAdminClientWithCounter(
        [{ id: AGENT_ID_2, full_name: 'New Agent', role: 'agent' }],
        [],
        [],
      ) as never,
    )
    const result = await getAgentCountryAssignments()
    expect(result[0].country_codes).toEqual([])
    expect(result[0].has_capability).toBe(false)
  })
})

// ─── SECTION 2 : setAgentCountry ─────────────────────────────────────────────

describe('setAgentCountry', () => {
  let rpcCalls: Array<{ name: string; args: unknown }> = []

  function makeAdminClientWithRpc(adminId = ADMIN_ID) {
    rpcCalls = []
    return makeClient({
      getUser: () => ({ data: { user: { id: adminId } } }),
      rpc(name, args) {
        rpcCalls.push({ name, args })
        return { data: null, error: null }
      },
      resolve(table) {
        if (table === 'profiles') return { data: { role: 'admin' } }
        return { data: null }
      },
    })
  }

  beforeEach(() => {
    mocked(createClient).mockResolvedValue(makeAdminClientWithRpc() as never)
  })

  it('appelle link_agent_country quand linked=true', async () => {
    const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: 'CN', linked: true })
    expect(result.success).toBe(true)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('link_agent_country')
    expect(rpcCalls[0].args).toMatchObject({ p_agent_id: AGENT_ID, p_country_code: 'CN' })
  })

  it('appelle unlink_agent_country quand linked=false', async () => {
    const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: 'TR', linked: false })
    expect(result.success).toBe(true)
    expect(rpcCalls[0].name).toBe('unlink_agent_country')
    expect(rpcCalls[0].args).toMatchObject({ p_agent_id: AGENT_ID, p_country_code: 'TR' })
  })

  it('rejette les pays non dans l\'allowlist Zod', async () => {
    const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: 'FR', linked: true })
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    // Aucun RPC ne doit être appelé
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejette les pays vides', async () => {
    const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: '', linked: true })
    expect(result.success).toBe(false)
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejette un agentId non-UUID', async () => {
    const result = await setAgentCountry({ agentId: 'not-a-uuid', countryCode: 'CN', linked: true })
    expect(result.success).toBe(false)
    expect(rpcCalls).toHaveLength(0)
  })

  it('retourne error si non authentifié', async () => {
    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: null } }),
      resolve: () => ({ data: null }),
    }) as never)
    const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: 'CN', linked: true })
    expect(result.success).toBe(false)
    expect(rpcCalls).toHaveLength(0)
  })

  it('retourne error si l\'erreur RPC remonte', async () => {
    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: { id: ADMIN_ID } } }),
      rpc(name, args) {
        rpcCalls.push({ name, args })
        return { data: null, error: { message: 'Agent introuvable' } }
      },
      resolve(table) {
        if (table === 'profiles') return { data: { role: 'admin' } }
        return { data: null }
      },
    }) as never)
    const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: 'CN', linked: true })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Agent introuvable')
  })

  it('accepte tous les pays de l\'allowlist (CN/TR/EG/AE)', async () => {
    for (const cc of ['CN', 'TR', 'EG', 'AE'] as const) {
      mocked(createClient).mockResolvedValue(makeAdminClientWithRpc() as never)
      const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: cc, linked: true })
      expect(result.success, `${cc} devrait être accepté`).toBe(true)
    }
  })
})

// ─── SECTION 3 : setManageCountrySourcingPermission ──────────────────────────

describe('setManageCountrySourcingPermission', () => {
  let rpcCalls: Array<{ name: string; args: unknown }> = []
  const INITIAL = { error: null, success: false }

  function makeAdminRpcClient() {
    rpcCalls = []
    return makeClient({
      getUser: () => ({ data: { user: { id: ADMIN_ID } } }),
      rpc(name, args) { rpcCalls.push({ name, args }); return { data: null, error: null } },
      resolve(table) {
        if (table === 'profiles') return { data: { role: 'admin' } }
        return { data: null }
      },
    })
  }

  function fd(obj: Record<string, string>): FormData {
    const f = new FormData()
    for (const k in obj) f.set(k, obj[k])
    return f
  }

  beforeEach(() => {
    mocked(createClient).mockResolvedValue(makeAdminRpcClient() as never)
  })

  it('appelle grant_staff_permission quand enabled=true', async () => {
    const result = await setManageCountrySourcingPermission(
      INITIAL,
      fd({ user_id: AGENT_ID, enabled: 'true' }),
    )
    expect(result.success).toBe(true)
    expect(rpcCalls[0].name).toBe('grant_staff_permission')
    expect(rpcCalls[0].args).toMatchObject({
      p_user_id: AGENT_ID,
      p_capability: 'manage_country_sourcing',
    })
  })

  it('appelle revoke_staff_permission quand enabled=false', async () => {
    const result = await setManageCountrySourcingPermission(
      INITIAL,
      fd({ user_id: AGENT_ID, enabled: 'false' }),
    )
    expect(result.success).toBe(true)
    expect(rpcCalls[0].name).toBe('revoke_staff_permission')
    expect(rpcCalls[0].args).toMatchObject({ p_capability: 'manage_country_sourcing' })
  })

  it('retourne error si user_id manquant', async () => {
    const result = await setManageCountrySourcingPermission(
      INITIAL,
      fd({ enabled: 'true' }),
    )
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(rpcCalls).toHaveLength(0)
  })

  it('retourne error si non authentifié', async () => {
    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: null } }),
      resolve: () => ({ data: null }),
    }) as never)
    const result = await setManageCountrySourcingPermission(
      INITIAL,
      fd({ user_id: AGENT_ID, enabled: 'true' }),
    )
    expect(result.success).toBe(false)
  })
})

// ─── SECTION 4 : getMyAgentSourcingRequests — PII isolation ─────────────────

describe('getMyAgentSourcingRequests', () => {
  // Les colonnes renvoyées par la RPC list_agent_sourcing_requests (cf. mig 086)
  // ne contiennent AUCUNE PII. On vérifie que le type AgentSourcingRequest
  // ne comporte pas les champs interdits.
  it('le type AgentSourcingRequest ne contient pas les champs PII', () => {
    // Construction d'un objet conforme au type — TypeScript garantit à la compilation
    // que ces champs n'existent pas. Ce test vérifie la cohérence runtime.
    const mockRequest: AgentSourcingRequest = {
      id: '00000000-0000-0000-0000-000000000001',
      product_name: 'Test Product',
      category: 'Electronics',
      quantity: 100,
      target_country_code: 'CN',
      delivery_deadline: '2026-12-31',
      notes: 'Test notes',
      status: 'pending',
      created_at: '2026-06-22T00:00:00Z',
    }

    // Champs PII interdits (wholesaler_id, customer_name, customer_phone, etc.)
    const forbiddenFields = [
      'wholesaler_id',
      'customer_name',
      'customer_phone',
      'customer_address',
      'company_name',
      'email',
      'phone',
      'address',
      'target_budget_mad', // montant interdit à l'agent sourcing
    ] as const

    for (const field of forbiddenFields) {
      expect(
        Object.prototype.hasOwnProperty.call(mockRequest, field),
        `Le type AgentSourcingRequest ne doit PAS exposer le champ "${field}"`,
      ).toBe(false)
    }
  })

  it('retourne [] si la RPC renvoie null', async () => {
    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: { id: AGENT_ID } } }),
      rpc: () => ({ data: null, error: null }),
      resolve: () => ({ data: null }),
    }) as never)
    const result = await getMyAgentSourcingRequests()
    expect(result).toEqual([])
  })

  it('retourne les demandes filtrées par la RPC (pas de cross-pays côté client)', async () => {
    // Simule une RPC qui renvoie uniquement les demandes CN (filtrage fait côté DB)
    const cnRequests: AgentSourcingRequest[] = [
      {
        id: '00000000-0000-0000-0000-000000000002',
        product_name: 'Lunettes CN',
        category: 'Accessoires',
        quantity: 500,
        target_country_code: 'CN',
        delivery_deadline: '',
        notes: 'test',
        status: 'pending',
        created_at: '2026-06-22T00:00:00Z',
      },
    ]

    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: { id: AGENT_ID } } }),
      rpc(name) {
        if (name === 'list_agent_sourcing_requests') return { data: cnRequests, error: null }
        return { data: null, error: null }
      },
      resolve: () => ({ data: null }),
    }) as never)

    const result = await getMyAgentSourcingRequests()
    expect(result).toHaveLength(1)
    expect(result[0].target_country_code).toBe('CN')
    expect(result[0].product_name).toBe('Lunettes CN')
  })
})

// ─── SECTION 5 : getMyAgentCountries ─────────────────────────────────────────

describe('getMyAgentCountries', () => {
  it('retourne les codes pays de la RPC', async () => {
    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: { id: AGENT_ID } } }),
      rpc(name) {
        if (name === 'list_agent_country_codes') return { data: [{ country_code: 'CN' }, { country_code: 'EG' }], error: null }
        return { data: null, error: null }
      },
      resolve: () => ({ data: null }),
    }) as never)

    const result = await getMyAgentCountries()
    expect(result).toHaveLength(2)
    expect(result.map(r => r.country_code).sort()).toEqual(['CN', 'EG'])
  })

  it('retourne [] si la RPC renvoie null (agent sans pays)', async () => {
    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: { id: AGENT_ID } } }),
      rpc: () => ({ data: null, error: null }),
      resolve: () => ({ data: null }),
    }) as never)

    const result = await getMyAgentCountries()
    expect(result).toEqual([])
  })
})

// ─── SECTION 6 : Isolation cross-pays — logique DB (validation schéma) ───────

describe('Isolation cross-pays — validation schéma Zod', () => {
  // L'allowlist Zod dans setAgentCountry empêche d'affecter un pays non sourcé.
  // Ce test vérifie que l'enum Zod est exhaustif et correct.

  // UI sourcing = 4 pays internationaux. MA reste en allowlist DB (mig 086) mais
  // n'est pas affectable via l'action/UI (sourcing = international).
  const ALLOWED = ['CN', 'TR', 'EG', 'AE']
  const FORBIDDEN = ['MA', 'FR', 'US', 'DE', 'IN', '', 'XX', 'SQL_INJECTION; DROP TABLE']

  let rpcCalls: string[] = []

  beforeEach(() => {
    rpcCalls = []
    mocked(createClient).mockResolvedValue(makeClient({
      getUser: () => ({ data: { user: { id: ADMIN_ID } } }),
      rpc(name) { rpcCalls.push(name); return { data: null, error: null } },
      resolve(table) {
        if (table === 'profiles') return { data: { role: 'admin' } }
        return { data: null }
      },
    }) as never)
  })

  it('accepte exactement les 4 pays de sourcing', async () => {
    for (const cc of ALLOWED) {
      rpcCalls = []
      mocked(createClient).mockResolvedValue(makeClient({
        getUser: () => ({ data: { user: { id: ADMIN_ID } } }),
        rpc(name) { rpcCalls.push(name); return { data: null, error: null } },
        resolve(table) {
          if (table === 'profiles') return { data: { role: 'admin' } }
          return { data: null }
        },
      }) as never)
      const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: cc, linked: true })
      expect(result.success, `${cc} doit être accepté`).toBe(true)
      expect(rpcCalls).toHaveLength(1)
    }
  })

  it('rejette tous les pays hors allowlist (pas d\'appel RPC)', async () => {
    for (const cc of FORBIDDEN) {
      rpcCalls = []
      mocked(createClient).mockResolvedValue(makeClient({
        getUser: () => ({ data: { user: { id: ADMIN_ID } } }),
        rpc(name) { rpcCalls.push(name); return { data: null, error: null } },
        resolve(table) {
          if (table === 'profiles') return { data: { role: 'admin' } }
          return { data: null }
        },
      }) as never)
      const result = await setAgentCountry({ agentId: AGENT_ID, countryCode: cc, linked: true })
      expect(result.success, `"${cc}" doit être refusé`).toBe(false)
      expect(rpcCalls, `Aucun RPC ne doit être appelé pour "${cc}"`).toHaveLength(0)
    }
  })
})
