-- =============================================================================
-- Migration 058 — LOT 2 : team_members + FSM assignation + durcissement RLS
-- =============================================================================
-- Périmètre : rôles/permissions équipe, assignation d'ordre agent, RLS durcie.
-- AUCUNE colonne financière touchée. Trigger compute_wholesale_order_costs (025)
-- et toute la logique ledger/commission sont INTANGIBLES.
-- =============================================================================

-- ── 1. Table team_members ─────────────────────────────────────────────────────
--
-- owner_id  : admin qui gère l'équipe.
-- member_id : profil du membre (role=agent typiquement, mais non contraint ici).
-- team_role : 'supervisor' ou 'member'.
-- permissions : JSONB de flags booléens ex. {"assign_orders":true,"view_buyer_pii":false}.
-- active    : soft-delete, on ne supprime pas les historiques d'assignation.

CREATE TABLE IF NOT EXISTS public.team_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_role   text        NOT NULL DEFAULT 'member'
                CHECK (team_role IN ('supervisor', 'member')),
  permissions jsonb       NOT NULL DEFAULT '{}',
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_members_owner_member_unique UNIQUE (owner_id, member_id)
);

-- Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS idx_team_members_owner_id    ON public.team_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member_id   ON public.team_members(member_id);
CREATE INDEX IF NOT EXISTS idx_team_members_active      ON public.team_members(member_id, active) WHERE active = true;

-- ── 2. RLS team_members ───────────────────────────────────────────────────────
--
-- Deny par défaut (aucune policy = aucun accès).
-- Admin (my_role='admin') : ALL sur ses propres lignes (owner_id = auth.uid()).
--   On utilise my_role()='admin' au lieu de owner_id=auth.uid() dans WITH CHECK
--   pour couvrir le cas où un super-admin gère l'équipe d'un autre admin.
--   Pour USING on filtre par owner_id pour limiter la visibilité au périmètre.
-- Membre : SELECT sur sa propre ligne uniquement (pour connaître ses permissions).

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_members_admin_all" ON public.team_members;
CREATE POLICY "team_members_admin_all"
  ON public.team_members
  FOR ALL
  TO authenticated
  USING  (public.my_role() = 'admin' AND owner_id = auth.uid())
  WITH CHECK (public.my_role() = 'admin' AND owner_id = auth.uid());

DROP POLICY IF EXISTS "team_members_member_read_own" ON public.team_members;
CREATE POLICY "team_members_member_read_own"
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (member_id = auth.uid() AND active = true);

-- ── 3. Helper can_assign_orders ───────────────────────────────────────────────
--
-- SECURITY DEFINER pour éviter la récursion RLS (la fonction lit team_members
-- sans passer par les policies de la session appelante).
-- Renvoie TRUE si l'uid est admin OU un membre actif avec assign_orders=true.

DROP FUNCTION IF EXISTS public.can_assign_orders(uuid);
CREATE OR REPLACE FUNCTION public.can_assign_orders(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = uid
      AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.member_id = uid
      AND tm.active = true
      AND (tm.permissions->>'assign_orders')::boolean IS TRUE
  );
$$;

-- ── 4. Durcissement RLS wholesale_order_status_history (findings I-1, I-2, M-2) ─
--
-- Remplace les policies agent trop larges de migration 057 :
-- - "agent_read_insert_status_history" (nom confus SELECT-only) → renommée
-- - "agent_insert_status_history" → liée à agent_id de la commande ou team_member
--
-- Un agent ne peut lire/insérer l'historique QUE pour les commandes dont il est
-- l'agent_id OU pour lesquelles il est membre actif d'équipe (owner = l'admin
-- de la commande n'est pas encore un concept : on restreint à agent_id direct
-- en attendant, plus conservateur).

-- Supprime les 3 policies agent de migration 057
DROP POLICY IF EXISTS "agent_read_insert_status_history" ON public.wholesale_order_status_history;
DROP POLICY IF EXISTS "agent_insert_status_history"      ON public.wholesale_order_status_history;
DROP POLICY IF EXISTS "agent_read_status_history"        ON public.wholesale_order_status_history;

-- Nouvelle policy SELECT agent : liée à la commande assignée
CREATE POLICY "agent_read_status_history"
  ON public.wholesale_order_status_history
  FOR SELECT
  TO authenticated
  USING (
    public.my_role() = 'agent'
    AND EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = order_id
        AND wo.agent_id = auth.uid()
    )
  );

-- Nouvelle policy INSERT agent : liée à la commande assignée
CREATE POLICY "agent_insert_status_history"
  ON public.wholesale_order_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.my_role() = 'agent'
    AND EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = order_id
        AND wo.agent_id = auth.uid()
    )
  );

-- ── 5. RLS wholesale_orders — membres équipe (conservateur) ──────────────────
--
-- Décision conservatrice : on ne modifie PAS la policy UPDATE existante car
-- elle est déjà liée à agent_id = auth.uid() (colonne renseignée par assignation).
-- La policy SELECT existante couvre déjà agent_id = auth.uid().
--
-- On ajoute une policy SELECT supplémentaire pour les membres team_members
-- ayant assign_orders=true, afin qu'ils voient la file pending à assigner.
-- ATTENTION : cette policy est volontairement scoped "pending" seulement — elle
-- ne donne PAS une lecture transverse aveugle sur toutes les commandes.
-- Un membre peut voir les commandes en attente d'assignation (status='pending')
-- pour choisir celle à prendre. Une fois assignée (agent_id=member_id), la
-- policy agent_id=auth.uid() de migration 001 prend le relais.
--
-- Si ce périmètre doit s'élargir (voir aussi les assigned), le signaler au LOT 3.

DROP POLICY IF EXISTS "wholesale_orders: team_member_assign_queue" ON public.wholesale_orders;
CREATE POLICY "wholesale_orders: team_member_assign_queue"
  ON public.wholesale_orders
  FOR SELECT
  TO authenticated
  USING (
    status = 'pending'
    AND public.can_assign_orders(auth.uid())
    -- Exclut admin (déjà couvert par policy my_role='admin' existante dans 001)
    AND public.my_role() != 'admin'
  );
