---
name: visual-polish
description: Make an existing surface look designed instead of templated, without redesigning it. Use when the UI is described as flat, plain, generic, "like Bootstrap", or needing more visual appeal, and the layout, copy and components are staying put. Enforces the depth ladder, token tiers, the BEM/Tailwind split, the a11y floor and browser verification.
---

# Visual polish pass

A polish pass adds **depth, brand presence and detail** to a surface whose layout,
copy and component boundaries are already correct. If the layout is wrong, that is a
redesign — different job, stop and say so.

The failure mode this skill exists to prevent: an agent "improving the visuals" by
inventing colours, adding `shadow-lg`, and quietly breaking the token tiers and the
a11y floor.

---

## 1. Diagnose before you design

Read these in full before proposing anything:

- `src/styles/tokens.css` — what already exists at each tier
- `src/styles/global.css` — the Tailwind theme mapping (`--color-*`) and base element styles
- `src/styles/components.scss` — the existing BEM blocks and their conventions
- `src/styles/_utils.scss` — `u.space()`, `u.from()`, `u.tap-target`
- every component on the target surface

Then state, in one or two sentences, **why it reads as flat**. Real examples from
the landing pass: every section shared `--bg-primary`; 1px hairlines were the only
separation; the sole accent on the page was the CTA fill. A diagnosis you cannot
state that concretely means you have not read enough.

The design system is usually not the problem. How little of it the surface uses is.

## 2. Scope it with the user

Polish has a wide range. Use `AskUserQuestion` to settle two things before planning:

- **How far**: depth/texture only · plus new detail elements (eyebrow, icons, accents) ·
  plus motion (scroll reveal, animated illustration).
- **The hero/showcase element**: leave alone · visual only · animate.

Do not assume. "Small enhancements" and "make it feel designed" are different budgets.

## 3. The depth ladder

Apply in order. Each step is cheaper and safer than the one below it.

1. **Surface** — `--bg-primary` → `--bg-secondary` for bands → `--bg-elevated` for cards.
   Most flatness is solved here alone.
2. **Gradient** — a 1px `--gradient-hairline` on a band's or card's top edge, and
   `--bg-page-glow` as a decorative halo. The hairline is the highest
   ratio of "looks designed" to effort on the whole page.
3. **Shadow** — last resort, and only where elevation is literal. `--shadow-card` on
   cards; `--shadow-brand-glow` on a primary action's hover/focus.

Everything in steps 2 and 3 is **decorative and non-text**. None of it may carry
meaning, state, or be the only signal for anything.

## 4. Token discipline

- New values go in `tokens.css`, marked `/* OURS */`, at **tier 2 or 3 only**, composed
  from existing tier‑1 primitives. Never a new hex literal.
- **Never a tier‑1 token in a component.** Verify at the end:
  `rg -- '--(blue|dark|neutral)-[0-9]' src/` must hit `tokens.css` and nothing else.
- No off-system Tailwind defaults: not `shadow-lg`, `rounded-xl`, `text-lg`. If there is
  no token, add one at tier 3 or use `text-(length:--token)`.
- Spacing inside a custom class is `u.space(n)`. Never raw px/rem. Never
  `--space-section` / `--space-gutter` — those are page rhythm, not component spacing.

## 5. The BEM/Tailwind split

**A custom class and Tailwind utilities never share an element.**

When an element currently styled with a long utility list gains a BEM class, *all* of
its styling moves into that class — including responsive column spans, which become
`@include u.from(lg) { grid-column: span 7; }`. Leaving `lg:col-span-7` next to
`.step-list` is the single easiest way to violate this, and it looks harmless.

Check before you finish:

```
grep -nE 'class="[^"]*\b(block-a|block-b)[a-z_-]*[^"]*"' \
  src/components/landing/*.astro src/layouts/*.astro
```

Every hit must be a lone class name.

## 6. Moves that worked

Reach for these before inventing something:

