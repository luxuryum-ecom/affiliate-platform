-- =============================================================================
-- Migration: 113_telegram_conversation_state (idempotent — safe to re-run)
-- BRIQUE 3 — État conversationnel du bot fournisseur.
--
-- Quand un produit reçu par Telegram arrive INCOMPLET (prix manquant, ou prix
-- présent sans paliers), le bot pose UNE question et mémorise ici « ce fournisseur
-- a un produit en attente de telle info ; sa prochaine réponse texte = cette info ».
--
-- Sécurité : RLS deny-par-défaut (aucune policy) → accessible UNIQUEMENT via
-- service_role (worker bot, côté serveur), comme telegram_inbound (mig 053).
-- Scopé par supplier_id → impossible de compléter le produit d'un autre.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_pending_products (
  -- 1 ligne d'attente par produit (le produit existe déjà en pending_review).
  supplier_product_id uuid        PRIMARY KEY REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  supplier_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Chat Telegram où poser la question / envoyer la relance (= user id en DM).
  telegram_chat_id    bigint      NOT NULL,
  -- Snapshot de la langue du fournisseur (language_code Telegram) pour la relance
  -- asynchrone (cron) : le message d'origine n'est plus disponible à ce moment-là.
  telegram_lang       text,
  -- Ce que le bot attend : 'price' (prix unitaire) ou 'tiers' (paliers de gros).
  awaiting            text        NOT NULL CHECK (awaiting IN ('price', 'tiers')),
  -- Quand la question courante a été posée (base du TTL de relance ~1h).
  asked_at            timestamptz NOT NULL DEFAULT now(),
  -- Horodate la relance UNIQUE (one-shot anti-spam). NULL = pas encore relancé.
  reminded_at         timestamptz,
  -- Compteur de « réponse inexploitable → redemander » (borné à 1 redemande).
  reask_count         smallint    NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- « Produit en attente le plus récent pour ce fournisseur » (rattachement réponse).
CREATE INDEX IF NOT EXISTS idx_tpp_supplier_recent
  ON public.telegram_pending_products(supplier_id, created_at DESC);

-- Scan des relances dues (cron) : attente non encore relancée, question ancienne.
CREATE INDEX IF NOT EXISTS idx_tpp_reminder_due
  ON public.telegram_pending_products(asked_at)
  WHERE reminded_at IS NULL;

-- RLS deny-par-défaut : aucune policy → seul service_role écrit/lit (worker bot).
ALTER TABLE public.telegram_pending_products ENABLE ROW LEVEL SECURITY;
