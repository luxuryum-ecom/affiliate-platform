# Agent Workflow — AffiPartner Morocco

This document defines how AI agents should execute work on this project autonomously, with user approval only for high-risk actions.

## Philosophy

| User does | Agent does |
|---|---|
| Gives business/product instructions | Inspects code, implements, verifies |
| Approves high-risk actions | Executes everything else automatically |
| Tests in browser when asked | Runs `npm run safe-check`, reports URLs |
| Commits when ready | Prepares diffs, never commits unless asked |

## Standard execution loop

```
1. UNDERSTAND   Restate goal + success criteria
2. INSPECT      Read relevant files (never guess from memory)
3. PLAN         List files to change; flag approval-gate items
4. IMPLEMENT    Minimal diff, existing conventions
5. VERIFY       npm run safe-check
6. REPORT       Summary + test steps + pending approvals
```

## Commands reference

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run check` | Typecheck + lint |
| `npm run build` | Production build |
| `npm run safe-check` | check + build + git hygiene |
| `npm run migrate` | Apply Supabase migrations (`supabase db push`) |
| `npm run types` | Regenerate Supabase TypeScript types |
| `npm run reset-cache` | Clear `.next` after Turbopack cache errors |

## Task types and agent behavior

### Feature request (UI + logic)
1. Read business-model.mdc for rules
2. Read architecture.mdc for patterns
3. Implement in server components + server actions
4. Update `src/types/database.ts` if types change
5. Run `npm run safe-check`

### Schema change
1. Read database-safety.mdc
2. Create next migration `supabase/migrations/NNN_name.sql`
3. Explain migration risk in response
4. Update `src/types/database.ts`
5. Run `npm run migrate` → `npm run types` → `npm run check`
6. If DROP/TRUNCATE needed → **stop and ask user**

### Bug fix
1. Reproduce from error message / terminal logs
2. Minimal fix only
3. Run `npm run check`
4. Report root cause

### Stabilization / audit
1. No new features
2. Run `npm run safe-check`
3. List risks, missing env vars, broken routes
4. Fix only blocking issues

## Git workflow

- **Autonomous:** create diffs, run checks, suggest commit message
- **User approval:** actual `git commit`, `git push`, especially to `main`
- **Checkpoint before risky work:**
  ```bash
  git add -A && git commit -m "checkpoint: before migration 009"
  ```

## How to write feature requests (for the user)

Use this template:

```
Goal: [one sentence — what business problem this solves]

User / role: [admin | affiliate | wholesaler | public customer]

Scope:
- [specific thing to build or change]
- [specific thing to build or change]

Business rules:
- [pricing, commission, stock, approval logic]

Do NOT:
- [explicit exclusions]

Verify:
- [URL or action to test after]
```

### Good example

```
Goal: Affiliates should see delivery fee on product cards.

User / role: affiliate

Scope:
- Show delivery_fee_mad on /affiliate/products cards
- Include in operational fees breakdown already on card

Business rules:
- Read delivery_fee_mad from products table
- Only show if > 0

Do NOT:
- Change commission calculation
- Add new database columns

Verify:
- /affiliate/products shows delivery fee for products with delivery_fee_mad > 0
```

### Bad example (too vague)

```
Make the affiliate dashboard better.
```

## File map for agents

| Area | Primary files |
|---|---|
| Business rules | `.cursor/rules/business-model.mdc` |
| Agent OS | `.cursor/rules/agent-operating-system.mdc` |
| DB safety | `.cursor/rules/database-safety.mdc` |
| Deploy safety | `.cursor/rules/deployment-safety.mdc` |
| Architecture | `.cursor/rules/architecture.mdc`, `docs/PROJECT_ARCHITECTURE.md` |
| Approval gates | `docs/RISK_APPROVAL_MATRIX.md` |
| Migrations | `supabase/migrations/` |
| Types | `src/types/database.ts` |
| Server actions | `src/app/actions/` |
| Admin UI | `src/app/(admin)/`, `src/components/admin/` |
| Affiliate UI | `src/app/(affiliate)/`, `src/components/affiliate/` |
| Wholesale UI | `src/app/(wholesale)/`, `src/components/wholesale/` |
| Public COD | `src/app/products/[id]/` |

## Related documents

- [Risk Approval Matrix](./RISK_APPROVAL_MATRIX.md)
- [Project Architecture](./PROJECT_ARCHITECTURE.md)
