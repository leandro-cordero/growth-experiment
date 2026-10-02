# Experiment proposal — `funnel_proof_v1`

**Surface:** `/` (hero) and `/signup` (submit) · **Lever:** a live-style signup counter as social
proof · **Status:** running since 2026-09-18 (PostHog experiment 465468, project 614703).
Measurement plumbing: `docs/analytics-plan.md` §5–6.

---

## Hypothesis

We believe that showing **a running count of traders who created a free account**, under the
hero CTA on the landing page and under the submit button on `/signup`, will increase the share
of landing visitors who create an account.

**Why:** this audience's main objection is credibility ("is this legit, will it spam me?"),
not effort. A number of people who already signed up answers it without an outcome claim.
Showing it on both pages keeps the reassurance in view at the two
moments of commitment: the first click and the submit.

## Control

Everyone sees the same offer, worded identically at every CTA: **"Free plan · No credit card"**.

- **Landing:** hero headline, "Create free account" button, offer line. No proof.
- **`/signup`:** email field, "Continue with Google (demo)", "Create free account" button,
  offer line. No proof.

## Variant (`counter`)

Control plus one line below the offer line, in both places:

> **12,480 traders have created a free account**

- The number starts from a fixed base and goes up by one at random intervals (8–20s) while the
  page is open. It is a running total, never "today" or "in the last hour" (CLAUDE.md §5,
  no urgency theatre).
- It sits below the offer line, so the offer doesn't move. Edge middleware serves each visitor
  the prerendered HTML built for their variant, so control pages carry no counter markup and no
  counter script, and there is no flicker and no layout shift (the counter is in the HTML on
  first paint).
- It is text in an `aria-live="off"` element, so screen readers don't announce every tick.
  Under `prefers-reduced-motion` the number still updates, without animation.

### The counter is intentionally simulated

**The count is simulated**: a hard-coded base plus client-side increments. This is a
deliberate scope decision, recorded here so it is not mistaken for real data.

- It breaks the rule in CLAUDE.md §5 / `copy-compliance` C4 ("proof numbers are published
  figures or a live Users API count"). A fake live counter shown to real visitors is deceptive
  social proof (FTC risk), so **this version must not ship to production.**
- The code carries `// TODO(copy): substantiate — simulated figure`, and the page's
  demo notice already says the flow is simulated.
- **Production version:** a public read endpoint, `GET /api/users/count` (cached for ~60s at
  the edge), returns the real total. The island shows it on load and polls it, with no
  client-side increments. The experiment design below doesn't change.

## Success metric

**Primary:** unique visitors with `account_created` ÷ unique visitors with
`landing_page_viewed`, by `$feature/funnel_proof_v1`. This is the headline conversion metric
(`analytics-plan.md` §2): 7-day window, production only, suspected bots excluded.

It is powered on the full funnel, not on one step, because the variant acts on two pages.

**Mechanism checks** (read with the primary, not decisions on their own):
- Landing: `landing_page_viewed → cta_clicked` should rise.
- Signup: `signup_started → signup_submitted` should rise.
- A lift that shows at neither step is not attributable to the counter.

Visitors who arrive straight on `/signup` (no `landing_page_viewed`) are assigned too, but are
outside the primary population. Report them separately.

**Guardrails** (any one tripping stops the test):

| Guardrail | Trips when |
|---|---|
| `landing_page_viewed → cta_clicked` | Variant lower than control: the counter reads as hype |
| `signup_failed` rate | Higher in the variant |
| `is_suspected_bot` share of `account_created` | Materially higher in the variant |
| Profile completion: `profile_updated` ÷ (`profile_updated` + `profile_skipped`) | Variant > 10 pp below control (proof bought low-intent signups) |
| Sample ratio of `landing_page_viewed` by variant | Off 50/50 at p < 0.001 |

## Design

- **Assignment:** deterministic hash of `fxr_aid` + `funnel_proof_v1`, computed at the edge by
  the Routing Middleware, which rewrites counter visitors to the prerendered `/v/counter/*`
  pages. One visitor sees the same variant on both pages and on return visits. Exposure =
  `landing_page_viewed`.
- **Size** (assumptions, not measurements: ~1,000 landing visitors/day, 10% baseline
  landing → account; `n ≈ 16·p(1−p)/Δ²`): **minimum detectable effect +20% relative (2 pp
  absolute), ~3,600 per arm**. At 1,000/day that's ~7 days, run as **2 whole weeks** so
  weekday/weekend and campaign cycles land in both arms.
- A true +10% effect needs ~14,400 per arm (~4–5 weeks) and will read as inconclusive at the
  horizon. That is the most likely failure mode, accepted knowingly.
- **Fixed horizon, no peeking for a winner.** Guardrails are checked daily from day 3; the
  primary is read once, at the horizon.

## Decision

Read once at the pre-registered horizon (≥ 3,600 landing visitors per arm **and** ≥ 2 whole
weeks).

| Outcome | Condition | Action |
|---|---|---|
| **Ship the variant** | Primary lift significant at 95% (two-sided), point estimate ≥ +1 pp, no guardrail tripped, and at least one mechanism check moves the same way | Roll out with the **real** count (`GET /api/users/count`), never the simulated one; record the result |
| **Continue** | Not significant, point estimate ≥ +1 pp, guardrails clean | Extend **once** to 5 whole weeks (powers ~+9% relative). No further extensions |
| **Reject the variant** | A guardrail trips; or the variant is significantly worse; or the point estimate is < +1 pp at the horizon or after the one extension | Keep the control; record the null result |
| **Inconclusive — don't decide** | Sample-ratio failure; horizon not reached; the lift shows at neither mechanism step | Fix the cause and restart the clock |

## What if the traffic is lower

Below ~500 landing visitors/day the fixed test takes over a month. Then: a sequential test with
a pre-registered stopping rule, or qualitative methods (five moderated sessions on the two pages,
an exit micro-survey on `/signup`) instead of an underpowered A/B.

## Not tested

- **Offer wording** (`hero_offer_v1`, free vs trial): dropped. Trial wording is expected
  to lose for a freemium product, so the landing page ships one
  offer, "Free plan · No credit card", everywhere.
- **A published "1M+ traders" figure** as the proof line: a candidate for a later test
  against the real live count. It's a bigger number, but not a live one.
