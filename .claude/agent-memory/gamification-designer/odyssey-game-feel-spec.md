---
name: odyssey-game-feel-spec
description: Accepted design decisions for the Odyssey Phaser game-feel spec (apps/odyssey/docs/phaser-game-design.md) — no credit economy, equal-juice rule, single-game architecture
metadata:
  type: project
---

Spec written 2026-07-26 at `apps/odyssey/docs/phaser-game-design.md`. Accepted decisions + rationale:

- **No credit economy in Odyssey — deliberate.** Do not wire Hooked credits/levels/streaks/toasts into
  this app. Why: overjustification effect on a short reflective pre-election civic act; any per-action
  reward would sit next to an opinion choice. Completion artifacts only (log stamps, wake trail,
  lanterns, pennants, one-time arrival flags).
- **Equal-juice rule**: identical particle counts/durations/easing for all three attitudes
  (תומך/יכול לחיות עם/מתנגד); only a neutral nautical glyph differs (⚓/〜/⛵, all cream). Highest-risk
  mechanic — must be verified in review.
- **Party ships**: same sprite for all, x-order by sortOrder never by distance, ships move only in the
  reaction phase (never mid-choice — same principle as MC's no-mid-evaluation-indicators rule).
- **Architecture**: ONE Phaser.Game, 5 scenes + shared SeaScene base, persistent fixed canvas host
  (`SeaStage`) behind DOM overlays, typed `stageBus`, Scale.RESIZE (not PartySea's FIT). PartySea's
  ship-layout math extracted to pure tested `seaLayout.ts`. Dynamic import('phaser') preserved so
  direct mode never downloads Phaser.
- **RTL sailing**: forward = right→left; no mixed Hebrew+digits in Phaser text objects (no bidi
  shaping) — mixed strings go to DOM or split into two text objects.
- **Text input stays DOM** (compass answers, depth, captain's log) styled as the existing night-chart
  panels — NOT paper-beige parchment (rejected: house style is the dark chart aesthetic).
- **Day-night advances only with progress**, never wall-clock (so it can't read as time pressure).
- **Reduced motion**: no stored pref + prefers-reduced-motion → default to 'direct' mode; explicit
  game-mode choice gets a no-ambient/no-particles/250ms-crossfade variant.
- **Rejected**: screen shake (violent tone — use a 4px "swell" camera bob instead); porting OpinionMap
  to Phaser (SVG honesty rules stay); reflection counters/targets (quill mark is presence-only);
  celebration replays or share prompts.
- Ethics flags list in spec §8 should go to ethical-ux-psychologist before ship.

How to apply: if asked to add rewards/points/streaks to Odyssey, cite the no-credit-economy decision
and rationale before proposing anything; extend via completion artifacts only.
