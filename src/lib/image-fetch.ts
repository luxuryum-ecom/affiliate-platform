// ─── Fetch d'image depuis une URL tierce (CSV) — anti-SSRF + validation ──────
// Cadrage @security A3/B5. https only, allowlist domaines, rejet IP privées/
// loopback/link-local/metadata cloud, pas de redirection, timeout, taille bornée,
// magic bytes. La validation d'URL est PURE (testable) ; le fetch est l'I/O.

import { lookup } from 'node:dns/promises'
import { validateImage } from '@/lib/image-validate'
import type { ImageMediaType, ImageExt } from '@/lib/image-validate'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 5000

// ── Détection IP privée / réservée (anti-SSRF) ───────────────────────────────

export function isPrivateIpv4(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const a = Number(m[1]), b = Number(m[2])
  if (a > 255 || b > 255) return true // malformé → rejet prudent
  if (a === 0 || a === 10 || a === 127) return true // any/private/loopback
  if (a === 169 && b === 254) return true // link-local + metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 192 && b === 0) return true // 192.0.0.0/24 (IETF)
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast + réservé + broadcast
  return false
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '')
  if (s === '::1' || s === '::') return true // loopback / unspecified
  if (s.startsWith('fc') || s.startsWith('fd')) return true // ULA fc00::/7
  if (s.startsWith('fe80') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true // link-local fe80::/10
  const mapped = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped
  if (mapped) return isPrivateIpv4(mapped[1])
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return isPrivateIpv4(s)
  return false
}

// ── Validation d'URL (PURE) ──────────────────────────────────────────────────

export type UrlValidation = { ok: true; url: URL } | { ok: false; reason: string }

export function validateImageUrl(rawUrl: string, allowedHosts: string[]): UrlValidation {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not_https' }
  if (u.username || u.password) return { ok: false, reason: 'userinfo_forbidden' }
  if (u.port && u.port !== '443') return { ok: false, reason: 'bad_port' }

  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return { ok: false, reason: 'localhost' }
  // IP littérale → doit être publique
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (isPrivateOrReservedIp(host)) return { ok: false, reason: 'private_ip' }
  }
  // Allowlist obligatoire (liste vide → aucun host externe accepté, sécurisé par défaut)
  if (allowedHosts.length === 0) return { ok: false, reason: 'no_allowlist' }
  const allowed = allowedHosts.some((h) => host === h || host.endsWith(`.${h}`))
  if (!allowed) return { ok: false, reason: 'host_not_allowed' }

  return { ok: true, url: u }
}

// ── Fetch + re-validation (I/O) ──────────────────────────────────────────────

export type FetchedImage =
  | { ok: true; bytes: Uint8Array; mediaType: ImageMediaType; ext: ImageExt }
  | { ok: false; reason: string }

export async function fetchImageFromUrl(
  rawUrl: string,
  opts: { allowedHosts: string[]; maxBytes?: number; timeoutMs?: number },
): Promise<FetchedImage> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const v = validateImageUrl(rawUrl, opts.allowedHosts)
  if (!v.ok) return { ok: false, reason: v.reason }

  // Anti-SSRF : l'hôte ne doit résoudre que vers des IP publiques.
  let addrs: { address: string }[]
  try {
    addrs = await lookup(v.url.hostname, { all: true })
  } catch {
    return { ok: false, reason: 'dns_failed' }
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateOrReservedIp(a.address))) {
    return { ok: false, reason: 'resolves_private' }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(v.url, { redirect: 'error', signal: ctrl.signal })
    if (!res.ok) return { ok: false, reason: `http_${res.status}` }
    const declared = res.headers.get('content-length')
    if (declared && Number(declared) > maxBytes) return { ok: false, reason: 'too_large' }
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > maxBytes) return { ok: false, reason: 'too_large' }
    const img = validateImage(buf, { maxBytes })
    if (!img.ok) return { ok: false, reason: img.reason }
    return { ok: true, bytes: buf, mediaType: img.mediaType, ext: img.ext }
  } catch {
    return { ok: false, reason: 'fetch_failed' }
  } finally {
    clearTimeout(timer)
  }
}
