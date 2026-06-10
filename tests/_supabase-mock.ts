// Mock minimal et chaînable du client Supabase pour les tests unitaires.
// Reproduit le pattern builder : from(table).select().eq().single()/maybeSingle()
// et les terminaux awaités (insert/update/delete). `resolve(table, state)` décide
// la réponse selon la table et l'opération (op + head pour les requêtes count).

export type QBState = { op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'; head: boolean; payload?: unknown }
export type Resolver = (table: string, state: QBState) => { data?: unknown; error?: unknown; count?: number }

export function makeClient(opts: {
  getUser?: () => unknown
  rpc?: (name: string, args: unknown) => unknown
  resolve: Resolver
  onInsert?: (table: string, payload: unknown) => void
}) {
  return {
    auth: {
      getUser: async () => (opts.getUser ? opts.getUser() : { data: { user: null } }),
    },
    rpc: async (name: string, args: unknown) => (opts.rpc ? opts.rpc(name, args) : { data: null, error: null }),
    storage: {
      from() {
        return {
          upload: async () => ({ data: null, error: null }),
          getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/x' } }),
        }
      },
    },
    from(table: string) {
      const state: QBState = { op: 'select', head: false, payload: undefined }
      const run = () => Promise.resolve(opts.resolve(table, state))
      const qb: Record<string, unknown> = {
        select(_sel?: unknown, o?: { head?: boolean }) {
          if (state.op !== 'insert') state.op = 'select'
          if (o && o.head) state.head = true
          return qb
        },
        insert(p: unknown) { state.op = 'insert'; state.payload = p; opts.onInsert?.(table, p); return qb },
        update(p: unknown) { state.op = 'update'; state.payload = p; return qb },
        upsert(p: unknown) { state.op = 'upsert'; state.payload = p; return qb },
        delete() { state.op = 'delete'; return qb },
        eq() { return qb }, neq() { return qb }, ilike() { return qb }, like() { return qb },
        gte() { return qb }, lte() { return qb }, gt() { return qb }, lt() { return qb },
        in() { return qb }, order() { return qb }, limit() { return qb }, range() { return qb },
        single() { return run() },
        maybeSingle() { return run() },
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) { return run().then(onF, onR) },
      }
      return qb
    },
  }
}
