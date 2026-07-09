import type { MetadataRoute } from 'next'

// PWA (AM-10) — manifeste servi par Next 15 sur /manifest.webmanifest.
// Next injecte automatiquement <link rel="manifest"> dans le <head>.
// Nom produit visible = « Abdou Baba » (Mozouna Group = entité légale, cf. footer).
// Couleurs 🔒 identité Noir + Or : theme/background = encre profonde.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Abdou Baba — COD & Sourcing Maroc',
    short_name: 'Abdou Baba',
    description: 'COD, gros et sourcing pour le Maroc et le MENA — Mozouna Group.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b0c',
    theme_color: '#0a0a0a',
    lang: 'fr',
    dir: 'auto',
    categories: ['business', 'shopping'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
