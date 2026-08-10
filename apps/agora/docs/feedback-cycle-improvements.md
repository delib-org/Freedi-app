# Feedback-cycle gamification — the decision record

**`feedback-cycle.md` is the spec: what the loop does today. This file is
the *why*** — the reviews behind each round, what was rejected and on what
grounds, so a later session does not re-propose a thing that was already
argued down. Nothing here is a to-do list; every round below shipped.

| Round | Date | What it was |
|---|---|---|
| 1 | 2026-08-06 | The economy and its missing ledger — points, notifications, accessibility |
| 2 | 2026-08-10 | The loop's last two beats, moved into the conversation |

---

## Round 1 (2026-08-06) — the economy and the ledger

Synthesis of two independent reviews of the improvement feedback cycle:
a UX review of how the loop *feels* to both actors, and a gamification
review of the reward *economy*. Both were grounded in the code on
`feat/agora-places-improved`, not just the doc.
Status: **IMPLEMENTED and verified** (2026-08-06). All three phases
shipped and proven end-to-end with a teacher and two students against the
emulator — see `scripts/e2e-cycle.mjs` for the proof.

Two extra defects surfaced during implementation and were fixed:

- **`PointsPill` never terminated.** Integer stepping toward a fractional
  target overshot every tick and the exact-equality exit was unreachable,
  so the interval ran forever and the number oscillated. Now steps in
  quarters and clamps on overshoot, with unit tests.
- **The ratings-moved signal raced itself out of existence.** It compared
  rating times against `statement.lastUpdate`, which the shared
  evaluation pipeline bumps every time anyone rates — so the author's
  return signal could never fire. Both it and the ✨ "improved" marker now
  read `agoraScores.lastEditAt`, stamped server-side only on a real text
  change.

### Shared diagnosis (round 1)

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

### Phase 1 — quick wins (shipped)

| # | Change | Where |
|---|--------|-------|
| 1 | Accepted celebration gets a future: add a hint line "when it's woven into the text you'll get +2 and be invited to re-rate" — teaches the ladder at the moment B cares | `notifications.ts` accepted branch, `celebrate.suggestion_accepted` in `i18n.ts`, `CelebrationPayload` |
| 2 | Retire `declined` cards from A's received list (collapse to one muted count after a beat) — the workshop stays a to-do list, declines stay whispered on both sides | `Deliberation.ts` `suggestionsSection` filter |
| 3 | Close B's loop audibly: clear the stale ✨ "improved" marker once B has re-rated after the update (`myRatings[id].updatedAt > proposal.lastUpdate`), and show a one-shot "✓ your rating was updated — thanks for closing the circle" | `Deliberation.ts` `helpedItem` / `reRateScale` |
| 4 | First-accept coach mark inside the opened drawer explaining accept → tick → save ("then the suggester gets the news, +2") — the least self-evident chain in the game | `Deliberation.ts` drawer open, sessionStorage flag |
| 5 | Accessibility: celebration overlay gets `role="alertdialog"` + focus + Esc; the actionable toast becomes a real `<button>`, auto-dismiss pauses on hover/focus and gets 10–12s | `Celebration.ts`, `Toast.ts`, `notifications.ts` |
| 6 | Fix `PointsPill` fractional oscillation (terminate when within a quarter, step in quarters, quarter-aware formatting) — prerequisite for any ledger surface | `PointsPill.ts` |
| 7 | Truth sweep: interpolate `AGORA_POINTS` values into celebration/toast strings via `t()` placeholders instead of hardcoded `+1`/`+2`/`−0.25`; add the missing Hooked `awardCredit` on `implemented` (today only `accepted` fires it) | `i18n.ts`, `fn_agoraResolveSuggestion.ts` |

### Phase 2 — economy changes (shipped)

The points table as it was revised (bold = the change made). This is the
economy `feedback-cycle.md` now specs — read it there for what is true
today; kept here for the reasoning per line.

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

### Phase 3 — bigger bets (shipped)

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

### Ethics questions raised before shipping round 1

- Decline flow even at 0 — should any number appear at rejection?
- Rating credit — overjustification risk on evaluative judgment
  (0.5, value-blind, hard-capped is designed to stay under the
  "doing it for points" threshold; deserves expert eyes).
- Bridge-record celebration — shared success vs implicit pressure on
  authors of low-bridging proposals.
- Caps are silent in the moment but must be stated on the help screen —
  every rule above still works when students fully understand it.

