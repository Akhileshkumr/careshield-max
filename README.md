# CareShield Max — D2C Health Insurance Buy Journey

A three-step online purchase journey for an enterprise health plan: calculate and lock a premium,
declare medical history, then pay and receive a policy contract — issued atomically and safely
under duplicate requests.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌───────────────┐
│ QUOTE_GENERATED │ ──▶ │ MEDICAL_DECLARED │ ──▶ │  PREMIUM_PAID   │ ──▶ │ POLICY_ISSUED │
└─────────────────┘     └──────────────────┘     └─────────────────┘     └───────────────┘
        │                        │
        ▼                        ▼
    DECLINED                 EXPIRED
```

---

## Quick start

**Prerequisites:** Node 20+ and Docker.

```bash
git clone <this-repo> && cd careshield-max
cp .env.example .env

npm install
npm run db:up        # ephemeral PostgreSQL 17 (tmpfs — nothing persists)
npm run db:migrate   # apply the committed SQL migrations
npm run dev          # API on :3001, web on :3000
```

Open <http://localhost:3000>.

```bash
npm test             # unit + integration
npm run test:unit    # pure-logic only; no Docker required
npm run db:down      # tear the database down completely
```

`npm run dev` starts all three workspaces together — the contracts package in watch mode, the API on
`:3001` and the web app on `:3000`. For a production-mode run, `npm run build && npm start`.

> Environment variables live in a single `.env` at the repo root. Root scripts load it with
> `dotenv-cli` and child processes inherit it — necessary because npm runs each workspace script
> with its own directory as the cwd, so neither `dotenv/config` nor Next.js would find a root-level
> `.env` on its own.

### Without Docker

Docker Compose is the documented path because it gives a reviewer a genuinely ephemeral database in
one command. But nothing here depends on Docker specifically — the tests assert on real PostgreSQL
behaviour, and any real PostgreSQL will do:

```bash
brew install postgresql@17                  # no admin password needed
pg_ctl -D /opt/homebrew/var/postgresql@17 -l /tmp/pg.log start
createuser -s careshield && createdb -O careshield careshield
psql -d postgres -c "ALTER ROLE careshield WITH PASSWORD 'careshield' LOGIN;"

npm run db:migrate && npm run dev
```

For the integration suite, point it at any database with `TEST_DATABASE_URL` and it will skip
Testcontainers entirely — which is also how you would wire it to a CI service container:

```bash
createdb -O careshield careshield_test
TEST_DATABASE_URL=postgres://careshield:careshield@localhost:5432/careshield_test npm run test:e2e
```

---

## Stack

| | |
|---|---|
| **Frontend** | Next.js 16 (App Router, RSC + Server Actions), React 19, Tailwind CSS v4 |
| **Backend** | NestJS 11, Drizzle ORM, PostgreSQL 17 |
| **Testing** | Jest + Testcontainers (API), Vitest (web) |
| **Shared** | `@careshield/contracts` — types, zod schemas, exact-money helpers |

```
careshield-max/
├── docker-compose.yml          ephemeral postgres (tmpfs data dir)
├── packages/contracts/         shared types, schemas, money.ts
└── apps/
    ├── api/
    │   ├── drizzle/            committed SQL migrations
    │   └── src/
    │       ├── db/             schema.ts — tables, enums, constraints
    │       ├── pricing/        premium.engine.ts   (pure)
    │       ├── underwriting/   eligibility.rules.ts (pure)
    │       ├── payments/       PaymentProvider + MockPaymentClient
    │       ├── idempotency/    reservation & replay
    │       └── insurance/      controller, quotes & checkout services, FSM
    └── web/
        ├── src/app/            RSC pages + Server Actions
        ├── src/components/     forms, payment panel, UI primitives
        └── src/hooks/          use-quote-countdown.ts
