#!/usr/bin/env bash
# safe-check.sh — verification gate before commit or deploy
# Usage: npm run safe-check   OR   bash scripts/safe-check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "════════════════════════════════════════"
echo "  AffiPartner safe-check"
echo "════════════════════════════════════════"
echo ""

# ── 1. Typecheck + lint ──────────────────────────────────────────────────────
echo "▶ Step 1/3: npm run check (typecheck + lint)"
npm run check
echo "  ✓ check passed"
echo ""

# ── 2. Production build ──────────────────────────────────────────────────────
echo "▶ Step 2/3: npm run build"
npm run build
echo "  ✓ build passed"
echo ""

# ── 3. Git hygiene (non-blocking warnings) ───────────────────────────────────
echo "▶ Step 3/3: git hygiene"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git status --porcelain | grep -qE '\.env\.local|\.env$'; then
    echo "  ⚠ WARNING: .env file appears in git status — do NOT commit secrets"
  fi
  UNTRACKED=$(git status --porcelain | grep '^??' | wc -l | tr -d ' ')
  if [ "$UNTRACKED" -gt 0 ]; then
    echo "  ℹ $UNTRACKED untracked file(s) — review before commit"
  fi
  echo "  ✓ git check done"
else
  echo "  ℹ not a git repo — skipped"
fi
echo ""

echo "════════════════════════════════════════"
echo "  ✓ safe-check PASSED"
echo "════════════════════════════════════════"
