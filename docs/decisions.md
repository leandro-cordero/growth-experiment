# Decisions

## Styling

### `--blue-950` is ours (#01153a)
The kit's `SEM` maps `btn-bg-primary-disabled` to `blue-950`, but `PRIM` has no
such step. The kit's preview falls back to `#000000`, which makes the disabled button
invisible on the #030303 ground (1.02:1). #01153a continues the kit's own dark-end
ramp (~0.664× per step on G/B from blue-900). It is still only 1.15:1 on
`bg-primary`, so a disabled primary button must also use
`1px solid var(--btn-border-outline)` (3.81:1).

### Button token suffixes
The kit's `-active` means enabled and at rest, not CSS `:active`. `-pressed` is
`:active`. Mapping: `-active` → default, `-hover` → `:hover`,
`-pressed` → `:active`, `-disabled` → `:disabled` / `[aria-disabled]`.

### Contrast additions
- `--text-brand` (blue-600) is 4.02:1 on `bg-primary`, so use it for large text only.
  For brand-coloured text at body size, use `--text-brand-strong` (blue-400, 7.00:1).
- The kit's neutral-50 banner ink fails on the warning fill (2.67:1) and the success
  fill (2.36:1). Those two banners use `--banner-color-on-fill` (dark-900: 7.15 / 8.08:1).
  Error and info banners keep neutral-50.
- `--focus-ring` is blue-500. blue-600 is 2.80:1 on dark-600 (the hovered secondary
  and outline buttons). blue-500 clears 3:1 on every dark ground and on `alternate`.

### Type scale on elements, not utilities
Putting `--text-h2` in `@theme` would reference itself. Headings get their size
from the element; to change the visual size, add a class and leave the heading level alone.
`--text-h3` is fixed at 24px, the WCAG large-text threshold.

### Spacing
Component spacing uses Tailwind's `--spacing` scale. Custom classes use `u.space(n)`.
`global.css` declares `--spacing` in `@theme static` so it is always emitted.
Only the page rhythm (`--space-section`, `--space-gutter`) has its own clamp() tokens.

### No mono family
The kit document uses JetBrains Mono for its own labels, but its Typography section
defines a two-family system. We don't use a mono family.

### Fonts: Astro Fonts API + Fontsource
- The files are downloaded at build time and served from our own origin. That avoids
  a third-party connection to fonts.googleapis.com / gstatic and a render-blocking
  stylesheet.
- Astro generates metric-adjusted fallback faces (Arial with size-adjust), which
  keeps CLS from the font swap near zero. It also uses `font-display: swap`.
- Subsets: latin only, normal style only. Lato comes as static 400/700/900 files
  (the weights the kit requests). Nunito Sans is one variable file covering 400–700.
- Preload: Lato 900 only, because it renders the h1 (the likely LCP). §8 allows
  preloading at most one face. Nunito Sans (~80KB variable) loads on demand.

### Depth model: surface, then gradient, then one shadow
The original rule was "depth is surface + border; shadow for the modal only". On a
page where every section shares `--bg-primary` and a `--border-primary` hairline, that
produced a flat, templated look. The model is now three graded steps:

1. **Surface** — `--bg-primary` → `--bg-secondary` (bands) → `--bg-elevated` (cards).
2. **Gradient** — `--gradient-hairline` on a band's top edge and a card's top edge, and
   `--bg-page-glow` as a decorative brand halo behind the hero and the final CTA.
   All decorative, all non-text, none of it carries meaning.
3. **Shadow** — `--shadow-card` on `.step-card` only, and `--shadow-brand-glow` on the
   CTA's hover/focus. `--shadow-overlay` is still the modal's alone.

`--shadow-brand-glow` is **additive** to the `:focus-visible` outline, never a
replacement — the outline in `global.css` is what satisfies the a11y floor.

### Gradient text needs a colour fallback
`.headline-accent` declares `color: var(--text-primary)` first and only applies
`background-clip: text` inside `@supports`. Without the base declaration, a browser
that parses `color: transparent` but not the clip renders invisible text. The
gradient's dark end is `--blue-300` (9.3:1 on `--bg-primary`), so even the lowest-
contrast pixel clears AA at body size, not just at display size.

### `overflow-x: clip` on body
The hero wash (`.hero-chart::before`, `inset: -12% -8%`) bleeds outside the figure by
design. `clip` — not `hidden` — contains it without creating a scroll container, so
the sticky header and `scroll-padding` keep working.