```

`packages/contracts` exists so the pricing rules, age bounds and wire shapes have exactly one
definition. The API validates inbound requests with class-validator and the web app validates forms
with zod — two different mechanisms, but neither hard-codes a bound; both read the same constants,
so they cannot drift.

---

## Design decisions

### Phase 1 — schema and state management

**The state machine is explicit and checked.** The brief names four states, which describe the
happy path only. They leave nowhere to put a quote whose lock ran out, or an applicant who failed
underwriting — both ordinary outcomes — so `EXPIRED` and `DECLINED` are added as terminal states.
The four required names are kept verbatim.

Transitions live in an adjacency map and every state change goes through `assertTransition`
([`quote-state-machine.ts`](apps/api/src/insurance/quote-state-machine.ts)). Without it, a checkout
call arriving before the medical declaration would issue a policy to an applicant who was never
underwritten — and it would look like a successful purchase. With it, that is a 409.

**`UNIQUE(policies.quote_id)` is the most important line in the schema.** It is the last line of
defence against double-issuance: even if the idempotency layer were bypassed, the row lock removed,
and two requests raced through every application guard, PostgreSQL still physically refuses to
create a second policy for one quote. Correctness there does not depend on application code being
right.

**Money: `NUMERIC(10,2)`, and integer paise.** Binary floating point cannot represent `0.1`, so
`0.1 + 0.2 === 0.30000000000000004`; premiums built from floats drift by paise and stop reconciling
against the provider. But `NUMERIC(10,2)` only protects *storage*. The other half is the
*arithmetic*:

- Drizzle returns numeric columns as **strings**, deliberately — that is what stops the driver
  coercing an exact decimal into a lossy `number`.
- All arithmetic happens in **integer paise** ([`money.ts`](packages/contracts/src/money.ts)).
  Integer maths in JS is exact well beyond the `NUMERIC(10,2)` ceiling.
- Values cross the API boundary as decimal strings (`"15000.00"`), never as JS numbers.
- `toMinor()` **throws** on anything that is not a clean 2dp decimal, so a float that leaked in
  upstream fails loudly instead of silently rounding.

**Timestamps** are all `timestamptz`, never naive `timestamp`.

### Phase 2 — premium engine

The engine ([`premium.ts`](packages/contracts/src/premium.ts)) is a **pure function** — no clock, no
database, no randomness. That is what "deterministic quote" actually requires, and it lets the whole
rule set be tested as a truth table with no test doubles.

| age | pre-existing | base | age loading | condition loading | **total** |
|---|---|---|---|---|---|
| 30 | no | 10,000 | 0 | 0 | **10,000** |
| 30 | yes | 10,000 | 0 | 5,000 | **15,000** |
| 50 | no | 10,000 | 5,000 | 0 | **15,000** |
| 50 | yes | 10,000 | 5,000 | 5,000 | **20,000** |
| 45 | no | 10,000 | 0 | 0 | **10,000** ← `> 45`, so 45 is *not* loaded |
| 46 | no | 10,000 | 5,000 | 0 | **15,000** |

**Strict validation.** The global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`
and — the one that matters — `enableImplicitConversion: false`. With implicit conversion on, `"50"`
becomes `50` and `"false"` becomes `true`, so a client sending wrong types would receive a quote
priced off coerced values instead of an error. A typo'd field name is a 400, not a quote priced as
though the applicant were healthy.

**The 15-minute lock is computed by PostgreSQL**, not by Node:

```ts
expiresAt: sql`now() + make_interval(mins => ${ttlMinutes})`
```

Expiry is later checked against SQL `now()`. Had the value been minted from `Date.now()` on an app
server, two instances with a few seconds of clock skew would issue quotes with inconsistent
lifetimes and the check would disagree with the value it was checking. One clock authority, no skew
to reason about.

### Phase 3 — frontend

**The browser never talks to NestJS.** Forms submit to Server Actions; those run on the Next.js
server, which holds the API base URL and a service token in server-only environment variables.
[`api-client.ts`](apps/web/src/lib/api-client.ts) starts with `import 'server-only'`, so if any
Client Component ever imports it — directly or transitively — **the build fails** rather than
shipping credentials to the browser. The boundary is enforced by the compiler, not by everyone
remembering it. CORS is deliberately never enabled on the API.

**The countdown** ([`use-quote-countdown.ts`](apps/web/src/hooks/use-quote-countdown.ts)) has three
details that separate a working timer from one that merely looks right:

1. **Clock-skew correction.** The server returns `serverTime` alongside `expiresAt`; the offset
   against the browser's clock is measured once and applied to every reading. Without it a user
   whose laptop is five minutes fast watches "3:41 remaining" while being told the quote expired.
2. **Recompute, never decrement.** Each tick recalculates from absolute timestamps. Background tabs
   are throttled and sleeping laptops stop firing timers, so a decrementing counter returns from a
   ten-minute sleep ten minutes wrong. A `visibilitychange` listener forces an immediate recompute
   on refocus.
3. **Deterministic first render**, derived only from the two server timestamps, so hydration does
   not mismatch.

> **The timer is UX, not security.** The server re-checks `expires_at` inside the checkout
> transaction. Re-enable the disabled button in devtools and you still get a `410 Gone`.

**Double-submission is defended in three independent layers**, because each alone is defeatable:

| Layer | Stops | Defeated by |
|---|---|---|
| `disabled={isPending}` via `useActionState` | the obvious double-click | Enter before hydration; reload and retry |
| Idempotency key, minted **once per attempt** | duplicated and retried requests | nothing client-side |
| `UNIQUE(idempotency_key)`, `UNIQUE(policies.quote_id)` | everything, including cross-tab races | nothing |

The key is **stable across retries of one attempt** and regenerated only after a terminal decline —
a key that changed per click would defeat its own purpose.

### Phase 4 — atomicity and idempotency

