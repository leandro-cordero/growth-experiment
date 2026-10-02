# Try TradingFX Free

[![Unit tests](https://github.com/leandro-cordero/growth-experiment/actions/workflows/unit-tests.yml/badge.svg?branch=master)](https://github.com/leandro-cordero/growth-experiment/actions/workflows/unit-tests.yml)
[![Typecheck](https://github.com/leandro-cordero/growth-experiment/actions/workflows/typecheck.yml/badge.svg?branch=master)](https://github.com/leandro-cordero/growth-experiment/actions/workflows/typecheck.yml)
[![Build](https://github.com/leandro-cordero/growth-experiment/actions/workflows/build.yml/badge.svg?branch=master)](https://github.com/leandro-cordero/growth-experiment/actions/workflows/build.yml)
[![JS budget](https://github.com/leandro-cordero/growth-experiment/actions/workflows/js-budget.yml/badge.svg?branch=master)](https://github.com/leandro-cordero/growth-experiment/actions/workflows/js-budget.yml)

A marketing landing page, a signup flow and a Users API for TradingFX, a trading-replay and
backtesting product. The goal is to raise the conversion rate from marketing traffic to account
creation, so every part of it is instrumented and experiment-ready: PostHog events, an A/B
experiment (`funnel_proof_v1`) assigned at the edge, and a landing page with no React.

> **Auth is simulated.** Signup collects an email only; there is no password and no login.
> "Continue with Google (demo)" is a labelled fake door that creates no user.
> The signup counter in the `counter` experiment variant is simulated.

---

## Routes

| Route | What it is |
|---|---|
| `/` | Landing page. Prerendered, zero React |
| `/signup` | Signup page. Prerendered, one React island (`SignupForm`) plus an optional profile step |
| `POST /api/users` | Create a user. Takes an `Idempotency-Key` header; email must be unique and from an allowlisted provider (Gmail, Outlook, iCloud… see `src/lib/users/email.ts`) |
| `GET /api/users` | List users. Bearer `USERS_ADMIN_TOKEN` (open in dev when unset) |
| `PATCH /api/users/:id` | Update the profile |
| `/v/counter/*` | Variant copies of `/` and `/signup`, reached only through the middleware rewrite |

## Stack

Astro 7 · React 19 islands · TypeScript strict · Zod 4 · Tailwind v4 ·
PostHog (`posthog-js` + `posthog-node`) · Upstash Redis · Vercel.

## Run it locally

Requires Node 24 and pnpm.

```bash
pnpm install
cp .env.example .env   # every key is optional
pnpm dev               # http://localhost:4321
```

With no env set, everything still runs: the Users API uses an in-memory store (resets on
restart), analytics is a no-op, and `GET /api/users` is open. Each key is explained in
[`.env.example`](.env.example).

| Command | Does |
|---|---|
| `pnpm dev` | Local dev server |
| `pnpm test` | Vitest unit tests (`src/lib/**/*.test.ts`) |
| `pnpm build` | `astro check` (typecheck) + production build |
| `pnpm preview` | Serve the build |

Before opening a PR: `pnpm test && pnpm build`. CI runs one workflow per check
(`.github/workflows/`): unit tests, typecheck, build and landing JS budget (≤ 20KB gz).

## Try it

```bash
# Create a user
curl -X POST http://localhost:4321/api/users \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"email":"trader.test@gmail.com"}'

# List users (open in dev when USERS_ADMIN_TOKEN is unset; otherwise send the token)
curl http://localhost:4321/api/users \
  -H 'Authorization: Bearer <ADMIN_TOKEN>'
```

## Seeing each experiment variant

`funnel_proof_v1` has two variants: `control` (no signup counter) and `counter` (a signup counter
under the hero CTA and under the `/signup` submit button). A visitor gets one of them, chosen by
the edge middleware, and keeps it on every page and return visit.

**How the variant is chosen.** There is no variant cookie. The middleware reads the `fxr_aid`
cookie (the anonymous visitor id; it mints one on the first visit) and hashes it with the
experiment key (`assign()` in `src/lib/experiments/bucket.ts`), so the same id always lands in the
same variant. That means a fresh browser is roughly a coin flip, and **`fxr_aid` is the cookie to
change** to switch variants.

**Two ways to see the other one (dev and preview only, never production):**

| How | Steps |
|---|---|
| **URL override** (easiest) | Open `/?fxr_variant=counter` or `/?fxr_variant=control`. The override applies to that request only, so keep the parameter on each page you visit, or use the cookie below. |
| **`fxr_aid` cookie** | In DevTools › Application › Cookies, set `fxr_aid` to `qa-0001` (→ `counter`) or `qa-0005` (→ `control`), then reload. It sticks across pages until you change it. Deleting the cookie gets you a new random id, and so a random variant. |

Other ids work too: any 8–64 characters of `A-Z a-z 0-9 _ -` is accepted, and its variant is
whatever `assign('funnel_proof_v1', id)` returns.

**Good to know**

- The override is ignored in production (`VERCEL_ENV=production`), so real traffic can't be steered
  by a URL. Preview deployments honour it.
- `astro dev` doesn't run the root `middleware.ts`; `src/middleware.ts` (dev only) runs the same
  `decideVariant()` instead. **Restart the dev server after changing either middleware**, or the old
  code keeps serving. A server started before the middleware existed always returns `control`,
  whatever the URL or cookie says.
- Opening `/v/counter/` directly redirects (307) to `/`, so nobody can choose a variant by URL. To
  reach the counter copy, go through `/` with the override or the cookie.
- The served page carries its variant on `<html funnel_proof_v1="…">`, so View Source or DevTools
  › Elements tells you which one you got. Control HTML has no counter markup at all.
- Your visits from a browser with `?internal=1` are excluded from analytics (opted out), which is
  handy for QA on production; see `docs/analytics-plan.md`.

## Project layout

```
src/
  pages/            index, signup, v/counter/*, api/users/*
  components/       landing/ (Astro only) · signup/ (React island)
  lib/              framework-free, tests next to each file
    analytics/      events.ts (event map) · client.ts · server.ts
    experiments/    bucket.ts (assignment) · edge.ts (variant routing)
    users/          schema · store (memory | redis) · service · handlers
    signup/         browser client for /api/users, error messages
  styles/           tokens.css (design tokens) · global.css · components.scss
middleware.ts       Vercel Routing Middleware (production)
src/middleware.ts   same logic for `astro dev`
vercel.json         /rly/* → PostHog proxy
docs/               analytics plan, experiment proposal, decisions
CLAUDE.md, .claude/ Claude Code instructions, agents and skills
```

## Deploy

The project deploys to Vercel with the `@astrojs/vercel` adapter. Set the variables from
`.env.example` in the Vercel project; in production set `PUBLIC_POSTHOG_HOST=/rly` to use the
same-origin proxy.
