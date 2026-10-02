# CLAUDE.md — Try TradingFX Free

  A marketing landing page, a signup flow and a Users API. **Goal: raise the conversion
  rate from marketing traffic to account creation.** Every change should either move that
  number or make it measurable. Keep it small, explainable and production-minded. If a
  layer, package or abstraction can't be defended in a short review, don't add it.

  Source of truth: this file, `docs/`, and `src/styles/tokens.css` for design tokens.

  ---

  ## 1. Stack & commands

  Astro 7 (static-first) · React 19 islands · TypeScript strict · Zod 4 (server only) ·
  Tailwind v4 · PostHog (posthog-js + posthog-node) · Upstash Redis · Vercel.
  Package manager: **pnpm**.

  | Command | Does |
  |---|---|
  | `pnpm dev` | local server (in-memory store if the Upstash env is missing) |
  | `pnpm test` | vitest: `lib/**/*.test.ts` |
  | `pnpm build` | `astro check` + build. Also our typecheck |

  Verify before claiming it works: `pnpm test && pnpm build`. Copy, style and doc-only
  changes are exempt.

  ---

  ## 2. Naming

  - Files: `kebab-case.ts`; components `PascalCase.tsx` / `PascalCase.astro`.
  - Events: snake_case `object_action`, past tense (`cta_clicked`, `account_created`).
  - Event properties: snake_case, flat, primitives. `null`, never an omitted key.
  - Env: `SCREAMING_SNAKE`; `PUBLIC_` prefix **only if** the browser may read it.
  - Experiment keys: `<surface>_<lever>_v<n>` (`funnel_proof_v1`). Variants: `control` + a descriptive name.

  ---

  ## 3. Styling

  - Design tokens live in `src/styles/tokens.css`: **primitives** (`--blue-600`) and **semantic**
    (`--text-primary`, `--bg-elevated`). Components use semantic tokens only; primitives
    appear in `tokens.css` alone.
  - Components use Tailwind utilities for basic styling and spacing. If a component
    needs custom styling, or the utility list gets too long, it gets a class in its own
    section of `src/styles/components.scss`. Use BEM class naming convention for custom classes.
  - **A custom class and Tailwind utilities never go on the same element.** Pick one.
  - Spacing and radius use Tailwind's scale; the tokens supply colour and font families.
  - Fonts: Lato (display) and Nunito Sans (body) via the Astro Fonts API, self-hosted.
    Preload Lato 900 (h1) only. Never a Google Fonts `<link>`.
  - Decisions and exceptions go in `docs/decisions.md` › Styling.

  ---

  ## 4. Accessibility floor (a merge condition)

  - Landmarks `header`/`main`/`footer`; exactly one `h1` per page; logical heading order.
  - Every input has a real `<label>`; errors are tied with `aria-describedby`; an
    `aria-live="polite"` region announces submit, error and success.
  - Visible `:focus-visible` everywhere; keyboard operable; `prefers-reduced-motion` honoured.
  - Status is never colour alone (error = text + labelled icon).
  - Targets ≥ 44×44px at 390px wide. Contrast AA.
  - Every interactive element implements default/hover/focus/active/disabled and, where
    relevant, loading/error/success.
  - Target: zero axe violations on `/` and `/signup`.

  ---

  ## 5. Copy & compliance (retail-trading audience)

  Use the `copy-compliance` skill for any user-facing text.
  - **No income, P&L, win-rate or account-growth claims.** A disclaimer doesn't cure
    them (FTC Endorsement Guides, 2023 revision).
  - Simulated or backtested figures and charts are labelled **"hypothetical / illustrative"**.
  - Educational framing: practice, test, replay, review. Never profit.
  - Proof numbers are published figures (source in a code comment) or a live
    Users API count. Otherwise `// TODO(copy): substantiate` and it doesn't ship.
  - No urgency theatre (countdowns, fake scarcity, "N signed up today").
  - One offer per page per experiment variant, worded identically at every CTA.
  - Auth is simulated; say so in the UI and the README.

  ---

  ## 6. Performance budget

  - Mobile budget: LCP < 2.0s (4G), INP < 200ms, CLS < 0.05. Landing: **zero React**,
    ≤ 20KB gz first-party JS. `/signup`: ≤ ~120KB gz first load.
  - The variant is chosen at the edge (`middleware.ts`), not in the browser: no inline script, no flicker.
  - posthog-js is dynamically imported on idle. Nothing third-party blocks render.
  - Images: explicit width/height, `astro:assets`. SVG for charts.
  - SEO: unique title (≤ 60 chars) + description (≤ 155), canonical, OG/Twitter,
    `robots.txt`, sitemap, JSON-LD (`Organization` + `SoftwareApplication`, with `offers.price: 0`).

  ---

  ## 7. Project structure

  ```
  docs/
    decisions.md             short "why" entries by area; append when a choice is non-obvious
    analytics-plan.md        funnel, taxonomy, data quality 
    experiment-proposal.md   funnel_proof_v1 proposal
  public/                    favicon, og image, robots.txt
  vercel.json                /rly/* → PostHog rewrite (ad-block-resistant ingestion)
  middleware.ts              Vercel Routing Middleware (edge): picks the variant, rewrites to /v/counter/*
  src/
    middleware.ts            Astro middleware, DEV only: same decideVariant() for `astro dev`
    pages/
      index.astro            landing (control): prerendered, zero React
      signup.astro           signup (control): prerendered, hosts the SignupForm island
      v/counter/             the counter variant's copies of / and /signup (noindex, canonical to public path)
      api/users/index.ts     POST create · GET list (admin)   prerender = false
      api/users/[id].ts      PATCH update (profile)            prerender = false
    layouts/BaseLayout.astro <head>: SEO, <Font>, <html funnel_proof_v1> variant, analytics loader
    components/              Components per domain/feature
    lib/                     framework-free; tests sit next to the file
      analytics/
        events.ts            THE event map (names, props, client|server)
        client.ts            track(): lazy posthog-js, super properties, never throws
        server.ts            posthog-node: accountCreated(), time-boxed, never throws
      experiments/
        bucket.ts            EXPERIMENTS registry + deterministic assign(); used by the edge and the API
        edge.ts              decideVariant(): pure next/rewrite/redirect + cookies; used by both middlewares
      users/
        schema.ts            zod request/response schemas (server only)
        store.ts             Store interface · memoryStore · redisStore (chosen by env)
        service.ts           create/update/list; emits account_created
      signup/api.ts          typed browser client for /api/users
    styles/                  tokens.css · global.css · components.scss (BEM classes) · _utils.scss
  ```
  
  - A new top-level folder, dependency or abstraction gets an entry in `docs/decisions.md`.

  ---