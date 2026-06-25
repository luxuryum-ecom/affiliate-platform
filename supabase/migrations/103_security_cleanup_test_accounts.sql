-- Migration 103 — Nettoyage sécurité : abonnement Enterprise test (#5) + neutralisation comptes test
-- Politique : ban + rejected + retrait permissions actives — JAMAIS DELETE auth.users
-- (registres append-only : staff_permission_audit, agent_country_audit, wholesale_delivery_ledger…)
-- Risque : MEDIUM — neutralisation réversible en théorie (banned_until NULL + status approved).

-- ── Step 1 / #5 : retirer abonnement Enterprise test ─────────────────────────

DELETE FROM public.subscription_audit_log
WHERE id = '18b6a686-5d7d-4427-8ab4-3af45161719d';

DELETE FROM public.supplier_subscriptions
WHERE id = '88fcfe24-63f0-4352-a37b-679c1e684c5f';

-- ── Step 2 / neutraliser agent-demo@affipartner.ma (cebd5f07…) ───────────────

UPDATE auth.users
SET banned_until = '2099-12-31T23:59:59+00'
WHERE email = 'agent-demo@affipartner.ma';

UPDATE public.profiles
SET status = 'rejected'
WHERE id = 'cebd5f07-55a7-44ee-9638-43348d4de75c';

DELETE FROM public.staff_permissions
WHERE user_id = 'cebd5f07-55a7-44ee-9638-43348d4de75c';

DELETE FROM public.agent_countries
WHERE agent_id = 'cebd5f07-55a7-44ee-9638-43348d4de75c';

-- ── Step 3 / neutraliser supplier-morocco-03@affipartner.ma (cec673db…) ──────

UPDATE auth.users
SET banned_until = '2099-12-31T23:59:59+00'
WHERE email = 'supplier-morocco-03@affipartner.ma';

UPDATE public.profiles
SET status = 'rejected'
WHERE id = 'cec673db-e148-4247-9b08-06839d975142';

DELETE FROM public.telegram_supplier_links
WHERE supplier_id = 'cec673db-e148-4247-9b08-06839d975142';

UPDATE public.supplier_products
SET archived_at = now()
WHERE supplier_id = 'cec673db-e148-4247-9b08-06839d975142'
  AND archived_at IS NULL;

-- admin@affipartner.ma : CONSERVÉ — rotation MDP séparée (#3).
