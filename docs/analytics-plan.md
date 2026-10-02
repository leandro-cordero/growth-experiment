# Analytics plan

Analytics is part of the product: the event map is typed code, the conversion is sent from the
server, and every number below has a named way to be checked. Decisions and their reasons live
in `docs/decisions.md` › Analytics. This doc is the single readable summary. Once built, `src/lib/analytics/events.ts` is the source of truth
for names and properties; if it and this doc disagree, the code wins and this doc is fixed.

---

## 1. Architecture and tooling

**PostHog Cloud** — `posthog-js` in the browser, `posthog-node` on the server.

- **Why PostHog:** funnels, feature-flag reporting, experiment analysis and identity stitching in
  one SDK. GA4 would need GTM plus a separate experimentation tool.
- **What we'd add in production:** GA4 via GTM for ad-platform conversion import (Google Ads,
  Meta), fed from the same server-side `account_created`. A CDP (Segment) and a warehouse are
  the long-term answer and the wrong 6-hour answer.

```
browser                                  server (Vercel function)
 track() ───────────────────────► /rly/* ──rewrite──► PostHog ◄── posthog-node
  (lazy posthog-js, on idle)     (same-origin proxy)             account_created
                                                                 (after the DB write)
```

| Piece | Role |
|---|---|
| `lib/analytics/events.ts` | The only place event names exist; each marked `client` or `server`. `satisfies` fails the build if they drift. |
| `lib/analytics/client.ts` | `track()`: lazy-loads posthog-js on idle, registers super properties, never throws. |
| `lib/analytics/server.ts` | `accountCreated()`: 1.5s time box, never fails a signup. |
| `vercel.json` `/rly/*` | Same-origin proxy so ad blockers don't drop client events. |

## 2. Conversion funnel

```
landing_page_viewed → cta_clicked → signup_viewed → signup_started → signup_submitted → account_created
      (entry)                                                                          (conversion)
```

- **Funnel entry:** `landing_page_viewed`.
- **Intermediate steps:** `cta_clicked` (which CTA), `signup_viewed` (arrived, with
  `entry_point`), `signup_started` (first intent), `signup_submitted` (request sent).
- **Primary conversion event:** `account_created`, sent by the server after the user is written.
- **Primary conversion metric:** unique visitors with `account_created` ÷ unique visitors with
  `landing_page_viewed`, 7-day window, `app_env = production`, `is_suspected_bot = false`.
  Computed as its own two-step funnel, so a lost
  middle event never moves the headline number.
- **Diagnostic:** the full step funnel, broken down by last-touch `utm_source`/`utm_campaign`,
  `first_touch_utm_source`, `device_type`, `entry_point`, and each `$feature/<key>`.
- **Target band:** 10–15% landing → account for a dedicated freemium "try free" page
  `[benchmark, small B2B-weighted sample]` — a yardstick, not a promise.

## 3. Events

