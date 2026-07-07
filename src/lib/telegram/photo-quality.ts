// ─── C2 — Contrôle qualité IA de la PHOTO à l'ingestion Telegram ─────────────
//
// La passe d'extraction Haiku VOIT déjà l'image (extract.ts). On lui demande, dans
// LE MÊME appel (zéro appel IA supplémentaire, zéro coût ajouté), un verdict de
// qualité de la photo. Ce module est PUR (normalisation + décision), testable sans
// réseau ni base.
//
// Périmètre : FLOU et NON-PRODUIT (photo inexploitable comme fiche). La détection
// de contenu INTERDIT reste au moteur de modération TEXTE existant
// (moderateSupplierProduct) — on ne la double pas ici.
//
// RÈGLE FAIL-OPEN : tout verdict absent, vide ou inattendu → 'ok'. Un hoquet du
// modèle ne doit JAMAIS bloquer un produit légitime (on préfère laisser passer +
// laisser l'admin trancher que rejeter à tort un vrai fournisseur).

export type PhotoIssue = 'ok' | 'blurry' | 'not_product'

/**
 * Normalise le verdict brut de l'IA en un `PhotoIssue` sûr.
 * Tolère quelques synonymes FR/EN. Toute autre valeur → 'ok' (fail-open).
 */
export function classifyPhotoIssue(raw: unknown): PhotoIssue {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (v === 'blurry' || v === 'blur' || v === 'flou') return 'blurry'
  if (
    v === 'not_product' ||
    v === 'not_a_product' ||
    v === 'non_produit' ||
    v === 'no_product'
  ) {
    return 'not_product'
  }
  return 'ok'
}

export interface PhotoIssueDecision {
  /** true → NE PAS créer la fiche (photo inexploitable), demander une nouvelle photo. */
  block: boolean
  /** Signal de modération à ajouter à la fiche quand on la crée quand même (flou). */
  signal: 'blurry_photo' | null
}

/**
 * Décision d'ingestion à partir du verdict qualité.
 *  - not_product → on bloque la création (ce n'est pas un produit) et on guide.
 *  - blurry      → on crée quand même (c'est un vrai produit, juste flou) MAIS on
 *                  flague pour l'admin (signal) et on invite à renvoyer une photo nette.
 *  - ok          → rien de spécial.
 */
export function photoIssueDecision(issue: PhotoIssue): PhotoIssueDecision {
  switch (issue) {
    case 'not_product':
      return { block: true, signal: null }
    case 'blurry':
      return { block: false, signal: 'blurry_photo' }
    case 'ok':
      return { block: false, signal: null }
    default:
      // Défensif : toute valeur non prévue (ex. données mal typées) → ne bloque pas.
      return { block: false, signal: null }
  }
}
