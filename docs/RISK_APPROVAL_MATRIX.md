# Risk Approval Matrix

Actions classified by risk level. The AI agent executes **Low** and **Medium** autonomously. **High** and **Critical** require explicit user approval before proceeding.

## Legend

| Level | Agent behavior |
|---|---|
| 🟢 Low | Execute autonomously, report in summary |
| 🟡 Medium | Execute autonomously, explain impact in response |
| 🔴 High | **STOP — ask user before proceeding** |
| ⛔ Critical | **STOP — ask user, explain irreversibility** |

---

## Database

| Action | Level | Notes |
|---|---|---|
| `ADD COLUMN IF NOT EXISTS` | 🟢 | Standard migration pattern |
| `CREATE TABLE IF NOT EXISTS` | 🟢 | Idempotent |
| `CREATE INDEX IF NOT EXISTS` | 🟢 | Safe |
| `CREATE OR REPLACE FUNCTION` | 🟢 | Idempotent |
| `DROP POLICY IF EXISTS` + `CREATE POLICY` (single policy) | 🟡 | Explain which role/action affected |
| `UPDATE` backfill with scoped `WHERE` | 🟡 | Explain what rows change |
| New trigger on existing table | 🟡 | Explain side effects |
| `ALTER COLUMN` type change | 🟡 | May lock table briefly |
| `DROP COLUMN` | 🔴 | Requires user approval |
| `DROP TABLE` | 🔴 | Requires user approval |
| `TRUNCATE` | 🔴 | Requires user approval |
| `DELETE FROM` without narrow WHERE | 🔴 | Requires user approval |
| Broad RLS rewrite (multiple tables/roles) | 🔴 | Requires user approval |
| Disable RLS on any table | ⛔ | Never without explicit approval |
| Change `auth.users` trigger behavior | 🔴 | Affects all signups |

---

## Deployment & infrastructure

| Action | Level | Notes |
|---|---|---|
| Local `npm run build` | 🟢 | Verification only |
| Local `npm run migrate` (linked CLI) | 🟡 | Explain migration contents first |
| Update `.env.production.example` (names only) | 🟢 | No secret values |
| Push to feature branch | 🟡 | User may want to review first |
| Push to `main` (triggers Vercel deploy) | 🔴 | Requires user approval |
| Manual Vercel deploy | 🔴 | Requires user approval |
| Add/change Vercel env vars | 🔴 | Requires user approval |
| Add/change GitHub Actions secrets | 🔴 | Requires user approval |
| Change `vercel.json` region/build | 🔴 | Requires user approval |
| Force push any branch | ⛔ | Never without explicit approval |

---

## Secrets & environment

| Action | Level | Notes |
|---|---|---|
| Read `.env.example` / `.env.production.example` | 🟢 | Templates only |
| Create/update `.env.local` template guidance | 🟢 | Tell user what to paste, not values |
| Read or display `.env.local` values | 🔴 | May contain secrets — ask first |
| Commit any file with real secrets | ⛔ | Never |
| Expose `SUPABASE_SERVICE_ROLE_KEY` to client | ⛔ | Never |

---

## Auth & security

| Action | Level | Notes |
|---|---|---|
| Fix typo in login form UI | 🟢 | Cosmetic |
| Add role guard to new route | 🟢 | Standard pattern |
| Change signup allowed roles | 🟡 | Explain impact |
| Change login redirect logic | 🟡 | Explain impact |
| Modify `middleware.ts` session logic | 🔴 | Affects all routes |
| Change Supabase Auth settings | 🔴 | Requires user approval |
| Add OAuth provider | 🔴 | Requires user approval |
| Change password reset flow | 🔴 | Requires user approval |

---

## Payments & money

| Action | Level | Notes |
|---|---|---|
| Display commission amounts (read-only UI) | 🟢 | Existing data |
| Fix commission trigger guard | 🟡 | Explain trigger change |
| Change commission calculation logic | 🟡 | Explain business impact |
| Add payment gateway (Stripe, CMI) | 🔴 | Requires user approval |
| Change payout workflow | 🔴 | Requires user approval |
| Modify COD reconciliation fields logic | 🟡 | Explain impact |

---

## Data deletion

| Action | Level | Notes |
|---|---|---|
| Remove unused import in TypeScript | 🟢 | Code only |
| Delete test product via admin UI instruction | 🟡 | User-initiated |
| Agent runs DELETE on production DB | ⛔ | Never without explicit approval |
| Agent drops migration column | ⛔ | Never without explicit approval |

---

## Git

| Action | Level | Notes |
|---|---|---|
| `git status`, `git diff`, `git log` | 🟢 | Read-only |
| Stage and prepare commit message | 🟢 | Don't commit unless asked |
| `git commit` | 🟡 | Only when user explicitly asks |
| `git push` to feature branch | 🟡 | User may prefer to push themselves |
| `git push` to `main` | 🔴 | Requires user approval |
| `git push --force` | ⛔ | Never to main; ask for any branch |
| `git reset --hard` | ⛔ | Requires explicit approval |

---

## Quick decision tree

```
Is it destructive to data or schema?
  YES → STOP, ask user
  NO ↓

Does it touch secrets, auth, payments, or production deploy?
  YES → STOP, ask user
  NO ↓

Does it affect multiple RLS policies or roles?
  YES → STOP, ask user
  NO ↓

Execute autonomously → verify → report
```