| Event | Side | Trigger | Properties | Answers |
|---|---|---|---|---|
| `landing_page_viewed` | client | landing module script, once per load | `is_returning` | Funnel entry; experiment exposure for `funnel_proof_v1`; sample-ratio check |
| `cta_clicked` | client | one delegated listener on `[data-cta-id]`, sent with `trackNavigation()` (beacon, or handed to `/signup` if posthog-js hasn't loaded) | `cta_id`, `cta_label`, `cta_position` (`hero`/`header`/`sticky`/`final`…) | Which CTA position drives signups |
| `signup_viewed` | client | `SignupForm` mount | `entry_point` (from `?entry=`) | Landing → signup handoff; exposure for visitors who land directly on `/signup` |
| `signup_started` | client | first field focus, or the Google button | `method` (`email`/`google`), `field_first_touched` | Friction before the first keystroke |
| `signup_field_errored` | client | client validation or a server field error | `field`, `error_code`, `error_source` (`client`/`server`), `attempt_n` | Where validation friction is |
| `signup_submitted` | client | after the request is sent | `method`, `time_to_submit_ms`, `attempt_n` | Form completion; client side of reconciliation |
| `signup_failed` | client | failed outcome | `error_code`, `http_status`, `retryable` | API-failure guardrail |
| `account_created` | **server** | `service.ts`, after the write | `user_id`, `method`, `email_domain_type` (`free`/`corporate`/`disposable`), `is_suspected_bot`, `anonymous_id`, `$feature/<key>` per experiment | **The conversion**, safe from ad blockers |
| `profile_updated` / `profile_skipped` | client | the post-signup profile step | — | Lead-quality proxy (the only one without a product) |

Conventions (CLAUDE.md §2): `object_action`, past tense, snake_case; properties flat primitives,
`null` instead of an omitted key. No autocapture, no session replay, no sampling: only events
from the map are sent.

### Super properties (user / session context)

Registered once in `client.ts`, never repeated in an event:
`anonymous_id`, `app_env`, `utm_*` (always last touch), `first_touch_utm_source`,
`first_touch_utm_campaign`, and one `$feature/<experiment_key>` per experiment
(`null` when not enrolled). PostHog adds device, browser, OS, coarse geo and `$session_id`.

### Identity

1. The edge middleware (root `middleware.ts`) sets `fxr_aid` (first-party server cookie, 1 year,
   `SameSite=Lax`, readable by JS) and `fxr_ret` (`1` if the id existed before the request; feeds
   `is_returning`). PostHog bootstraps with the same id, so pre-signup events share one distinct
   id. `astro dev` doesn't run Vercel middleware, so `src/middleware.ts` (dev only) wraps the same
   `decideVariant()`.
2. First touch goes in `fxr_ft` (90 days, write-once), last touch in `sessionStorage`.
3. `POST /api/users` carries `anonymous_id`. The server aliases the anonymous id into the new
   `user_id` **after** capturing `account_created`, so the whole pre-signup path joins the user.
4. Email is never a distinct id or an event property.

Safari ITP's 7-day cap applies to JS-set cookies, not server-set ones, so `fxr_aid` survives. The
first-touch cookie `fxr_ft` is still JS-set, so first-touch attribution is weaker on Safari.

## 4. Making the data trustworthy

| Risk | What we do | How we'd notice it failing |
|---|---|---|
| Ad blockers drop the conversion | `account_created` is server-side; client events go through the `/rly` proxy | Reconciliation below |
| Double counting | Idempotency-Key on `POST /api/users`; replays and honeypot hits send nothing; `account_created` has a deterministic uuid, so a re-send dedupes | `account_created` count > stored users |
| Lost conversions | 1.5s capture time box, failures logged | Weekly: `GET /api/users` count for the window = production `account_created` count |
| Client/server mismatch | — | Weekly: `account_created` ÷ unique `signup_submitted` should sit around 0.8–1.0 |
| Test traffic | Every event carries `app_env`; one "internal and test users" filter; `?internal=1` opts a browser out | Non-production `app_env` in production insights |
| Bots | Honeypot (fake 201, nothing stored); `time_to_submit_ms < 1500` flagged as `is_suspected_bot`, not blocked (client-reported, weak) | Bot share on the dashboard |
| Low-quality emails | `email_domain_type` classification; report conversion with and without `disposable` | Disposable share on the dashboard |
| Schema drift | Typed map + `satisfies`; test that no event property shadows a super property; dev-only runtime check for snake_case, flat values, no `undefined`; test that the PostHog SDKs are imported only in their wrappers | Build/test failure |

## 5. Experiment properties

One experiment runs: `funnel_proof_v1` (`control` / `counter`), a signup counter under the
landing hero CTA and the `/signup` submit button. Every client event carries one flat
`$feature/<key>` super property per registered experiment (`null` when not enrolled), the name
PostHog's experiment analysis reads. The `POST /api/users` body sends the same values as
`experiments` (a flat key → variant map, `src/lib/users/schema.ts`), which the server cleans
against the registry and copies onto `account_created`. The shape takes more than one
experiment without a schema change.

## 6. Experiment instrumentation

- **Assignment:** deterministic FNV-1a hash (with a finaliser) of `fxr_aid` + experiment key
  (`lib/experiments/bucket.ts`), computed at the edge by `decideVariant()`
  (`lib/experiments/edge.ts`, called by the root `middleware.ts`), so no flicker and no flag
  request. Counter visitors are rewritten to the prerendered `/v/counter/*` pages. A visitor gets
  the same variant on the landing page, on `/signup` and on return visits. Direct hits on `/v/*`
  get a 307 to the public path, so nobody can pick a variant by URL (that would skew the sample
  ratio). `?fxr_variant=control|counter` is a QA override honoured only when `VERCEL_ENV` is not
  `production`.
- **Exposure:** `landing_page_viewed` with `$feature/funnel_proof_v1` set. Visitors who arrive
  straight on `/signup` are exposed at `signup_viewed` and reported outside the primary
  population.
- **Conversion:** `account_created` carries the same `$feature/<key>` values, sent in the
  `POST /api/users` body.
- **The counter is simulated** (a fixed base plus client-side ticks), so it
  sends no events and reads no data. Production replaces it with a real `GET /api/users/count`
  (see `experiment-proposal.md` › The counter is intentionally simulated).
- **Sample-ratio check:** exposures per variant against 50/50; a deviation at p < 0.001 makes a
  result inconclusive.
- Full design and decision rules: `docs/experiment-proposal.md`.

## 7. Dashboard

"Try TradingFX Free — signup funnel" in PostHog:

1. **Headline:** primary metric, daily and 7-day.
2. **Funnel:** the six steps, broken down by source, device, `entry_point` and variant.
3. **Experiment:** per `$feature/<key>`: exposures, primary metric, guardrails.
4. **Data quality:** stored users vs `account_created`; `account_created` ÷ `signup_submitted`;
   bot share; disposable share; `signup_field_errored` by
   `field` × `error_code`; median `time_to_submit_ms`.

## 8. Not built, and next

- **Consent management (out of scope).** Events are sent without a consent step, so there is
  no consent property anywhere. In production, EU/UK traffic needs a consent banner before
  non-essential cookies; that is a next iteration and would also need the server-side
  conversion and the client-side denominator to describe the same population.
- **A real signup count.** The proof counter is simulated. Production needs a
  public, edge-cached `GET /api/users/count` read from the store; without it the variant must not
  ship.
- `scroll_depth` / section-in-view events: a bounce and a full read that ends in a close are
  the same row today.
- Web-vitals events (`lcp`, `inp`, `cls`) from real users.
- GA4/GTM conversion import; a warehouse with modelled funnels.
- `activation_first_session` — there is no product to activate in. In production it is the
  guardrail that stops a signup lift from being bought with worse leads.
