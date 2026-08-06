# Feedback-cycle gamification — improvement plan (2026-08-06)

Synthesis of two independent reviews of the improvement feedback cycle
(`feedback-cycle.md`): a UX review of how the loop *feels* to both
actors, and a gamification review of the reward *economy*. Both were
grounded in the code on `feat/agora-places-improved`, not just the doc.
Status: **proposed — pending Tal's decision**. Nothing below is
implemented yet except the doc fix (thanked row corrected to +0.5).

## Shared diagnosis

Both reviews converged on the same two structural findings:

1. **The economy has no ledger.** Points are announced ("+1!", "+2!")
   in celebrations all lesson, but no surface — not even Results — ever
   shows a student their own totals. `Results.ts` renders only the
   class score; `myParticipant` isn't even passed in
   (`GameController.ts`), and `PointsPill.ts` is dead code with a real
   bug (integer stepping toward fractional targets → 2.75 oscillates
   2↔3 forever). Announced-but-unaccountable points corrode the
   currency's credibility.
2. **Author A's ladder is empty and silent.** A earns nothing for
   submitting (`PROPOSAL_SUBMITTED: 5` is dead — nothing awards it),
   nothing for adopting or weaving, and A's one big reward — the +15
   `BRIDGING_BONUS` — is awarded server-side
   (`fn_onAgoraEvaluation.ts`) with **no notification of any kind**.
   Meanwhile B gets four feedback moments. The bonus is also nearly
   unreachable: own-camp support maxes the bridging score at 35, one
   cross-camp rater caps it around 57 — below the 60 threshold — so
   classes under ~6 students can never trigger it.

A third shared insight: the class score already implements the
"sports-assist" model — `total = 0.45·maxBridging + 0.25·min(100,
avgPoints) + 0.3·avgPlausibility` (`classScore.ts`) — so every personal
point is already a contribution to the shared outcome. Nobody (doc, UI,
or student) knows this. It should be surfaced, and it constrains point
inflation.

## Phase 1 — quick wins (S, no economy change)

| # | Change | Where |
|---|--------|-------|
| 1 | Accepted celebration gets a future: add a hint line "when it's woven into the text you'll get +2 and be invited to re-rate" — teaches the ladder at the moment B cares | `notifications.ts` accepted branch, `celebrate.suggestion_accepted` in `i18n.ts`, `CelebrationPayload` |
| 2 | Retire `declined` cards from A's received list (collapse to one muted count after a beat) — the workshop stays a to-do list, declines stay whispered on both sides | `Deliberation.ts` `suggestionsSection` filter |
| 3 | Close B's loop audibly: clear the stale ✨ "improved" marker once B has re-rated after the update (`myRatings[id].updatedAt > proposal.lastUpdate`), and show a one-shot "✓ your rating was updated — thanks for closing the circle" | `Deliberation.ts` `helpedItem` / `reRateScale` |
| 4 | First-accept coach mark inside the opened drawer explaining accept → tick → save ("then the suggester gets the news, +2") — the least self-evident chain in the game | `Deliberation.ts` drawer open, sessionStorage flag |
| 5 | Accessibility: celebration overlay gets `role="alertdialog"` + focus + Esc; the actionable toast becomes a real `<button>`, auto-dismiss pauses on hover/focus and gets 10–12s | `Celebration.ts`, `Toast.ts`, `notifications.ts` |
| 6 | Fix `PointsPill` fractional oscillation (terminate when within a quarter, step in quarters, quarter-aware formatting) — prerequisite for any ledger surface | `PointsPill.ts` |
| 7 | Truth sweep: interpolate `AGORA_POINTS` values into celebration/toast strings via `t()` placeholders instead of hardcoded `+1`/`+2`/`−0.25`; add the missing Hooked `awardCredit` on `implemented` (today only `accepted` fires it) | `i18n.ts`, `fn_agoraResolveSuggestion.ts` |

## Phase 2 — economy changes (need sign-off; playtest reads)

