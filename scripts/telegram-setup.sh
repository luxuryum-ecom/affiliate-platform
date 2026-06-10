#!/usr/bin/env bash
# ─── Helper webhook Telegram (module 053) ────────────────────────────────────
# Lit TELEGRAM_BOT_TOKEN et TELEGRAM_WEBHOOK_SECRET depuis .env.local
# (aucun secret en clair sur la ligne de commande).
#
# Usage :
#   scripts/telegram-setup.sh set https://xxxx.ngrok-free.app   # déclare le webhook
#   scripts/telegram-setup.sh info                              # état du webhook
#   scripts/telegram-setup.sh delete                            # retire le webhook
#   scripts/telegram-setup.sh gen-secret                        # génère un secret aléatoire
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"

load_env() {
  [ -f "$ENV_FILE" ] || { echo "❌ .env.local introuvable ($ENV_FILE)"; exit 1; }
  TELEGRAM_BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')"
  TELEGRAM_WEBHOOK_SECRET="$(grep -E '^TELEGRAM_WEBHOOK_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')"
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || { echo "❌ TELEGRAM_BOT_TOKEN absent de .env.local"; exit 1; }
}

api() { curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/$1"; echo; }

case "${1:-}" in
  set)
    load_env
    URL="${2:?Usage: set <https://...ngrok-free.app>}"
    [ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ] || { echo "❌ TELEGRAM_WEBHOOK_SECRET absent de .env.local"; exit 1; }
    api "setWebhook?url=${URL%/}/api/telegram/webhook&secret_token=${TELEGRAM_WEBHOOK_SECRET}&drop_pending_updates=true"
    ;;
  info)
    load_env
    api "getWebhookInfo"
    ;;
  delete)
    load_env
    api "deleteWebhook?drop_pending_updates=true"
    ;;
  gen-secret)
    # 32 octets aléatoires hex → à coller dans .env.local comme TELEGRAM_WEBHOOK_SECRET
    openssl rand -hex 32
    ;;
  *)
    echo "Usage: $0 {set <ngrok-url>|info|delete|gen-secret}"
    exit 1
    ;;
esac
