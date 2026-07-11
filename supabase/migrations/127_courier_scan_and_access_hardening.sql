-- =============================================================================
-- Migration 127 — Scan LIVRAISON + durcissement accès livreur (module Livreurs, Lot B)
-- =============================================================================
-- Réf : CLAUDE.md (grand livre 121-125 EN PROD, registre couriers mig 126 EN PROD),
-- @security P2-3 (access_code en clair ~40 bits sans TTL/rate-limit = insuffisant
-- pour un portail public /courier).
--
-- PÉRIMÈTRE — ADDITIF PUR, ZÉRO DOUBLON DU GRAND LIVRE :
--   • Durcissement `couriers.access_code` → hash SHA-256 + TTL + rate-limit
--     (`resolve_courier_by_access_code`, SECURITY DEFINER, service_role only).
--     La colonne `access_code` en clair (mig 126) est CONSERVÉE pour rétrocompat
--     (vidée par l'action de régénération, mig 127 ne la supprime PAS — données prod).
--   • `scan_events` (mig 100) étendu : CHECK scan_type += 'delivered_collected' /
--     'delivery_refused'. AUCUNE autre colonne/contrainte touchée.
--   • `record_delivery_scan` (SECURITY DEFINER) : le scan livraison ne fait QUE
--     changer `orders.status` (delivered / returned). Les triggers `handle_order_delivered`
--     / `handle_order_status_reversal` (mig 122, EN PROD) postent le grand livre
--     + créent/contre-passent la commission — CE RPC N'ÉCRIT JAMAIS ledger_transactions
--     ni commissions directement (zéro doublon).
--   • `v_courier_scan_queue` : vue non sensible (aucun coût/marge/PII) pour le
--     portail livreur (Lot C), security_invoker + rempart admin/service_role.
--
-- Idempotente : CREATE ... IF NOT EXISTS, DROP POLICY/FUNCTION/CONSTRAINT IF EXISTS.
-- LOCAL UNIQUEMENT — appliquée ici via `supabase db push` sur 127.0.0.1. Le user
-- applique en prod séparément après GO.
-- =============================================================================

-- ── 1. Durcissement accès livreur (@security P2-3) ───────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS access_code_hash       text,
  ADD COLUMN IF NOT EXISTS access_code_expires_at timestamptz;

-- UNIQUE (partiel, ignore NULL) : un hash ne doit résoudre qu'UN SEUL livreur
-- (calque UNIQUE(access_code) mig 126). Empêche toute collision de faire
-- résoudre le code d'un livreur vers un autre (probabilité négligeable ~128
-- bits, mais l'invariant doit être garanti en base, pas seulement espéré).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_couriers_access_code_hash
  ON public.couriers (access_code_hash) WHERE access_code_hash IS NOT NULL;

COMMENT ON COLUMN public.couriers.access_code_hash IS
  'Hash SHA-256 (hex) du code d''accès portail /courier (mig 127). Remplace la comparaison en '
  'clair de access_code (mig 126, @security P2-3). Résolu UNIQUEMENT via '
  'resolve_courier_by_access_code() SECURITY DEFINER, jamais lu/comparé côté client.';
COMMENT ON COLUMN public.couriers.access_code_expires_at IS
  'TTL du lien portail /courier (mig 127). NULL = pas d''expiration (rétrocompat codes existants '
  'tant qu''ils n''ont pas été régénérés). Régénéré = 30 jours par défaut (regenerateCourierAccessCode).';

-- Table de rate-limit (append-only, staff admin-only en lecture).
CREATE TABLE IF NOT EXISTS public.courier_access_attempts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Jamais le code entier : seulement un préfixe (traçabilité sans compromettre le secret).
  code_prefix  text,
  ip           text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_access_attempts_attempted_at
  ON public.courier_access_attempts (attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_courier_access_attempts_ip
  ON public.courier_access_attempts (ip, attempted_at DESC);

COMMENT ON TABLE public.courier_access_attempts IS
  'Rate-limit portail livreur (mig 127, @security P2-3). Une ligne par tentative de résolution '
  'de access_code (échec ou succès). code_prefix = left(code,4) UNIQUEMENT (jamais le code entier). '
  'Écriture via resolve_courier_by_access_code() SECURITY DEFINER seulement. RLS deny total '
  '(pas même le staff en SELECT via REST — lecture admin réservée à un futur outil interne, '
  'hors périmètre ici) : append-only, aucune policy créée = deny.';

ALTER TABLE public.courier_access_attempts ENABLE ROW LEVEL SECURITY;
-- Aucune policy → deny total en lecture ET écriture via REST (écriture uniquement via
-- la fonction SECURITY DEFINER ci-dessous, qui contourne la RLS par définition).

CREATE OR REPLACE FUNCTION public.resolve_courier_by_access_code(
  p_code text,
  p_ip   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
-- `digest()` (pgcrypto) vit dans le schéma `extensions` sous Supabase (pas `public`,
-- vérifié : pg_extension.extnamespace='extensions' en local) → search_path étendu
-- UNIQUEMENT ici, pour ce hash. Ordre public AVANT extensions : aucune fonction/
-- table utilisateur de `extensions` ne peut donc primer sur le schéma applicatif.
SET search_path = public, extensions
AS $$
DECLARE
  v_attempts   integer;
  v_prefix     text;
  v_hash       text;
  v_courier_id uuid;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  v_hash := encode(digest(p_code, 'sha256'), 'hex');

  -- Résolution D'ABORD. Un code VALIDE ne consomme aucun quota et n'est JAMAIS
  -- loggé/rate-limité (@security P2-C : un livreur qui scanne vite ne s'auto-bloque
  -- plus ; l'anti-bruteforce ne vise que les ÉCHECS).
  SELECT id INTO v_courier_id
  FROM public.couriers
  WHERE access_code_hash = v_hash
    AND status = 'active'
    AND (access_code_expires_at IS NULL OR access_code_expires_at > now())
  LIMIT 1;

  IF v_courier_id IS NOT NULL THEN
    RETURN v_courier_id;
  END IF;

  -- ÉCHEC uniquement : rate-limit + log. Par IP si connue, sinon par préfixe de code
  -- (@security P2-A : le seuil s'applique même quand l'IP est absente/non fiable).
  v_prefix := left(p_code, 4);
  IF p_ip IS NOT NULL THEN
    SELECT count(*) INTO v_attempts
    FROM public.courier_access_attempts
    WHERE ip = p_ip AND attempted_at > now() - interval '60 seconds';
  ELSE
    SELECT count(*) INTO v_attempts
    FROM public.courier_access_attempts
    WHERE code_prefix = v_prefix AND attempted_at > now() - interval '60 seconds';
  END IF;
  IF v_attempts > 10 THEN
    RAISE EXCEPTION 'trop de tentatives';
  END IF;

  INSERT INTO public.courier_access_attempts (code_prefix, ip) VALUES (v_prefix, p_ip);

  RETURN NULL;  -- non trouvé/expiré/inactif — jamais de détail sur la cause.
END;
$$;

COMMENT ON FUNCTION public.resolve_courier_by_access_code(text, text) IS
  'Résout un livreur depuis son code d''accès portail (mig 127, @security P2-3). Rate-limit '
  '(>10 tentatives/IP/60s → RAISE). Ne loggue jamais le code entier (code_prefix = left(code,4)). '
  'REVOKE public/anon/authenticated — appelée UNIQUEMENT via service_role (server action).';

REVOKE ALL ON FUNCTION public.resolve_courier_by_access_code(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_courier_by_access_code(text, text) TO service_role;

-- ── 2. Extension scan_events pour la livraison (mig 100, additif) ────────────

ALTER TABLE public.scan_events DROP CONSTRAINT IF EXISTS scan_events_scan_type_check;
ALTER TABLE public.scan_events
  ADD CONSTRAINT scan_events_scan_type_check
  CHECK (scan_type IN ('inbound_reception', 'return_received', 'delivered_collected', 'delivery_refused'));

-- ── 3. RPC de scan livraison ──────────────────────────────────────────────────
-- NE POSTE JAMAIS le grand livre / les commissions directement : ne fait QUE
-- changer orders.status. Les triggers handle_order_delivered / handle_order_
-- status_reversal (mig 122, EN PROD, INCHANGÉS) postent ledger2_post_cod_collected
-- / ledger2_post_cod_reversal + gèrent la commission. Idempotent des deux côtés :
-- le WHERE status NOT IN(...) rend le second scan un no-op sur orders, et
-- l'idempotency_key du ledger (mig 122) empêche tout double-poste même en cas
-- de rescan après un changement de statut intermédiaire.

CREATE OR REPLACE FUNCTION public.record_delivery_scan(
  p_order_id     uuid,
  p_courier_id   uuid,
  p_outcome      text,
  p_tracking_ref text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o           public.orders%ROWTYPE;
  v_courier   public.couriers%ROWTYPE;
  v_new_status text;
BEGIN
  IF p_outcome NOT IN ('delivered_collected', 'delivery_refused') THEN
    RAISE EXCEPTION 'errors.invalid_outcome';
  END IF;

  SELECT * INTO v_courier FROM public.couriers WHERE id = p_courier_id;
  IF v_courier.id IS NULL OR v_courier.status <> 'active' THEN
    RAISE EXCEPTION 'errors.courier_not_active';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;
  -- Périmètre COD affilié : `orders` (table distincte de `wholesale_orders`) sert
  -- exclusivement les commandes affiliation COD (cf. 001/009) → toute ligne trouvée
  -- ici est déjà dans le bon périmètre. Garde explicite conservée pour lisibilité/futur.
  IF o.affiliate_id IS NULL THEN
    RAISE EXCEPTION 'errors.not_affiliate_order';
  END IF;

  IF p_outcome = 'delivered_collected' THEN
    UPDATE public.orders
       SET status = 'delivered',
           delivered_at = COALESCE(delivered_at, now()),
           courier_id = COALESCE(courier_id, p_courier_id)
     WHERE id = p_order_id
       AND status NOT IN ('delivered', 'returned', 'cancelled')
       -- @finance P1 : cloisonnement RPC aligné sur la file — un livreur ne peut
       -- transitionner QUE ses commandes ou celles non assignées (jamais celles
       -- d'un autre livreur → pas de pollution du grand livre hors périmètre).
       AND (courier_id = p_courier_id OR courier_id IS NULL)
    RETURNING status INTO v_new_status;

    INSERT INTO public.scan_events (
      scan_type, order_id, order_type, carrier_tracking_ref, scanned_qty, actor_id
    ) VALUES (
      'delivered_collected', p_order_id, 'affiliate',
      COALESCE(p_tracking_ref, p_order_id::text), 1, NULL
    )
    ON CONFLICT (scan_type, carrier_tracking_ref, order_id) DO NOTHING;

  ELSE -- delivery_refused
    UPDATE public.orders
       SET status = 'returned'
     WHERE id = p_order_id
       AND status NOT IN ('returned', 'cancelled')
       -- @finance P1 : même cloisonnement de scope livreur que la branche livrée.
       AND (courier_id = p_courier_id OR courier_id IS NULL)
    RETURNING status INTO v_new_status;

    INSERT INTO public.scan_events (
      scan_type, order_id, order_type, carrier_tracking_ref, scanned_qty, actor_id
    ) VALUES (
      'delivery_refused', p_order_id, 'affiliate',
      COALESCE(p_tracking_ref, p_order_id::text), 1, NULL
    )
    ON CONFLICT (scan_type, carrier_tracking_ref, order_id) DO NOTHING;
  END IF;

  -- Rescan (statut déjà dans l'état cible) : v_new_status reste NULL (RETURNING
  -- sans ligne affectée) → on relit le statut courant pour un retour cohérent.
  IF v_new_status IS NULL THEN
    SELECT status INTO v_new_status FROM public.orders WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'outcome', p_outcome,
    'new_status', v_new_status
  );
END;
$$;

COMMENT ON FUNCTION public.record_delivery_scan(uuid, uuid, text, text) IS
  'Scan livraison (mig 127, module Livreurs Lot B). Change UNIQUEMENT orders.status '
  '(delivered/returned) + trace scan_events. Le grand livre (cod_collected/reversal) et la '
  'commission sont postés par les triggers handle_order_delivered/handle_order_status_reversal '
  '(mig 122, EN PROD, INCHANGÉS) — zéro doublon d''écriture financière. Idempotent (WHERE status '
  'NOT IN(...) + idempotency_key ledger + ON CONFLICT scan_events). REVOKE public/anon/authenticated '
  '— appelée UNIQUEMENT via service_role (server action, après résolution du livreur par code).';

REVOKE ALL ON FUNCTION public.record_delivery_scan(uuid, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_delivery_scan(uuid, uuid, text, text) TO service_role;

-- ── 4. Vue v_courier_scan_queue — commandes à scanner (non sensible) ─────────
-- Colonnes STRICTEMENT non sensibles : aucun coût/marge (order_financial_snapshots
-- reste staff-only, mig 122), aucune PII client (pas de nom/tél/adresse — seule la
-- ville, déjà exposée dans v_courier_balances/getCourierDetail existants).
-- Statuts orders réels (mig 009, EN PROD) : pending_confirmation, confirmed,
-- shipped, delivered, returned, cancelled. "À scanner" = en cours de livraison
-- (confirmed/shipped) — qu'elles soient déjà assignées à CE livreur ou pas encore
-- assignées (courier_id IS NULL, à prendre en charge). Une fois delivered/returned/
-- cancelled, la commande sort de la file (déjà scannée ou hors périmètre scan).
CREATE OR REPLACE VIEW public.v_courier_scan_queue
WITH (security_invoker = true) AS
SELECT
  o.id            AS order_id,
  o.id::text      AS reference,
  o.customer_city,
  o.total_amount,
  o.status,
  o.courier_id
FROM public.orders o
WHERE o.status IN ('confirmed', 'shipped')
  AND o.affiliate_id IS NOT NULL
  -- Le scope PAR livreur (assigné à lui OU non assigné) est appliqué côté server
  -- action (getCourierScanQueue), après résolution du livreur par code : la vue
  -- expose la file globale non sensible, filtrée en amont par service_role.
  -- Rempart staff/service_role (défense en profondeur, calque mig 125/126) :
  -- le portail livreur (Lot C) lira cette vue via service_role APRÈS résolution
  -- du livreur par code — jamais directement par un client anon/authenticated.
  AND (public.my_role() = 'admin' OR auth.role() = 'service_role');

COMMENT ON VIEW public.v_courier_scan_queue IS
  'File des commandes à scanner à la livraison (mig 127, module Livreurs Lot B). Colonnes NON '
  'sensibles uniquement (order_id, reference, customer_city, total_amount, status, courier_id) — '
  'JAMAIS coût/marge/PII (nom/tél/adresse). security_invoker=true + rempart admin/service_role : '
  'le portail /courier (Lot C) filtre côté server action par courier_id après résolution du code.';
