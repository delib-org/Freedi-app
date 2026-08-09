---
name: agora-feedback-cycle-economy
description: Proposed (2026-08-06, not yet accepted) revision of Agora improvement-cycle points; audit findings incl. class-score coupling, decline-penalty regressivity, thanked already fixed to 0.5
metadata:
  type: project
---

Audit of the Agora feedback-cycle reward economy (branch feat/agora-places-improved), 2026-08-06. **Status: PROPOSED to Tal, not yet accepted — check before treating as decided.**

Key discovered facts (verified in code):
- `classScore.total = 0.45*maxBridging + 0.25*min(100, avgPoints) + 0.3*avgPlausibility` (functions/src/agora/classScore.ts:281) — personal points ARE a collective input. Any point inflation moves the class score; keep new values small.
- Thanked inversion is ALREADY fixed in code (SUGGESTION_THANKED = 0.5 in agoraConstants.ts); only the doc table row (feedback-cycle.md line 65, "+5") is stale.
- The −0.25 decline penalty is **regressive**: the floor at 0 means a zero-balance spammer pays nothing while a productive helper with a balance pays full — it fails its own anti-spam purpose. Proposed: DECLINED = 0 + cap of 2 open suggestions per helper per proposal.
- Individual totals render NOWHERE on the places branch (Results.ts shows only class aggregates; PointsPill is dead code with a fractional-oscillation bug in chase(); ScoreHud only in DeliberationChat). i18n hardcodes +1/+2/−0.25 in strings instead of interpolating AGORA_POINTS.
- awardCredit (Hooked) fires on accepted but NOT on implemented in fn_agoraResolveSuggestion — cross-app credit misses the bigger moment.

Proposed values (rationale in the delivered audit): DECLINED 0; PROPOSAL_SUBMITTED 5→3, awarded once per session (first proposal); RATING_CREDIT +0.5 capped ~15 ratings; AUTHOR_WEAVE_CREDIT +1 per DISTINCT helper per proposal (diversity-shaped, max 3); helper woven cap 2 per (helper, proposal) — collusion pair bounded at +6/+3; BRIDGING graduated tiers 35→+5, 60→+10 (total unchanged 15) + conf denominator min(MIN_CROSS_RATERS, actual cross-camp size) for small groups.

Rejected in this audit (do not re-propose):
- Refund-on-later-accept for declines — moot once penalty is 0; adds bookkeeping for nothing.
- Direct points for re-rating (step 5) — gameable by rating-toggling; loop closure is motivated by the travel-button celebration instead. (Optional +0.25 one-time follow-through credit flagged as maybe, not core.)
- Returning any score HUD to the places-branch work surface — score-free deliberation screens are a deliberate 2026-08-05 decision.
- Deleting PROPOSAL_SUBMITTED — cold-start submission is the funnel's biggest dropoff; award it instead (reduced to +3 so showing up never outpays a landed idea, +3 = parity).
