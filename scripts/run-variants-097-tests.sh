#!/usr/bin/env bash
# Wrapper d'exécution des tests runtime migration 097 — statuts stock ledger.
# Injecte les clés Supabase LOCAL depuis `supabase status --output env`.
# AUCUNE clé n'est écrite en dur — lecture dynamique au runtime uniquement.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Lecture des clés Supabase local via supabase status..."
STATUS_ENV=$(supabase status --output env 2>/dev/null | grep -v "^posthog\|^Stopped\|^A new")

LOCAL_SUPABASE_URL=$(echo "$STATUS_ENV" | grep '^API_URL=' | cut -d= -f2- | tr -d '"')
LOCAL_SERVICE_ROLE_KEY=$(echo "$STATUS_ENV" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
LOCAL_ANON_KEY=$(echo "$STATUS_ENV" | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')

if [ -z "$LOCAL_SUPABASE_URL" ] || [ -z "$LOCAL_SERVICE_ROLE_KEY" ] || [ -z "$LOCAL_ANON_KEY" ]; then
  echo "ERREUR: Impossible de récupérer les clés Supabase local (lancez 'supabase start')."
  exit 1
fi

echo "==> URL locale: $LOCAL_SUPABASE_URL"
echo "==> Exécution des tests migration 097 — statuts stock ledger + projection..."
echo ""

LOCAL_SUPABASE_URL="$LOCAL_SUPABASE_URL" \
LOCAL_SERVICE_ROLE_KEY="$LOCAL_SERVICE_ROLE_KEY" \
LOCAL_ANON_KEY="$LOCAL_ANON_KEY" \
node "${SCRIPT_DIR}/test-variants-097-runtime.mjs"
