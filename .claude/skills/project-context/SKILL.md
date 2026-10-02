---
name: project-context
description: Load the "Try TradingFX Free" project context before planning. Use before creating a plan, proposing an approach, scoping a feature or experiment, or checking work against the project's goals. Reads the README, CLAUDE.md, the docs and the project structure.
---

# Project context

The goal is to raise the conversion rate from marketing traffic to account creation. Read, in
this order, only what the task needs:

1. `README.md`: routes, stack, how the experiment variants are served.
2. `CLAUDE.md`: stack and commands, naming, styling, accessibility floor, copy rules,
   performance budget, project structure (§7).
3. `docs/analytics-plan.md` and `docs/experiment-proposal.md`: funnel, event taxonomy, the
   `funnel_proof_v1` experiment.
4. `docs/decisions.md`: the headings for the area involved. Don't reopen a recorded decision
   without a reason.
5. The files the task touches.

## What to report

- **Goal fit**: how the change moves or measures visitor → account creation.
- **Rule coverage**: which `CLAUDE.md` rules it touches (quote the section).
- **Size**: anything that adds a layer, package or abstraction needs an entry in
  `docs/decisions.md`.
