-- =============================================================================
-- Migration 049 — Paiement (payout) atomique & idempotent
-- (idempotent — safe to re-run)
-- =============================================================================
-- But :
--   Fournir une RPC unique `public.create_payout(...)` qui solde EN UNE SEULE
--   TRANSACTION toutes les commissions 'approved' (non reversées) d'un affilié :
--     1. crée le payout (montant DÉRIVÉ de la somme, jamais saisi),
--     2. marque les commissions concernées 'paid',
--     3. écrit une entrée ledger 'payout' NÉGATIVE par commission soldée.
--
--   Propriétés financières garanties :
--
--   (a) ATOMICITÉ — Tout le corps de la fonction s'exécute dans la transaction
--       implicite de l'appel : insert payout + update commissions + insert ledger
--       réussissent ENSEMBLE, ou rollback intégral en cas d'erreur. Aucun état
--       partiel possible (jamais un payout sans commissions soldées, ni l'inverse).
--
--   (b) IDEMPOTENCE — Double protection contre le double-versement :
--       - `idempotency_key` UNIQUE sur payouts : un rejeu avec la même clé
--         RETOURNE le payout existant sans rien recréer (garde en tête de fonction).
--       - Verrou `FOR UPDATE` sur les commissions payables : sérialise les appels
--         concurrents (double-clic / 2 requêtes simultanées). Le 2e appelant
--         attend, puis voit les commissions déjà 'paid' → plus rien à payer.
--       - Ledger : clé `payout:<commission_id>` + ON CONFLICT DO NOTHING →
--         une commission ne génère qu'UNE écriture payout, jamais deux.
--
--   (c) MONTANT DÉRIVÉ — Le montant du payout est TOUJOURS SUM(commissions),
--       jamais un paramètre d'entrée. Impossible de surpayer par saisie erronée.
--
--   Argent : numeric. AUCUN float.
--
--   AUTORISATION — Double barrière : (1) la server action vérifie requireAdmin,
--   (2) la RPC elle-même refuse tout appelant dont my_role() <> 'admin'
--   (défense en profondeur, même si la RPC est appelée directement via l'API).
--
--   NOTE conformité : la rigueur technique (atomicité, idempotence, ledger) est
--   couverte ici. La conformité légale/fiscale (KYC, AML, licences de paiement)
--   relève d'un professionnel et N'EST PAS traitée par cette migration.
-- =============================================================================

-- ── 1. Colonne d'idempotence sur payouts ────────────────────────────────────
-- Index UNIQUE PARTIEL : autorise les anciens payouts (clé NULL) à coexister,
-- tout en garantissant l'unicité dès qu'une clé est fournie.

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_idempotency_key
  ON public.payouts (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 2. RPC create_payout — atomique + idempotente ───────────────────────────

CREATE OR REPLACE FUNCTION public.create_payout(
  p_affiliate_id    uuid,
  p_idempotency_key text,
  p_reference       text DEFAULT NULL,
  p_notes           text DEFAULT NULL
)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.payouts;
  v_payout   public.payouts;
  v_total    numeric(12,2);
  v_ids      uuid[];
BEGIN
  -- 0. Garde AUTORISATION (défense en profondeur) : même si la RPC est appelée
  --    directement avec un JWT non-admin, seul un admin peut créer un versement.
  --    my_role() lit le rôle via auth.uid() = le JWT de l'appelant.
  IF public.my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Non autorisé : seul un administrateur peut créer un paiement'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 0bis. Garde CLÉ D'IDEMPOTENCE : doit être non vide, sinon la protection
  --       anti-double-versement par clé serait inopérante.
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Clé d''idempotence requise pour créer un paiement';
  END IF;

  -- 1. Garde idempotence (rejeu) : si un payout existe déjà avec cette clé,
  --    le retourner tel quel et sortir. Aucun effet de bord.
  SELECT * INTO v_existing
    FROM public.payouts
   WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- 2. Verrou anti-concurrence : sélectionner ET verrouiller les commissions
  --    payables. FOR UPDATE sérialise les appels concurrents — le 2e appel
  --    attend la fin du 1er, puis voit ces lignes déjà 'paid' (donc hors filtre)
  --    → v_total = 0, v_ids = NULL → garde montant (étape 3) le bloque.
  -- FOR UPDATE n'est pas autorisé avec les agrégats : on verrouille les lignes
  -- dans la sous-requête (sur la table de base), puis on agrège à l'extérieur.
  SELECT COALESCE(SUM(locked.amount), 0), array_agg(locked.id)
    INTO v_total, v_ids
    FROM (
      SELECT id, amount
        FROM public.commissions
       WHERE affiliate_id = p_affiliate_id
         AND status = 'approved'
         AND reversed = false
         FOR UPDATE
    ) AS locked;

  -- 3. Garde montant : rien à payer → on lève une exception (rollback).
  IF v_ids IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'Aucune commission approuvée à payer pour cet affilié';
  END IF;

  -- 4. Insérer le payout avec le montant DÉRIVÉ (somme), jamais saisi.
  INSERT INTO public.payouts (
    affiliate_id, amount, status, reference, notes, paid_at, idempotency_key
  )
  VALUES (
    p_affiliate_id, v_total, 'paid', p_reference, p_notes, now(), p_idempotency_key
  )
  RETURNING * INTO v_payout;

  -- 5. Marquer les commissions soldées 'paid'.
  UPDATE public.commissions
     SET status  = 'paid',
         paid_at = now()
   WHERE id = ANY(v_ids);

  -- 6. Écriture ledger append-only : UNE entrée 'payout' NÉGATIVE par commission
  --    soldée. Clé `payout:<commission_id>` → idempotence par commission.
  INSERT INTO public.ledger_entries (
    affiliate_id, entry_type, amount, commission_id, payout_id, idempotency_key, metadata
  )
  SELECT c.affiliate_id, 'payout', -c.amount, c.id, v_payout.id,
         'payout:' || c.id::text,
         jsonb_build_object('payout_id', v_payout.id)
    FROM public.commissions c
   WHERE c.id = ANY(v_ids)
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- 7. Retourner le payout créé.
  RETURN v_payout;
END;
$$;

COMMENT ON FUNCTION public.create_payout(uuid, text, text, text) IS
  'Solde atomiquement les commissions approuvées d''un affilié : crée le payout '
  '(montant DÉRIVÉ = SUM, jamais saisi), passe les commissions ''paid'', écrit le '
  'ledger négatif. Idempotent via idempotency_key UNIQUE + FOR UPDATE + ledger '
  'ON CONFLICT. L''autorisation admin (requireAdmin) est faite côté server action.';

-- ── 3. Permissions d'exécution ──────────────────────────────────────────────
-- La RPC est appelée par la server action en tant qu'utilisateur authentifié.
-- La vérification du rôle admin reste côté serveur (requireAdmin), pas ici.

GRANT EXECUTE ON FUNCTION public.create_payout(uuid, text, text, text) TO authenticated;