| Symptom | Move |
|---|---|
| Sections indistinguishable | Alternate `--bg-secondary` bands + `--gradient-hairline` top rule |
| A bare `divide-y` list | Elevated cards: `--bg-elevated`, `--shadow-card`, gradient top rule, ghost numerals, hover lift |
| Naked stat row | Per-stat icon, `tabular-nums` on the value, **single column below `sm`** |
| Plain `<details>` accordion | Brand `border-left` + background shift on `[open]` |
| Flat headline | Wrap a phrase in a gradient-text span (see the trap below) |
| Nothing above the h1 | Pill eyebrow: `--radius-full`, `--border-secondary`, `--bg-elevated`, an icon |
| Wall-of-text legal footer | Collapse into `<details>` — still in the DOM, still crawlable |
| Page has no ground | Fixed `.page-backdrop`: radial brand halo + masked grid, `z-index: -1`, `pointer-events: none` |

Icons come from a package already in `package.json` (here `@phosphor-icons/core/regular/*.svg`,
imported as Astro components). Never add a dependency for a polish pass.

## 7. Traps

Every one of these was hit for real. They cost a cycle each.

- **`<details>` cannot do a height transition.** A closed `<details>` does not render its
  content, so `grid-template-rows: 0fr → 1fr` has no start frame. Use a keyframe
  animation on `[open]`, which plays the moment content is displayed.
- **`inset: 0` + `height: 1px` fight.** `inset: 0` pins bottom too. A top rule is
  `inset: -1px 0 auto 0`.
- **Gradient text needs a colour fallback.** Declare `color: var(--text-primary)` first,
  then apply `background-clip: text` inside `@supports (-webkit-background-clip: text)`.
  Without it, a browser that parses `color: transparent` but not the clip renders
  invisible text. Check the gradient's *darkest* stop for contrast, not its average.
- **Pin reduced-motion explicitly.** The global `0.01ms` override may happen to land on
  the right frame; relying on that is an accident. Write the
  `@media (prefers-reduced-motion: reduce)` block that sets the finished state.
- **Decorative bleeds cause horizontal scroll.** A pseudo-element with negative inset
  widens the page. `overflow-x: clip` on body — `clip`, not `hidden`, which would break
  sticky positioning.

## 8. Verify in a browser, not in your head

Styles-only changes skip `pnpm test && pnpm build` per CLAUDE.md §1,
but a polish pass almost always touches components, so run both.

Then with Chrome DevTools MCP against `pnpm dev`:

1. Screenshot at **1440px** and **390px**.
2. Remove the consent banner and sticky CTA in `evaluate_script` first — they cover the
   very sections you are trying to see.
3. Tab the whole surface. Every stop shows the focus ring; a glow is **additive** to the
   outline, never a replacement.
4. Force the reduced-motion end state and screenshot it. It must be a complete,
   sensible frame.
5. Contrast-check any new text colour, especially gradient text.

### Two measurement gotchas

- **Chrome's mobile emulation reports `innerWidth` 404 against a 390 viewport**, so
  `scrollWidth > clientWidth` looks like overflow when there is none. The real test:
  `window.scrollTo(9999,0)` then read `window.scrollX`. `0` means no horizontal scroll.
- **Before fixing a layout bug you "found", confirm it is yours.** `git stash push -- src/`,
  reload, re-measure, `git stash pop`. The hero-wash overflow predated the pass; fixing it
  was still right, but claiming it as a regression would have been wrong.

## 9. Record it

- `docs/decisions.md` — any new rule or exception, and why. A polish pass that adds
  shadows to a system whose rule was "shadow for the modal only" must say so and
  scope the exception.
- `docs/ai-workflow.md` — every corrected or rejected attempt, as you go. The
  traps in section 7 came from there. Reconstructing this at the end produces something
  obviously fake.

## Non-negotiable

The a11y floor in CLAUDE.md §4 is a merge condition, not a polish concern. Specifically
for this kind of work: status is never colour alone, every interactive target stays
≥ `var(--target-min)` on both axes at 390px, `:focus-visible` is never traded for a
prettier effect, and `prefers-reduced-motion` is honoured. Copy is not yours to touch —
that is `copy-compliance`.