**One transaction** ([`checkout.service.ts`](apps/api/src/insurance/checkout.service.ts)):

```
BEGIN
  1. SELECT ... FOR UPDATE on the quote      ← serialises concurrent checkouts
  2. reserve the idempotency key             ← duplicates short-circuit to a replay
  3. expiry gate                             ← the authoritative one
  4. FSM + underwriting guards
  5. charge the provider
  6. quote → PREMIUM_PAID, INSERT policy, quote → POLICY_ISSUED
COMMIT
```

**Why the order is what it is.** The lock comes *before* the guards. Validating first and locking
second would reintroduce exactly the check-then-act race the lock exists to close — two requests
both read `MEDICAL_DECLARED`, both pass, both charge. The reservation comes *before* the expiry
gate, because a policy issued 20 minutes ago sits on a quote that is now past `expires_at`, and a
retry must still replay that policy rather than be told the quote expired.

Isolation stays `READ COMMITTED` with an explicit row lock; `SERIALIZABLE` would also work but needs
a retry loop for `40001` serialization failures.

**Idempotency reduces to one atomic statement:**

```sql
INSERT INTO payments (idempotency_key, ...) VALUES (...)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;
```

Whoever gets a row back owns the attempt. The obvious alternative — `SELECT` to check, then
`INSERT` — has a window between the two in which a second request reaches the same conclusion, and
both charge. Pushing the decision into one statement backed by a UNIQUE index removes the window:
arbitration happens inside Postgres, not in application code.

A subtlety worth knowing: `ON CONFLICT DO NOTHING` **blocks** on an *uncommitted* conflicting row
rather than returning immediately. So when five simultaneous requests carry one key, four park
inside their INSERT; when the winner commits they wake, get no row, re-read the now-committed
payment, see `SUCCEEDED` and replay it. Four clean 200s — out of the database's locking, not out of
application retry logic.

| Repeated key | Response |
|---|---|
| same body, succeeded | **200** + `Idempotency-Replayed: true`, stored response replayed verbatim |
| **different** body | **422** — a client bug; replaying would answer an unasked question, executing would defeat the guarantee |
| still `PENDING` | **409** + `Retry-After` |
| declined | replays the decline; a genuine new attempt needs a new key |

**Failure semantics are deliberately not uniform:**

- **Provider error** (no decision reached) → throw → *everything* rolls back, including the
  reservation. Nothing persists, the quote is untouched, and the key stays free — which is correct,
  because no charge occurred and the provider's own idempotency protects the retry.
- **Provider decline** (a decision *was* reached) → nothing needs rolling back, and the attempt is
  worth auditing. The payment row commits as `FAILED`, no policy is issued, and the 402 is raised
  *after* the transaction so the audit survives.

---

## The honest caveat

**Step 5 above is a network call inside an open database transaction.** It holds a row lock and a
pooled connection for the provider's full latency, and it has a real failure mode: if the process
dies between a successful charge and `COMMIT`, the customer is charged with no policy to show for
it.

It is built this way because Task 4.1 asks for exactly that — payment and state change inside one
atomic transaction — and the rollback behaviour it requires is genuinely demonstrated
(`tok_error` → zero policies, zero payments, quote unmoved).

**In production this becomes a three-phase saga:**

1. **Commit the intent.** Lock, reserve the key, validate, write `PENDING`, `COMMIT`.
2. **Charge with no transaction held.** No lock, no connection pinned.
3. **Commit the settlement atomically.** Record the result, transition the quote and insert the
   policy in one transaction — Task 4.1's atomicity requirement still satisfied, just scoped to the
   writes rather than the I/O.

Plus a **reconciliation job** for rows stuck in `PENDING`, re-querying the provider by idempotency
key. This is why `MockPaymentClient` forwards our key to the provider and dedupes on it: it is what
makes that reconciliation possible, and it means the guarantee holds end-to-end rather than only
inside our own database.

Under that design the `PENDING` → 409 branch becomes load-bearing; in the current single-transaction
design it is nearly unreachable, and is implemented defensively.

---

## API