### Visual layer ported from the earlier build
`styles/components.scss` (BEM, all in `@layer components`) and the components that use it came
across from the first build of this project, so the page matches the design system already
documented above. Markup and class names only: the experiment, events, logic and approved
copy are unchanged.

**Came across:** the animated hero chart (`HeroChart.astro`, `lib/replay-bars.ts`), the site
header and mobile sticky CTA, the eyebrow and gradient headline accent, step cards, the styled
FAQ and `.legal` disclosure, the `.cta` link with its arrow, the page backdrop and skip link, and
the whole `.signup__*` layer (`SignupIcons.tsx`). Tokens, `global.css` and `_utils.scss` were
already the same, so nothing was added to them. A `.proof-counter` block was added
(`font-variant-numeric: tabular-nums`, so the counter doesn't change width as it ticks).

**Left out, and why:**
- `TrustBar`: it shows proof ("1M+", "4.7/5") to **both** variants. Control must carry no
  proof or `funnel_proof_v1` is invalid, and its Trustpilot figures were placeholders (CLAUDE.md §5).
- `ConsentBanner` and `.consent*`: there is no consent banner (out of scope).
- `IdentityBoot`, `inline-boot`, `HERO_OFFER` and `CtaOffer`'s two variants, with their
  `.cta-offer__variant*` and `:root[data-exp-offer]` rules: the variant is now chosen at the edge
  (see "Variants served at the edge"). `.cta-offer` stays as the single offer-line class.
- All old copy ("Free forever", the trial, "No auto-upgrade", the old FAQ and headings). The only
  new strings are decorative: the eyebrow, the chart's top bar and the chart caption.

**Adjustments:** `.legal` has no `<summary>` (the new footer copy has no disclosure label), so it
is a plain visible block and `.legal__body` pads all sides. The demo line stays visible, since
CLAUDE.md §5 requires saying that auth is simulated. The header and sticky CTAs send
`cta_clicked` with `cta_position` `header` / `sticky`.

## Landing page

### Zero React on the landing route
Every section is `.astro`. The only JS is the sticky mobile CTA (IntersectionObserver,
inline module). The React client chunk is still emitted by the integration but is not
referenced by `index.html`.

### Hero chart is static (interactive replay E.1 cut from v1)
Synthetic OHLC bars from a seeded PRNG (`src/lib/replay-bars.ts`) rendered to inline SVG
at build time. Labelled BTC-USD by product decision and captioned
"Synthetic, hypothetical / illustrative data". `viewBox` + width/height keep CLS at zero.

### The replay loop is CSS, not JS
The chart now animates, but E.1 (real play/pause/step controls) is still cut. A
`<clipPath>` rect widens `0 → cursorX` on a `steps(44)` timing function, so bars appear
one at a time rather than wiping smoothly — a smooth wipe reads as a loading bar. The
cursor rides the same timing with a `translateX`, and the "not yet replayed" shading
tracks it for free: the `--chart-future` rect covers the whole plot and a
`--bg-secondary` rect inside the clip paints back over the replayed part.

It is decoration, not a control: nothing is announced, the `<title>`/`<desc>` are
unchanged, and it ships zero JS. Under `prefers-reduced-motion` the animation is pinned
explicitly to its completed frame — the global `0.01ms` override alone would happen to
land there, but relying on that is accidental, not a decision.

### Monochrome candles
Up = hollow neutral-50, down = filled neutral-400. Shape carries direction, not
red/green, and blue stays reserved for the CTA and the replay cursor.

### CTA link has no disabled/loading state
It is plain navigation; the browser shows progress. Documented so reviewers do not
flag it as incomplete.

### Variants served at the edge
A visitor receives **only their own variant's HTML**. Vercel Routing Middleware (root
`middleware.ts`, edge) reads or mints `fxr_aid`, calls `assign('funnel_proof_v1', aid)`, and
rewrites counter visitors to the prerendered `/v/counter/` and `/v/counter/signup`. Control
visitors get the normal `/` and `/signup`. Pages stay static and CDN-served, the counter is in
the HTML on first paint (no flicker, no CLS), and control HTML has no counter markup and no
counter script. This replaced an earlier design that shipped both markups and hid one with CSS
and a head script.

