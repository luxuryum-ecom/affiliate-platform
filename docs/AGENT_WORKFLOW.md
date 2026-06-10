# Agent Workflow — AffiPartner Morocco

This document defines how AI agents should execute work on this project autonomously, with user approval only for high-risk actions.

**Cursor rules (persistent):**
- `.cursor/rules/agent-routing.mdc` — model routing, chat splits, token control
- `.cursor/rules/agent-operating-system.mdc` — execution loop, approvals, verification

## How the user should work

Describe **only the business feature or issue**. Do not specify model, files, or commands unless you want to override defaults.

Example: *"Affiliates should see pending commission total on the dashboard."*

The agent will route the task, plan, inspect, implement, and verify.

## Model routing (cost control)

| Model | When | Examples |
|---|---|---|
| **Composer** | Terminal & environment only | `git status`, logs, `reset-cache`, dev server restart, migration list |
| **Sonnet** | Default for all coding | Features, bugs, refactors, migrations, server actions, UI |
| **Opus** | Critical reasoning only | Architecture review, security audit, DB design strategy |

**Rules:** Never Opus for routine coding. Never Sonnet for pure terminal tasks Composer can handle.

## When to open a new Cursor chat

The agent should warn you to start a fresh chat when:
1. A **new isolated bug** unrelated to the current thread
2. A **long debugging loop** (repeated failed fixes)
3. An **architecture audit** or system-wide review
4. A **new major feature** unrelated to current WIP
5. **Context is too large** (mixed goals, many unrelated files)

## Philosophy

| User does | Agent does |
|---|---|
| Gives business/product instructions | Inspects code, implements, verifies |
| Approves high-risk actions | Executes everything else automatically |
| Tests in browser when asked | Runs `npm run safe-check`, reports URLs |
| Commits when ready | Prepares diffs, never commits unless asked |

## Standard execution loop

```
0. ROUTE        Pick Composer / Sonnet / Opus; warn if new chat needed
1. UNDERSTAND   Restate goal + success criteria
2. PLAN         Short execution plan BEFORE first file edit
3. INSPECT      Read relevant files (never guess from memory)
4. IMPLEMENT    Minimal diff, existing conventions
5. VERIFY       Stop dev server if needed → npm run safe-check
6. REPORT       Summary + test steps + pending approvals
```

## Stability guardrails

- **COD WIP** — do not rewrite unless explicitly requested
- **Affiliate flow** — referral links, commissions, dashboards
- **Wholesale flow** — tier pricing, cart, orders
- **Integrations** — never guess Supabase/GitHub/Hostinger credentials or run destructive commands without approval

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
2. Identify root cause (one cause, not symptoms)
3. Minimal fix only
4. Verify: `npm run check` (single file) or `safe-check` (multi-file)
5. Summarize: cause, fix, test URL

### Feature
1. Benchmark common SaaS patterns; match existing AffiPartner architecture
2. Read `business-model.mdc` if touching products, orders, commissions, roles
3. Design in plan; implement smallest MVP
4. Verify: `npm run safe-check`
5. Summarize: changed files, test URLs, approvals needed

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
| Agent routing | `.cursor/rules/agent-routing.mdc` |
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