Revised points table (bold = change vs current):

| Event | Now | Proposed | To | Why |
|---|---:|---:|---|---|
| Accepted | +1 | +1 | B | Keep — proven ladder |
| Woven in | +2 | +2, **first 2 per (helper, proposal) pay; later ones celebrate but pay 0** | B | Bounds A↔B collusion at +6/direction |
| Declined | −0.25 | **0** | B | The floor makes the penalty regressive: zero-balance spammers pay nothing, productive helpers pay full price. Replace with a structural guard: **max 2 open suggestions per helper per proposal** |
| Thanked (chat) | +0.5 | +0.5 | B | Already correct in code |
| First proposal submitted | 5 (dead) | **+3, once per participant per session** | A | Cold-start reward; reduced so showing up never outpays a landed idea (+3). Needs an `onDocumentCreated` trigger — `submitProposal` is a raw client write |
| **Weaving labor** | — | **+1 per distinct helper woven, max 3/proposal** | A | Pays the integration work; the distinct-helper shape makes weaving *many voices* dominate churning with one buddy — bridging-shaped by construction |
| **First rating of a proposal** | — | **+0.5, capped at 15 ratings (max +7.5), new `points.rating`** | rater | Evaluation is the commons (bridging confidence, coverage) and earns nothing today. Value-blind, deduped for free by the deterministic eval id |
| Re-rating (step 5) | — | **0, deliberate** | — | Direct reward is toggle-gameable; the travel button is the motivator |
| Bridging bonus | +15 cliff @60 | **+5 @40 ("first bridge") + 10 more @60** (total unchanged) | A | Cliff → gradient. Tier 1 at 40 is self-guarding: geometrically impossible without cross-camp raters |
| Bridging confidence | n/3 fixed | **denominator = min(3, actual cross-camp student count)** | — | Makes the bonus honest *and* reachable in 4–6-student classes |

Modeled per-student ceiling ≈ 55 — inside the class score's
`min(100, avgPoints)` cap, so the 0.45/0.25/0.3 weights need no retune.

## Phase 3 — bigger bets (M)

1. **Personal recap on Results** (both reviews' top pick): pass
   `myParticipant` into `Results.ts`; render a private "המסע שלי" card —
   helping / rating / proposals breakdown, "ideas of yours woven: N ·
   classmates you helped: M" — framed as *my contribution to the class
   score*, never a leaderboard. Revives the fixed `PointsPill`.
2. **Announce the bridging bonus**: new `AGORA_BRIDGING_ACHIEVED`
   notification from `fn_onAgoraEvaluation.ts` → celebration for A
   ("your proposal bridged the camps! +15"), aggregate by construction.
3. **Durable "ratings moved" chip**: persist the bridge baseline
   server-side at save time (today it's sessionStorage — one refresh
   and the 📈/📉 direction vanishes); elevate the first positive delta
   after an edit to a one-time warm toast.
4. **Class bridge-record moment** on the places branch (the chat branch
   celebrates it in ScoreHud; places lost it with the HUD): class-level
   celebration via the scores listener, anonymity preserved.

## Ethics review before shipping (ethical-ux-psychologist)

- Decline flow even at 0 — should any number appear at rejection?
- Rating credit — overjustification risk on evaluative judgment
  (0.5, value-blind, hard-capped is designed to stay under the
  "doing it for points" threshold; deserves expert eyes).
- Bridge-record celebration — shared success vs implicit pressure on
  authors of low-bridging proposals.
- Caps are silent in the moment but must be stated on the help screen —
  every rule above still works when students fully understand it.

## Deliberately unchanged

The +1/+2 ladder and the floor at 0; the score-free work surface
(2026-08-05 decision — strengthened, not revisited); class-score
weights; `VALUE_ACCURACY_MAX` (different stage's economy); no decay,
no streaks, no leaderboards, no AI-judged suggestion quality; no direct
reward for re-rating.