- **One tested function**, `decideVariant()` in `lib/experiments/edge.ts`, returns `next`,
  `rewrite` or `redirect` plus the cookies. Two thin wrappers call it: the root `middleware.ts`
  (production) and `src/middleware.ts` (dev only: `astro dev` doesn't run Vercel middleware; in a
  build, Astro middleware only runs at prerender time, so the `DEV` guard makes it a no-op).
- **Direct hits on `/v/*`** get a 307 to the public path, so nobody can pick a variant by URL
  (that would skew the sample ratio).
- **QA override** `?fxr_variant=control|counter` works only when `VERCEL_ENV` isn't `production`.
- **Variant pages** carry `noindex` and a canonical to the public path. The page is one component
  (`LandingPage.astro`, `SignupPage.astro`) with a `variant` prop; only the counter route imports
  `ProofCounter.astro`, via a `proof` slot.
- **Cache note:** each variant path is cached separately at the CDN. The middleware runs before
  the cache and adds the cookies, so a cached page never carries another visitor's id.
- **New dependency:** `@vercel/functions` (`next`, `rewrite` for Routing Middleware). It is
  small, official, and the only way to rewrite at the edge outside Next.js.
- **Unverified:** that Vercel picks up a root `middleware.ts` alongside the Astro adapter's Build
  Output. Fallback: make `/` and `/signup` on-demand (`prerender = false`) and pick the variant
  in the frontmatter from the cookie, at the cost of one function invocation per page view.
The landing offer is the same for every visitor: "Free plan · No credit card".

### Tailwind name collisions
`text-sm`, `text-xs`, `rounded-*`, `leading-*`, `ease-out`, `tracking-tight` resolve to our
tokens because `tokens.css` redefines the same custom properties. Unmapped defaults
(`text-lg`, `text-5xl`, `rounded-xl`) are off-system: use `text-(length:--token)`.

## Signup + Users API

Full contract: `docs/users-api.md`.

### Signup lives on its own prerendered `/signup` page
The island is `client:load` because it sits above the fold and is interactive on
arrival. The landing page loads none of its JS. First load on `/signup` is about 74KB gzipped
(React runtime 66KB plus the form 5KB). `posthog-js` (~94KB gz) is dynamically imported
on idle. Zod is server-only: the island imports types from `schema.ts`, and runtime
values from the zod-free `email.ts` and `instruments.ts`.

### No password, simulated auth
There is no login to use a password with, and storing one means hashing and liability.
The form asks only for the email. "Continue with Google (demo)" is a labelled fake
door: it records `signup_started {method: google}` and never creates a user.
Production path: magic link or real Google OAuth (e.g. Supabase Auth). We rejected a
hosted auth provider because it would own the Users API this project is meant to design.

### Storage: Upstash Redis, in-memory fallback
Vercel function instances don't share memory, so an in-memory store can show a new
user as missing from the list. Upstash is HTTP-based, so it suits serverless. `SET NX` gives
atomic email uniqueness and idempotency locks. With the env vars missing, `deps.ts`
falls back to the memory store and logs one dev warning. Keys are prefixed with
`VERCEL_ENV`, so one database serves prod, preview and dev. Postgres with a unique email
constraint is the production path.

### Create order and partial failure
1. Validate (no side effects).
2. Claim the idempotency key.
3. `SETNX` the email lock.
4. Write the user (MULTI).
5. Save the response under the key.
6. Send `account_created`.

If step 4 fails, the email lock and the key are released so a retry isn't blocked, and
the API returns 503 retryable. If saving the response (step 5) fails, the user still
gets the 201.

### Idempotency
A client sends one `Idempotency-Key` per logical attempt, with the exact same body bytes
on retries. Same key + same body replays the stored response with
`Idempotency-Replayed: true` and no second event. Same key + different body returns 422.
A key still in flight returns 409 retryable. The 409/422 split follows the IETF
Idempotency-Key header draft. The form keeps the key across retryable failures (network,
503) and mints a new one after non-retryable ones.

### `account_created` is server-side
It is sent from the API after the write, so ad blockers can't drop the primary conversion.
It uses `captureImmediate` + `aliasImmediate` (anonymous id → user id) with a 1.5s
timeout. A PostHog failure is logged and never fails the signup. Cost: up to 1.5s of
extra latency on a PostHog outage. `waitUntil` is the upgrade.

