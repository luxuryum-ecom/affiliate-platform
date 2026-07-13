-- =============================================================================
-- Migration 133 — DETTE RÉVÉLÉE : GRANTs de base hors migrations
-- =============================================================================
-- ⚠️ NON APPLIQUÉE EN PROD par l'agent. Fichier LOCAL. Ne pas merger sans GO Abdou.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CONTEXTE (incident local 2026-07-13)
-- ─────────────────────────────────────────────────────────────────────────────
-- En réparant un flake local (pré-commit), un `supabase db reset` a révélé que la
-- base LOCALE n'était PAS reconstructible depuis les migrations : ~1231 GRANTs DML
-- (`SELECT/INSERT/UPDATE/DELETE` pour `anon`/`authenticated`/`service_role`) sur la
-- quasi-totalité des tables/vues du schéma `public` existaient EN PROD mais dans
-- AUCUN fichier de migration (appliqués hors-bande historiquement + aucun `seed.sql`).
-- Après reset, ces GRANTs manquaient → 34 tests d'intégration en « permission denied ».
--
-- Cette migration CAPTURE ces GRANTs manquants pour que `supabase db reset` reproduise
-- enfin l'état de PROD À L'IDENTIQUE. Contenu généré par diff LECTURE SEULE
-- prod↔local (grouped, exact — 90 lignes DML-complet 3 rôles + 29 partiels vues/tables
-- restreintes, fidèles à prod, aucun sur-grant).
--
-- SÉCURITÉ : ces GRANTs sont nécessaires-mais-non-suffisants. La frontière de sécurité
-- reste la RLS (deny par défaut, activée sur chaque table) + les vues redacted
-- SECURITY DEFINER. Un GRANT DML seul n'expose rien sous RLS deny-par-défaut.
--
-- IDEMPOTENT : GRANT est idempotent (rejouable sans effet de bord). Déjà présent en
-- PROD (out-of-band) → application prod = no-op de mise en conformité du code.
-- =============================================================================

GRANT SELECT,INSERT,UPDATE,DELETE ON public."admin_audit_log" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."affiliate_clicks" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."affiliate_product_prices" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."agent_countries" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."agent_country_audit" TO anon, authenticated, service_role;
GRANT SELECT ON public."categories" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."categories" TO anon, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."category_channel_audit" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."category_suggestions" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."cities" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."commissions" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."countries" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."country_aliases" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_access_attempts" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_blocks" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_cash_confirmations" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_product_debts" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_remittance_orders" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_remittances" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_returns" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_staff_pairs" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_statements" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_tour_orders" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."courier_tours" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."couriers" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."currencies" TO anon, authenticated, service_role;
GRANT INSERT,UPDATE,DELETE ON public."current_exchange_rates" TO anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."current_exchange_rates" TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."exchange_rates" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."guardian_alerts" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."import_tariffs" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."inventory_snapshot_lines" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."inventory_snapshots" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."ledger_accounts" TO anon, authenticated, service_role;
GRANT INSERT,UPDATE,DELETE ON public."ledger_balances" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."ledger_balances" TO anon, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."ledger_entries" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."ledger_postings" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."ledger_transactions" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."logistics_settings" TO anon, authenticated, service_role;
GRANT INSERT,UPDATE,DELETE ON public."notifications" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."notifications" TO anon, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."order_financial_snapshots" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."order_proofs" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."order_signals" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."orders" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."payout_statements" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."payouts" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."premium_plans" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."product_variants" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."product_variants_read" TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."product_watches" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."products" TO anon, authenticated, service_role;
GRANT INSERT,UPDATE,DELETE ON public."products_catalog_read" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."products_catalog_read" TO anon, service_role;
GRANT INSERT,UPDATE,DELETE ON public."products_public_read" TO anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."products_public_read" TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."products_sell_price_audit" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."profiles" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."quote_requests" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."rfq_matches" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."rfq_offers" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."sample_request_files" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."sample_requests" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."scan_events" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."sourcing_requests" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."staff_permission_audit" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."staff_permissions" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."stock_anomalies" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."stock_movements" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."subscription_audit_log" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_bulk_imports" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_catalogs" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_issues" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_matching_profiles" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_payout_history" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_product_attachments" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_product_moq_tiers" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_product_moq_tiers_wholesaler_read" TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_product_variants" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_products" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_products_owner_read" TO service_role;
GRANT INSERT,UPDATE,DELETE ON public."supplier_products_wholesaler_read" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_products_wholesaler_read" TO anon, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_quote_requests" TO anon, authenticated, service_role;
GRANT INSERT,UPDATE,DELETE ON public."supplier_quote_requests_supplier_read" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_quote_requests_supplier_read" TO anon, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."supplier_subscriptions" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."team_members" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."telegram_inbound" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."telegram_pending_products" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."telegram_supplier_links" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_courier_balances" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_courier_cash_in_transit" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_courier_remittance_pending" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_courier_scan_queue" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_guardian_alerts" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_guardian_courier_risk" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_guardian_open_returns" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_guardian_pending_cash" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_ledger_balances" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."v_treasury_overview" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."variant_status_balance" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_cart_items" TO anon, authenticated, service_role;
GRANT INSERT,UPDATE,DELETE ON public."wholesale_catalog_read" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_catalog_read" TO anon, service_role;
GRANT INSERT,UPDATE,DELETE ON public."wholesale_delivery_ledger" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_delivery_ledger" TO anon, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_order_import_history" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_order_items" TO anon, authenticated, service_role;
GRANT INSERT,UPDATE,DELETE ON public."wholesale_order_items_supplier_read" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_order_items_supplier_read" TO anon, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_order_payment_history" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_order_status_history" TO anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_orders" TO anon, authenticated, service_role;
GRANT INSERT,UPDATE,DELETE ON public."wholesale_orders_buyer_read" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_orders_buyer_read" TO anon, service_role;
GRANT INSERT,UPDATE,DELETE ON public."wholesale_orders_supplier_read" TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."wholesale_orders_supplier_read" TO anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- CORRECTIF RACINE (anti-récurrence) : privilèges par défaut pour les FUTURES
-- tables du schéma public → une nouvelle table via une future migration héritera
-- automatiquement des GRANTs (la dette ne se reproduira plus).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
