// ─── B8 / RGPD — Anonymisation d'un profil (PURE, testable) ──────────────────
//
// Renvoie l'ensemble EXACT des champs à écrire sur `profiles` pour anonymiser un
// compte : toute la PII est vidée (null) sauf `full_name` (NOT NULL) qui reçoit
// un libellé neutre. Le statut passe à 'deleted' et l'horodatage RGPD est posé.
//
// Isolé ici pour être testé sans base ni auth, et pour garantir qu'AUCUN champ
// personnel n'est oublié (le test verrouille la liste). N'inclut PAS l'email :
// l'email vit dans auth.users, anonymisé côté auth (admin API) par la server action.

/** Libellé neutre affiché à la place du nom (colonne NOT NULL). */
export const DELETED_PROFILE_NAME = 'Compte supprimé'

export interface AnonymizedProfileFields {
  full_name: string
  phone: null
  company_name: null
  ice: null
  registre_commerce: null
  billing_address: null
  city: null
  declared_niche: null
  status: 'deleted'
  anonymized_at: string
}

/**
 * Champs d'anonymisation à appliquer sur `profiles`.
 * @param nowIso  Horodatage ISO de l'anonymisation (injecté → testable).
 */
export function anonymizedProfileFields(nowIso: string): AnonymizedProfileFields {
  return {
    full_name: DELETED_PROFILE_NAME,
    phone: null,
    company_name: null,
    ice: null,
    registre_commerce: null,
    billing_address: null,
    city: null,
    declared_niche: null,
    status: 'deleted',
    anonymized_at: nowIso,
  }
}
