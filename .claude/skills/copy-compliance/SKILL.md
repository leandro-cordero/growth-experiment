---
name: copy-compliance
description: Write, rewrite or review user-facing copy for "Try TradingFX Free" so it converts better and stays legally compliant for a retail-trading audience. Use for headlines, CTAs, microcopy, FAQ, trust/proof blocks, form labels and errors, success states, meta titles/descriptions, and any text a visitor reads.
---

# Copy: persuasive and compliant

Two jobs at once: **make the copy do more conversion work** and **keep it defensible**.
Compliance is a hard filter. Persuasion happens inside it, never by bending it.
This is not legal advice. When something is unclear, cut the claim and flag it.

Read `CLAUDE.md` §5 first. For offer/proof context, read `docs/experiment-proposal.md`.

## 1. Compliance gate (any fail = rewrite, no exceptions)

| # | Rule | Fails | Passes |
|---|---|---|---|
| C1 | No income, P&L, win-rate, account-growth or "become profitable" claims, even implied | "Traders grow accounts 3× faster" · "Stop losing money" | "Test a strategy on past data before you risk real money" |
| C2 | Simulated/backtested figures and charts labelled **"hypothetical / illustrative"** next to them | An unlabelled equity curve | Caption: "Hypothetical / illustrative data" |
| C3 | Educational framing: practice, test, review, replay, journal | "profit", "make money", "guaranteed", "beat the market" | "practice", "sharpen", "review your trades" |
| C4 | Proof numbers are published figures (cite the source in a comment) or a live Users API count. Otherwise leave `// TODO(copy): substantiate` and don't ship the number | "Trusted by 2M traders" (unsourced) | A number with its source in a comment |
| C5 | Testimonials: typical experience only, no results; disclose material connections (free Pro, affiliate) next to the quote | "I passed my prop challenge in a week" | Process-focused quote + "Received free Pro access" |
| C6 | No urgency theatre: countdowns, "only N spots", "N signed up today", expiring free offers | "Offer ends tonight" | Nothing, or real permanent facts ("Free plan, no card") |
| C7 | Auth is simulated. Never imply a real Google sign-in or account security that doesn't exist | "Securely sign in with Google" | "Demo sign-in, no real Google account is used" |
| C8 | One offer per page, stated the same way everywhere, and true for the variant shown | "Free forever" next to "5-day trial" | One offer, stated the same way everywhere |
| C9 | No disparaging, unverifiable competitor comparisons ("the only", "#1", "best") | "The #1 backtesting tool" | Specific, checkable capability |

Scan for these trigger words and justify or remove each: *profit, profitable, income,
earn, returns, win rate, guaranteed, risk-free, proven, #1, best, only, secret,
never lose, consistent gains, financial freedom, quit your job, limited, hurry, today only*.

"Risk-free" is banned even for the free plan. Say "free" / "no credit card".

## 2. Conversion craft (inside the gate)

**Audience:** retail and prop-firm traders. They've been burned by signal sellers and
read hype as fraud. **Specific, plain and verifiable beats exciting.** Credibility
is the conversion lever.

**Message hierarchy** for any surface:
1. **Outcome they want, framed as practice**: rehearse, test, get reps without real money at risk.
   Loss-avoidance ("test it before you risk real money") is the strongest angle that
   stays compliant (§A.3 #5).
2. **Mechanism**: how the product delivers it (replay past markets bar by bar, journal, review).
3. **Offer + risk reversal as CTA microcopy**: "Free plan · No credit card" right
   under the button (§C.2, §A.3 #2).
4. **Proof**: substantiated only (C4/C5). Specific capability > vague superlative.
5. **Objection handling**: FAQ answers the real hesitations (cost later? card? data?
   which markets? how long to set up?).

**Techniques to use:**
- **Headlines**: concrete verb + object + context. Test it: "Could a competitor say
  this word for word?" If yes, make it more specific to replay/backtesting.
- **One CTA label** across the page: `CTA_LABEL` in `src/lib/cta.ts`. A button says
  what happens next ("Create free account"), never "Submit" / "Learn more".
- **Reduce perceived effort**: say the cost in time and fields ("Email only · takes 20 seconds")
  only when it's true in code.
- **Voice of customer**: use traders' words (backtest, replay, prop challenge,
  journal, session, setup), not marketing jargon (unlock, supercharge, revolutionize,
  seamless, empower, next-level).
- **Front-load**: the key word in the first 3–5 words of headings, bullets and meta
  descriptions. People scan.
- **Benefits over features, tied together**: "Bar-by-bar replay, so you see the trade
  unfold the way it would have live."
- **Error copy** says what happened and what to do next, specifically ("That email is
  already registered. Sign in instead."), not "Invalid input" (§C.5). No blame.
- **Success state** confirms the account and gives exactly one next step.
- **Reading level**: short sentences, grade ~7–8, active voice, second person.
- **SEO/meta**: title ≤ 60 chars with the primary term ("backtesting", "trading
  simulator"); description ≤ 155 chars, offer included, no claims.

**Accessibility copy** (CLAUDE.md §4): link and button text makes sense on its own;
status text never depends on colour; every `aria-label` matches the visible text.

## 3. Workflow

1. Collect every user-facing string in scope, including `aria-*`, `alt`, `title`,
   meta, error and empty/loading states, and constants like `EMAIL_MESSAGES` and `CTA_LABEL`.
2. Run the gate (§1). Then the craft pass (§2).
3. Report as a table, **compliance fails first**:

   | Location (`file:line`) | Current | Issue (C#/craft) | Proposed | Why it converts / what it avoids |

4. Give **1–2 alternatives** for headlines and CTAs, noting which is the safer default.
   Headline alternatives are candidates for an experiment (key `<surface>_<lever>_v<n>`).
5. Apply edits only if asked. Keep copy that's shared across files in one constant.
   Leave `// TODO(copy):` where a number or claim still needs substantiating.
