#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Supplier select must exclude moderation/admin fields"
SELECT_LINE=$(grep -E "^export const SUPPLIER_PRODUCT_SELECT" src/lib/supplier-product-moderation.ts)
for field in ai_risk_score moderation_reason moderation_signals moderation_flag admin_notes supplier_private_notes; do
  if echo "$SELECT_LINE" | grep -q "$field"; then
    echo "FAIL: SUPPLIER_PRODUCT_SELECT includes $field"
    exit 1
  fi
done

echo "→ Supplier products page must not use select('*')"
if grep -qE "select\(['\"]?\*['\"]?\)" "src/app/(supplier)/supplier/products/page.tsx"; then
  echo "FAIL: supplier products page still uses select('*')"
  exit 1
fi

echo "→ Bulk approval validation unit checks"
node --input-type=module -e "
const missing = (input) => {
  const m = [];
  if (!input.public_name?.trim()) m.push('nom public');
  if (input.min_quantity < 1) m.push('MOQ');
  const hasPrice = (input.suggested_wholesale_price_mad > 0) || (input.supplier_unit_price_usd > 0) || input.moq_tier_count > 0;
  if (!hasPrice) m.push('prix');
  if (input.stock_quantity == null && input.lead_time_days == null) m.push('stock');
  if (!input.platform_margin_type || !(input.platform_margin_value > 0)) m.push('marge');
  return m;
};
const incomplete = missing({ public_name: null, min_quantity: 10, suggested_wholesale_price_mad: 100, supplier_unit_price_usd: null, stock_quantity: 5, lead_time_days: null, platform_margin_type: null, platform_margin_value: null, moq_tier_count: 0 });
if (incomplete.length < 2) { console.error('FAIL: expected incomplete product to fail validation'); process.exit(1); }
const complete = missing({ public_name: 'Pub', min_quantity: 10, suggested_wholesale_price_mad: 100, supplier_unit_price_usd: null, stock_quantity: 5, lead_time_days: null, platform_margin_type: 'percentage', platform_margin_value: 15, moq_tier_count: 0 });
if (complete.length !== 0) { console.error('FAIL: expected complete product to pass validation', complete); process.exit(1); }
console.log('OK: validation rules');
"

echo "✓ supplier moderation checks passed"