All endpoints require `x-service-token` (sent by the Next.js server, never the browser).

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/v1/insurance/quote` | → quote with breakdown, `expiresAt`, `serverTime` |
| `GET` | `/api/v1/insurance/quote/:id` | includes `isExpired`, derived from timestamps |
| `POST` | `/api/v1/insurance/quote/:id/medical-declaration` | → eligibility decision (200 even when declined) |
| `POST` | `/api/v1/insurance/checkout` | requires `Idempotency-Key`; 201 issued / 200 replayed |
| `GET` | `/api/v1/insurance/policy/:id` | the issued contract |
| `GET` | `/health` | readiness incl. a database ping; exempt from the token |

**Error codes** are part of the contract — the frontend switches on them to decide between
"recalculate", "try another card" and a generic failure.

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` / `IDEMPOTENCY_KEY_REQUIRED` | bad request |
| 402 | `PAYMENT_DECLINED` | provider said no — try another card |
| 403 | `UNDERWRITING_DECLINED` | not eligible for instant cover |
| 404 | `QUOTE_NOT_FOUND` / `POLICY_NOT_FOUND` | |
| 409 | `INVALID_STATE_TRANSITION` / `IDEMPOTENT_REQUEST_IN_FLIGHT` | |
| 410 | `QUOTE_EXPIRED` | the lock window has passed — recalculate |
| 422 | `IDEMPOTENCY_KEY_REUSED` | same key, different body |
| 502 | `PAYMENT_PROVIDER_ERROR` | no decision reached — retry shortly |

### Mock payment tokens

The prefix selects the outcome, so every branch is demonstrable by hand:

| Token | Result |
|---|---|
| `tok_success` | approved → policy issued |
| `tok_decline` | 402, audit row committed, no policy |
| `tok_error` | 502, **full rollback** |
| `tok_timeout` | 502 after the provider timeout |

```bash
curl -s localhost:3001/api/v1/insurance/quote \
  -H 'content-type: application/json' \
  -H 'x-service-token: dev-service-token-change-me' \
  -d '{"applicantName":"Asha R","age":50,"hasPreExistingConditions":true}'
```

---

## Tests

```bash
npm run test:unit    # pure logic — no Docker needed
npm run test:e2e     # real Postgres via Testcontainers
```

Unit tests cover the premium truth table (including the 45/46 boundary), the underwriting rules,
exact-money arithmetic, the state machine, request-hash canonicalisation, and the countdown hook
under fake timers — including a simulated sleeping laptop and a skewed client clock.

The integration tests assert on **actual row counts in a real PostgreSQL**, because the behaviours
they exist to prove are database behaviours — transaction rollback, `FOR UPDATE` contention, and
`ON CONFLICT` blocking on an uncommitted index. A suite that mocked those away would be worse than
no suite at all.

The ones that matter:

- `tok_error` → **zero** policies, **zero** payments, quote still `MEDICAL_DECLARED`
- expired quote → 410, nothing written
- **five parallel checkouts, one idempotency key → exactly one policy**, one 201 and four identical 200s
- **five parallel checkouts, five different keys → exactly one policy**, four 409s (this one is
  stopped purely by the row lock)
- same key + different body → 422
- an issued policy still replays after its quote window has passed

### Demoing it by hand

1. Age 50 + pre-existing conditions → the breakdown reads ₹20,000, the timer starts at 15:00.
2. Submit the declaration → the price does not move.
3. Pay with **ICICI •••• 0002** → declined, no policy, quote still payable.
4. Pay with **Axis •••• 0119** → provider error; check the database — nothing was written.
5. Pay with **HDFC •••• 4242**, double-clicking → one policy.
6. Set `QUOTE_TTL_MINUTES=1`, restart, and wait it out → the button disables and a recalculation
   prompt appears. Re-enable the button in devtools and pay anyway → `410 Gone`.

---

## Assumptions

1. **"A 50% loading" means 50% of the base premium**, applied independently of the flat fee, so the
   order the two loadings are applied in cannot change the answer. Worst case is ₹20,000. The
   alternative reading — 50% of base + flat, giving ₹22,500 — is defensible but makes the result
   order-dependent. One line to change in `calculatePremium` if the business wants it.
2. **Underwriting does not re-price.** The quote is locked for its full window; underwriting decides
   *whether* to offer cover, not what it costs. Re-pricing mid-journey would make the lock
   meaningless.
3. **`REFERRED` stops this journey.** "A human underwriter must look at this" is a normal insurance
   outcome but is incompatible with *instant* bind, so it halts the quote as a decline does — the
   distinction is preserved on the declaration row for the ops team.
4. **A declined declaration returns 200**, not an error. "We cannot offer you instant cover" is a
   business result the UI renders a screen for, not an exceptional condition. The refusal to take
   money lives at checkout, where money would move.
5. **`EXPIRED` is housekeeping.** The status is written by a sweep, never inside a request
   transaction (where it would be rolled back along with everything else). No read depends on the
   sweep having run — `isExpired` is always derived from the timestamps themselves.
6. **NestJS 11, not 12.** Nest 12 is ESM-only, which would mean `.js` extensions on every relative
   import and an `--experimental-vm-modules` Jest setup. Given the integration tests are the part of
   this exercise worth trusting, reliability there was worth more than being on the newest major.

## What I'd add next

Structured logging with request IDs · OpenAPI/Swagger · rate limiting on checkout · the saga
refactor and its reconciliation job · a real PSP behind the existing `PaymentProvider` interface ·
the `EXPIRED` sweep on a schedule rather than on demand.