### Identity
The edge middleware sets `fxr_aid` (1 year, SameSite=Lax, **not** HttpOnly: PostHog's bootstrap
reads it) and `fxr_ret` (session; `1` if the id existed before the request, for `is_returning`).
Server-set cookies aren't subject to Safari's 7-day cap on JS-set ones. `client.ts` stores
campaign touches: first touch in the `fxr_ft` cookie (90 days, write-once, JS-set, so still
capped on Safari), last touch in `sessionStorage`. PostHog bootstraps with the same id.

### Experiment handoff contract (`funnel_proof_v1`)
- The variant lives on `<html funnel_proof_v1="counter">`, written at build time by `BaseLayout`
  for the copy being built (see "Variants served at the edge"), so it always equals the HTML that
  was served. `assign()` in `bucket.ts` is the only assignment function.
- Client code reads the `<html>` attributes: `client.ts` registers one `$feature/<key>` super
  property per experiment, and the signup form sends a flat `experiments` map
  (`readAssignments()`) in `POST /api/users` (`null` for a missing entry), so `account_created`
  carries the variants.
- The server trusts that map after `cleanExperiments()` (see below).
- CTA links use `/signup?entry=<cta_position>`, which becomes `signup_viewed.entry_point`.

### Bots and email quality
- Honeypot field filled: fake 201, nothing stored, no event.
- `time_to_submit_ms < 1500`: stored and tracked with `is_suspected_bot: true`, not
  blocked, because the timing is client-reported and so a weak signal.
- Only emails from an allowlist of common providers (Gmail, Outlook, iCloud, Yahoo, Proton...)
  can register, checked in the island and the API. It blocks temp-mail with no blocklist to
  maintain; the accepted cost is that company domains are rejected. The field hint states the
  rule up front. Upgrade path: a maintained disposable blocklist instead of an allowlist.
- `email_domain_type` (free / corporate / disposable) comes from a small bundled list and
  is a classification only.
- Emails are trimmed and lowercased. Gmail dots and plus tags are kept, because folding
  them would be provider-specific guesswork.

### List access
`GET /api/users` needs `Bearer USERS_ADMIN_TOKEN`. With no token set, it is open in dev
and returns 404 in production. Pagination is offset-based: concurrent signups can shift
pages, and score-based cursors are the upgrade. A 409 on duplicate email reveals that an
account exists. We accept that for conversion copy; rate limiting (not built) is the
mitigation.

### Server errors survive blur
A server field error (email taken) stays until the email is edited. Re-validating on
blur cleared it, the button moved up ~30px between mousedown and mouseup, and the retry
click missed.

## Analytics

PostHog. `src/lib/analytics/events.ts` is the only place event names exist; `EVENTS`
says whether each one is sent from the browser or the server, and `satisfies` fails the
build if the two drift apart.

### The funnel

`landing_page_viewed` → `cta_clicked` → `signup_viewed` → `signup_started` →
`signup_submitted` → **`account_created`**.

- **Primary metric:** unique visitors with `account_created` ÷ unique visitors with
  `landing_page_viewed`, within a 7-day window, `app_env = production`, suspected bots
  excluded. It is its own two-step funnel, so losing a middle step never moves the
  headline number.
- The step-by-step funnel is the diagnostic. Breakdowns: last-touch `utm_source` /
  `utm_campaign`, `first_touch_utm_source`, `$feature/<key>`, device.
- Built in PostHog: dashboard "Try TradingFX Free — signup funnel" (project 614703).

### Consent

Consent banner is out of scope. It should only be taken as something for next iterations. Not added now.
Events are sent for every visitor and no event carries a consent property.

### Why it can be trusted

- **Exactly once.** Idempotent replays and honeypot hits send nothing. `account_created`
  carries a deterministic `uuid` (`accountCreatedUuid(user_id)`: SHA-256 of `account_created:<user_id>`) and the
  stored `created_at` as its timestamp, so re-sending a missed conversion cannot double
  count it. PostHog applies its own clock-skew correction, so the ingested timestamp can
  land about a second after `created_at`; the uuid is what makes a re-send safe.
- **Clicks that navigate.** `cta_clicked` used to go through `track()`, which queues or
  batches, and the navigation to `/signup` dropped it every time (seen in PostHog: `signup_viewed`
  with `entry_point=hero`, no `cta_clicked`). `trackNavigation()` sends it by `sendBeacon` when
  posthog-js is loaded; otherwise it stores it in `sessionStorage` (`fxr_handoff`, 30-minute
  expiry) and the next page sends it with the click's timestamp. A fixed `uuid` makes a double
  send count once. Its `$current_url` is the page that sent it (`/signup` on a handoff);
  `cta_position` carries the where.
