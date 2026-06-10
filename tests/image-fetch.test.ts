import { describe, it, expect } from 'vitest'
import { isPrivateIpv4, isPrivateOrReservedIp, validateImageUrl } from '@/lib/image-fetch'

describe('isPrivateIpv4', () => {
  it('détecte les IPv4 privées/réservées', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255']) {
      expect(isPrivateIpv4(ip), ip).toBe(true)
    }
  })
  it('laisse passer les IPv4 publiques', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '11.0.0.1']) {
      expect(isPrivateIpv4(ip), ip).toBe(false)
    }
  })
})

describe('isPrivateOrReservedIp (IPv6 + mapped)', () => {
  it('détecte loopback / ULA / link-local / IPv4-mapped', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true)
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true)
    expect(isPrivateOrReservedIp('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true)
  })
  it('laisse passer les IPv6 publiques', () => {
    expect(isPrivateOrReservedIp('2001:4860:4860::8888')).toBe(false)
  })
})

describe('validateImageUrl (anti-SSRF, pur)', () => {
  const allow = ['cdn.exemple.com']
  it('rejette non-https / data / userinfo / port', () => {
    expect(validateImageUrl('http://cdn.exemple.com/a.jpg', allow)).toMatchObject({ ok: false, reason: 'not_https' })
    expect(validateImageUrl('data:image/png;base64,AAAA', allow)).toMatchObject({ ok: false, reason: 'not_https' })
    expect(validateImageUrl('https://user:pass@cdn.exemple.com/a', allow)).toMatchObject({ ok: false, reason: 'userinfo_forbidden' })
    expect(validateImageUrl('https://cdn.exemple.com:8080/a', allow)).toMatchObject({ ok: false, reason: 'bad_port' })
  })
  it('rejette localhost et IP privées/metadata', () => {
    expect(validateImageUrl('https://localhost/a', allow)).toMatchObject({ ok: false, reason: 'localhost' })
    expect(validateImageUrl('https://169.254.169.254/latest/meta-data/', allow)).toMatchObject({ ok: false, reason: 'private_ip' })
    expect(validateImageUrl('https://10.0.0.5/a', allow)).toMatchObject({ ok: false, reason: 'private_ip' })
    expect(validateImageUrl('https://127.0.0.1/a', allow)).toMatchObject({ ok: false, reason: 'private_ip' })
  })
  it('applique l\'allowlist (vide = rien, hors-liste = rejet, sous-domaine ok)', () => {
    expect(validateImageUrl('https://cdn.exemple.com/a.jpg', [])).toMatchObject({ ok: false, reason: 'no_allowlist' })
    expect(validateImageUrl('https://evil.com/a.jpg', allow)).toMatchObject({ ok: false, reason: 'host_not_allowed' })
    expect(validateImageUrl('https://cdn.exemple.com/a.jpg', allow)).toMatchObject({ ok: true })
    expect(validateImageUrl('https://img.cdn.exemple.com/a.jpg', allow)).toMatchObject({ ok: true })
  })
  it('rejette une URL malformée', () => {
    expect(validateImageUrl('pas une url', allow)).toMatchObject({ ok: false, reason: 'invalid_url' })
  })
})