### Deliberately unchanged (round 1)

The +1/+2 ladder and the floor at 0; the score-free work surface
(2026-08-05 decision — strengthened, not revisited); class-score
weights; `VALUE_ACCURACY_MAX` (different stage's economy); no decay,
no streaks, no leaderboards, no AI-judged suggestion quality; no direct
reward for re-rating.

---

## Round 2 (2026-08-10) — the loop's last two beats

Two steps of the cycle had no moment of their own. When an owner revised
after an idea, the helper learned it only from a chip on a card they had
to go find; when the class answered that revision, the owner read it off a
static line on their own workbench. Both now land in the **conversation
between the two people who caused them** (`ThreadChat`), which is also the
only place both of them already look.

Reviewed by a gamification designer and an ethical UX psychologist, in
parallel, against the code. Status: **IMPLEMENTED** — see the round-2 rows
of the notification and verification tables in `feedback-cycle.md`.

### What shipped

1. **The re-weigh block** (helper side): the diff, a read gate, a blank
   scale, and "same is a real answer". The four integrity rules are
   specced in `feedback-cycle.md` under *asking for a re-rate without
   buying it* — they are the load-bearing part of this round.
2. **The credited score line** (owner side): helper named on the act,
   class credited for the number, single attribution across the owner's
   threads so one revision is not claimed in three conversations.
3. **🔁 Round Trip**: the closed circle, named for the pair, dated at the
   moment it closed, zero points.
4. **A copy-honesty sweep**: six shipped strings claimed more than the
   evidence supports ("improved" is a verdict the student has not made
   yet; "your idea was woven in" is unknowable on an edit trigger). All
   six now say "revised", and "after" rather than "because".
5. **A typing gate on toasts**: nothing interrupts a student who is
   mid-sentence writing a suggestion.

### The trap this round fell into, twice

`statement.lastUpdate` is not an edit clock. It moves when anyone rates
(the evaluation pipeline writes aggregates onto the proposal doc) **and**
when any child is written — including the reader's own suggestion. Round 1
already fixed one signal that had raced itself out of existence on it;
round 2 shipped a *fallback* to it and immediately produced the opposite
failure — telling a helper the text had changed the moment they finished
writing to a proposal nobody had touched. Two neighbours had the same bug:
the "a proposal you helped was revised" toast, and the stale-character-
review test.

There is now exactly one accessor, `editClock()` in
`lib/improvementSignals.ts`, with **no fallback**: no `lastEditAt` stamp
means no known edit, and every dependent signal stays silent.

### Rejected in round 2, and why

| Rejected | Why |
|---|---|
| Any payment for re-rating, in any amount | It is the one act that moves the scored number; a price on it is a price on the score |
| Round Trip conditioned on the score *rising* | A back-door payment for voting up — the exact pressure the read gate exists to resist |
| Restoring an explicit "I used your idea" verb | The accepted → implemented tray was retired as too complex; **🙏 is the attestation** (owner's call, 2026-08-10) |
| Marking the previous face on the re-weigh scale | A consistency anchor at the moment of judgment |
| "Your idea was woven into the text" on an edit trigger | Falsifiable by the diff sitting directly above it |
| Naming the helper beside a *falling* score | Credit for an act entails blame for the outcome; the class owns the number |
| Cumulative pair stats ("3rd time X helped you"), pair streaks | Builds an alliance meta-game that excludes the rest of the class |
| Toasts for score movement | Information, not a task; score-watching under a countdown |
| AI text-matching to detect "was my idea used?" | False negatives poison real contributions, and it edges the AI toward judging authorship |
| A watermark for either moment | Both are derived per render, so there is nothing to mark as seen |

### Reversed after playtest reading (2026-08-10)

The owner's line originally reported a bare *state* when only one
classmate had re-rated, on the reasoning that one count plus one direction
leaks how that classmate voted. In a class of twenty-five it does not —
the rater is anonymous among all of them — and withholding the movement
made the one line about the score say nothing about the score. It now
always names the distance travelled. **The concern is real only in a very
small class** (2–3 students), where "one classmate re-rated, −13" is
effectively naming the helper reading it. Revisit if Agora is ever run in
pairs.

### Still open

- The e2e assertion for the owner's score line has never executed (the
  emulator degraded mid-run). Everything else in the new phases passed
  live.
- `implemented` being unreachable means helping tops out at **+1 per
  idea**. If that needs to pay more, raise the thank-you payout rather
  than reviving the second step.