- **The alias direction.** `aliasImmediate({ distinctId: user_id, alias: anonymous_id })`
  — the identified user first, the anonymous id as the alias being merged in. It runs
  after the capture, not in parallel with it.
- **Environments.** Every event carries `app_env`. One project; non-production traffic is
  excluded in one place (Filter out internal and test users). `?internal=1` opts a browser
  out for QA on production.
- **Ad blockers.** `vercel.json` rewrites `/rly/*` to PostHog, so requests are same-origin.
  Set `PUBLIC_POSTHOG_HOST=/rly` in production; leave the PostHog URL locally, since
  `astro dev` does not apply those rewrites. The server always uses `POSTHOG_HOST`.
- **Reconciliation.** Weekly: the `GET /api/users` count for the window should equal the
  production `account_created` count (a gap means events were lost to the 1.5s timeout,
  which is logged), and `account_created` ÷ unique `signup_submitted` should sit around
  0.8-1.0. Re-sending a missing user is safe because of the deterministic uuid.
- **Schema.** Types at compile time (`satisfies`, plus a test that no event property
  shadows a super property), a dev-only runtime check in `track()` for snake_case, flat
  values, no `undefined` and no `@`, and a test that `posthog-js` and `posthog-node` are
  imported nowhere but their own wrapper.
- **No sampling, no autocapture, no session replay.** Only events from the map are sent.

### Experiment

`funnel_proof_v1` is bucketed by our own edge middleware, because the HTML has to be chosen
before it is sent. PostHog does not evaluate the flag; the assigned variant is reported as
`$feature/<key>`, which is what PostHog's experiment analysis reads. `edge.test.ts` checks that
`decideVariant()` agrees with `assign()` and covers the redirect and the QA override.

### Hash finaliser, so future experiments stay independent
`hash()` is FNV-1a 32-bit followed by murmur3's `fmix32`, and `assign()` buckets on the
high bits (`h / 2**32`). Plain FNV-1a has a weak low bit: `% 2` would be a parity of the
id and correlate two experiments perfectly. Only one experiment is registered now, so
`bucket.test.ts` checks the split (50 ± 2%) for `funnel_proof_v1` and, at the `hash` level,
that two arbitrary key prefixes fill all four cells of the 2×2 at 25 ± 2%. That guard is
for the next experiment.

### The server cleans the `experiments` map, it doesn't recompute it
`POST /api/users` carries the client's assignment. `cleanExperiments()` keeps registered
keys with a valid variant, nulls the rest and drops unknown keys, and never rejects the
request, so a stale tab can't fail a signup. A forged variant can skew the numbers of that
one user, which is acceptable here. Recomputing `assign(key, anonymous_id)` on the server is
the hardening step.

### `person_profiles: 'always'`
Anonymous visitors need a person profile so `alias` on signup merges their pre-signup
events into one person. The cost is more person records; there is no session replay or
autocapture to offset it.

### Proposed experiment: `funnel_proof_v1`
One experiment, `control` / `counter`: a signup counter under the landing hero CTA and under
the `/signup` submit button. It is the proposal in `docs/experiment-proposal.md`. It replaces
`hero_offer_v1` (offer wording) and `signup_proof_v1` (a proof line on `/signup`), both dropped
before any traffic, and the email-gate brief before them (its ≥4% hard-block pre-flight
threshold was unlikely to be met; allowlist vs blocklist is a policy choice named above).

### One `$feature/<key>` per experiment
Replaces the single `experiment {key, variant}` body field and the `experiment_key` /
`experiment_variant` super properties. Each event and the `POST /api/users` body carry a flat
`$feature/<key>` per registered experiment (today only `$feature/funnel_proof_v1`), `null` when
not enrolled. The shape stays a map so a second experiment needs no schema change.

### Simulated proof counter
The counter is **intentionally simulated**: it sends no events and reads no data.
**It must not ship.** A made-up "N traders signed up" figure is an unsubstantiated claim
(CLAUDE.md §5, and "N signed up today" is urgency theatre). In production the counter reads a
public, edge-cached `GET /api/users/count` (the real number of accounts), served with a short
`s-maxage` and `stale-while-revalidate`, so it costs no function invocation per visitor. Until
that endpoint exists, the variant is a mechanism demo only.
