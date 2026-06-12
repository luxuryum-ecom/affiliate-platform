// Définition des rôles testés par le smoke + leurs routes principales.
// Les identifiants viennent de .env.local (non commité). Un rôle sans creds est « skip ».
import { resolve } from 'node:path'
import { loadEnvLocal } from './env'

loadEnvLocal()

export type Role = {
  key: string
  envPrefix: string
  email?: string
  password?: string
  hasCreds: boolean
  storageState: string
  routes: string[]
}

function makeRole(key: string, envPrefix: string, routes: string[]): Role {
  const email = process.env[`${envPrefix}_EMAIL`]
  const password = process.env[`${envPrefix}_PASSWORD`]
  return {
    key,
    envPrefix,
    email,
    password,
    hasCreds: Boolean(email && password),
    storageState: resolve(process.cwd(), 'e2e/.auth', `${key}.json`),
    routes,
  }
}

// Routes publiques — aucune authentification requise.
export const PUBLIC_ROUTES = ['/', '/login', '/signup']

export const ROLES: Role[] = [
  makeRole('affiliate', 'SMOKE_AFFILIATE', [
    '/affiliate/dashboard',
    '/affiliate/products',
    '/affiliate/commissions',
    '/affiliate/orders',
  ]),
  makeRole('wholesale', 'SMOKE_WHOLESALE', [
    '/wholesale/dashboard',
    '/wholesale/marketplace',
    '/wholesale/cart',
    '/wholesale/orders',
  ]),
  makeRole('supplier', 'SMOKE_SUPPLIER', [
    '/supplier/dashboard',
    '/supplier/products',
  ]),
  makeRole('admin', 'SMOKE_ADMIN', [
    '/admin/dashboard',
  ]),
]

export const ROLES_WITH_CREDS = ROLES.filter((r) => r.hasCreds)
