# Agora Chat Guide — Conversation Policy (ARCHIVED)

> **⚠️ This describes code that no longer exists.**
>
> The chat-guided deliberation was rebuilt on 2026-08-03, then reverted on
> 2026-08-05 (`99ed4339d`) in favour of the "places" UI the game ships today.
> `src/lib/chatFlow.ts` and `src/views/DeliberationChat.ts` were deleted on
> 2026-08-16 once the live view had absorbed the one thing worth keeping from
> them — an FSM in `lib/` that the view dispatches into, now
> `src/lib/flows/deliberationFlow.ts`.
>
> Every `[IMPLEMENTED]` tag below was true of that code and is false of the
> running game. Kept because the CONVERSATION POLICY — what a guide should
> never say to a student, and why — outlived its implementation and is worth
> reading before building anything that talks to a class again.
>
> For what the deliberation actually does now, see `feedback-cycle.md`.

---

Companion code: `src/lib/chatFlow.ts` (pure engine), `src/views/DeliberationChat.ts`
(view + Firestore verbs), `src/lib/notifications.ts` (helper-side signals),
tests in `src/lib/__tests__/chatFlow.test.ts` (44 passing).

---

## 0. Hard invariants

These hold in EVERY situation below. A rule elsewhere that seems to conflict
with an invariant is wrong.

| # | Invariant | Why | Status |
|---|-----------|-----|--------|
| I1 | **Exactly one active card.** `state.activeCardId` points at the single card that accepts input; every other card is history (inert, or frozen-readable for rate cards). | Two live questions = a student who doesn't know what's being asked. | [IMPLEMENTED] |
| I2 | **The guide never injects unprompted messages.** External events (new suggestion, acceptance, edits by others) may only surface as **badges / counts / the nudge line on the currently ACTIVE card** — never as new bubbles or cards pushed into the log while the student is mid-task. | An injected line scrolls the conversation, moves the active card, and yanks the student's current task out from under their thumb. The student's attention is the scarcest resource in a classroom; the guide waits its turn. The one legitimate "turn" is the moment the student completes an action (a dispatch) — that is when the guide speaks. | [IMPLEMENTED] (only `dispatch()` appends; listeners only trigger redraws) |
| I3 | **Transcript stores i18n keys + card REFS, never rendered strings.** Rotating phrasings resolve their variant at append time and store the resolved key. | A mid-session language switch re-renders the whole log translated; a refresh replays the exact same phrasing. | [IMPLEMENTED] |
| I4 | **Cards render live data.** A ref like `{type:'rate', proposalId}` re-reads the proposal text at render time; an old card never shows stale text. | Proposals are editable; the log must not lie. | [IMPLEMENTED] |
| I5 | **Events fire only after the Firestore verb succeeds.** The view calls the write, then dispatches. | The transcript never claims something the database doesn't know. | [IMPLEMENTED] |
| I6 | **The guide never writes text for students** (Tal, 2026-07-13). It may prompt, quote, react, and route — it never drafts, rewrites, or "improves wording". AI critique lives only in the in-character reviews. | "Otherwise they will not think." | [IMPLEMENTED] (assistant callables exist but are uncalled) |
| I7 | **Ownership law**: blue `--mine` 📘 = the student's own words/proposal; orange `--peer` 📙 = a classmate's. Every card and quote carries the correct color/chip. Camp colors (purple/teal) never overlap ownership colors. | Playtests showed students couldn't tell "mine" from "others". | [IMPLEMENTED] |
| I8 | **Persistence**: engine state + transcript in sessionStorage per session (`agora_{sessionId}_chatflow` / `_chatlog`), capped at 300 entries; corrupt storage falls back to a fresh bootstrap. | Refresh-safe without a backend. | [IMPLEMENTED] |
| I9 | **Anonymity**: proposals by number, never names; individual ratings never shown to owners — aggregates only. | Tal's decision; keeps rating honest. | [IMPLEMENTED] |

---

## 1. Openings

The conversation can only start once the first statements + evaluations
snapshots have arrived (`statementsLoaded && evaluationsLoaded`) — before
that, a spinner, never a guess. [IMPLEMENTED]

| Situation | Guide reaction | Status |
|---|---|---|
| **First visit, no proposal** | Two-line greeting (`chat.intro_*` rotates, then `chat.ask_proposal`) → proposal composer as the active card (needs board one tap away inside it). Phase `intro`. | [IMPLEMENTED] |
| **Returning, storage intact** (refresh mid-anything) | Restore state + transcript verbatim; same phrasings replay (resolved variant keys); the whole log renders at once — **no typing-theater replay**. The active card is whatever it was. | [IMPLEMENTED] |
| **Returning with a proposal but no stored chat** (cleared storage / second device) | Don't re-live the opening: `chat.welcome_back` → straight to the menu. `ratedCount` seeded from live `myRatings` so the guided-opening logic doesn't restart. | [IMPLEMENTED] |
| **Storage exists but is corrupt** | Treat as no storage: fresh bootstrap by the rules above. | [IMPLEMENTED] |
| **Storage restored but my proposal was deleted server-side** | Today: branch cards needing `myProposal()` render a spinner forever. Policy: the guide should notice on the next menu open and re-offer the proposal composer ("your proposal is gone — write a new one?"). | [PLANNED] |
| **sessionStorage unavailable** (private mode / quota) | Chat works normally, silently loses refresh-survival. Never block on storage. | [IMPLEMENTED] |

---

## 2. The rating loop

Dealing: candidates are classmates' unrated proposals, least-rated first
(fair attention), per-student hash tiebreak; `state.dealtIds` is the
synchronous guard against the evaluations-snapshot lag re-dealing a
just-rated proposal. [IMPLEMENTED]

| Situation | Guide reaction | Status |
|---|---|---|
| **Proposal submitted** | Echo the student's text (blue bubble), thank (`chat.proposal_thanks_*`), deal the first candidate with `chat.first_rate_intro` — every deal verbally frames the card as "a classmate's 📙 + number". | [IMPLEMENTED] |
| **Rating = +1 (top mark)** | Warm reply (`chat.top_rating_reply_*`), no improvement prompt — a top mark means "nothing to fix", asking would be noise. Continue the loop. | [IMPLEMENTED] |
| **Rating < +1 (any of the other four)** | The improvement prompt (`chat.improve_prompt_*`: "how could it serve both camps better?") + improve/skip quick-replies. Criticism-as-service framing, never "what's wrong with it". | [IMPLEMENTED] |
| **Improve accepted** | Echo `chat.improve_yes`, open the improvement composer: classmate's proposal as a mounted POSTER (📙), the student's reply as a sticky NOTE (📘) — two physical objects so ownership reads before words do. | [IMPLEMENTED] |
| **Improvement sent** | Echo the text, thank (`chat.improve_thanks_*` — mentions the points-if-accepted incentive), count it, continue the loop. | [IMPLEMENTED] |
| **Improvement skipped** | Echo the skip, continue — zero guilt, no lecture. Skipping must stay cheap or ratings become dishonest (students would give +1 just to avoid the prompt). | [IMPLEMENTED] |
| **Guided opening** | After the proposal, auto-deal until **3 ratings** (`AGORA_CYCLE.RATINGS_PER_ROUND`), then `chat.opening_done` → the menu ("hand over the wheel"). Progress is reported to the teacher per rating. | [IMPLEMENTED] |
| **Free rating (via menu `rate_more`)** | Keep dealing one at a time while candidates remain; each completed rating deals the next. | [IMPLEMENTED] |
| **No candidates at proposal time** (first to propose / solo student) | `chat.no_candidates` ("classmates are still writing") → menu. The menu will grow a `rate_more` button live when proposals arrive (§6). | [IMPLEMENTED] |
| **No candidates via `rate_more`** | `chat.all_rated` if the student has rated anything, else `chat.no_candidates` → fresh menu. | [IMPLEMENTED] |
| **Pinned proposal deleted mid-rate** | The rate card itself (live data, I4) shows `chat.candidate_gone_card` + a back button; pressing it dispatches `CANDIDATE_GONE` → `chat.candidate_gone` → menu. The guide never pretends the card is still ratable. | [IMPLEMENTED] |

---

## 3. Owner-side feedback events (the `my_feedback` card)

The student is looking at suggestions classmates sent on THEIR proposal.
Three verbs, three temperatures — the asymmetry is deliberate:

| Situation | Guide reaction | Status |
|---|---|---|
| **ACCEPT ("I'll implement")** | The strongest moment in the loop — accepting = *adopting*, so the guide immediately walks the owner to the work: user echo (`chat.accept_echo`), guide line (`chat.accepted_go_improve_1/_2` rotate: "Great choice! Here's your proposal 📘 — weave the idea in"), then the **my-proposal editor opens as the active card with an "Improvement suggestions (N)" drawer beneath the textarea** listing ALL accepted ideas (live; the just-accepted text rides on the card ref until the resolve lands in the snapshot). The drawer is a classic accordion (neutral control chrome: tinted header row, gray chevron chip, animated expand — the peer-orange accent per I7 sits only on the CONTENT: the count badge and a slim bar on each idea row, because the ideas are classmates' contributions, while the control itself must read "tap me", not "alert banner"). It is collapsed by default — except right after an accept, when it arrives OPEN, because the guide just said "weave the idea in" (💡 `chat.accepted_reminder` + the text). The student never has to remember the wording. Phase → `improve_mine`, `visited.improveMine` set. The suggester gets the glitter (server notification → celebration, §5). | [IMPLEMENTED 2026-08-04] |
| **MARK WOVEN IN (second mark of the lifecycle)** | Accepting says "I like it"; the ✓ in the accordion says "it is in the text now". Each ACCEPTED idea row carries a checkbox (owner, active card only). A tick is a LOCAL pending mark — freely untickable — and it arms the save button; only SAVING the updated proposal resolves the ticked ideas (accepted → implemented via agoraResolveSuggestion), so the suggester announcement always arrives together with a real change they can inspect and re-rate (server-validated: only from accepted; idempotent; NO extra points — attribution, not a second payday). The suggester gets a glitter celebration ("your idea was woven into the proposal text!") and their helped-branch chip upgrades to the filled green "woven into the text". Precise attribution: with several accepted ideas, only the woven ones announce influence. | [IMPLEMENTED 2026-08-04] |
| **THANK ("Thanks")** | Warm but small: stay in the feedback card, the status chip flips to "thanked". Policy adds a one-line warm guide acknowledgment ("Nice — they'll be glad to know it helped") without leaving the card. Today the chip flip is the whole acknowledgment. | chip: [IMPLEMENTED] · guide line: [PLANNED] |
| **DECLINE ("No thanks")** | Quiet by design: chip flips to "declined", **no guide commentary, no points, no apology theater** — declining must stay socially cheap or students will accept ideas they don't believe in. Stay in the card. | [IMPLEMENTED] |
| **Multiple open suggestions, one accepted** | The drawer lists every ACCEPTED idea (live), so earlier accepted ideas stay reachable too. The rest stay OPEN — nothing is auto-resolved. After the student saves the improved proposal, `PROPOSAL_UPDATED {hasMoreFeedback:true}` makes the guide say `chat.proposal_updated_more_feedback` ("updated — and more suggestions are waiting in the menu"); the my_feedback menu option keeps its open-count badge, so the way back is one tap. The guide routes, it does not stack tasks. | [IMPLEMENTED 2026-08-04] |
| **Accept fails (offline / callable error)** | No dispatch (I5): the card stays as it was, error logged. The guide never celebrates an acceptance the server didn't record. | [IMPLEMENTED] |
| **Feedback card open, new suggestion arrives** | The card re-renders with the new item (live data, I4) — the guide says nothing (I2). | [IMPLEMENTED] |
| **`my_feedback` chosen with zero suggestions** (entered via ratings-moved signal) | Card shows `delib.no_feedback_yet`; the menu only offers the option when there is something (open suggestions OR moved ratings), so this is rare. | [IMPLEMENTED] |

---

## 4. After improving my own proposal

Saving an edit dispatches `PROPOSAL_UPDATED` (after the write lands, I5) and
celebrates — improving your own text is the behavior the game most wants to
reinforce.

| Situation | Guide reaction | Status |
|---|---|---|
| **Saved, no open feedback left** | `chat.proposal_updated_reply` — short confirmation, stay in the branch (menu one tap away). | [IMPLEMENTED] |
| **Saved, open suggestions still waiting** | `chat.proposal_updated_more_feedback` — confirmation + "more suggestions are waiting in the menu". The view counts OPEN suggestions at save time. | [IMPLEMENTED 2026-08-04] |
| **Character verdicts now stale** | The verdicts were about older text and must not impersonate opinions of the new one: chips flip to "text changed", the review bubble gets stale styling, re-ask becomes the primary button, and the menu's `ask_characters` gets the fresh-dot. Policy adds: when a stale review exists, the guide's post-save line should *mention* re-asking the characters. | stale marking: [IMPLEMENTED] · guide mention: [PLANNED] |
| **Classmates re-rate after my edit** | Aggregate only (I9): "N ratings updated since your improvement" on the HUD tile and as a `my_feedback` menu trigger. Never who, never what value. | [IMPLEMENTED] |

---

## 5. Helper-side events (my suggestion on someone else's proposal)

| Situation | Guide reaction | Status |
|---|---|---|
| **My suggestion got ACCEPTED** | Glitter, not a toast: the server notification (`AGORA_SUGGESTION_ACCEPTED`) pops the celebration overlay with the suggestion text, marks itself read. This may interrupt visually (it's an overlay, not a transcript injection — I2 governs the *transcript*), because acceptance is the game's jackpot moment. | [IMPLEMENTED] |
| **Guide says something about it in MY chat** | When the helper is *at the menu* (their natural turn) and a proposal they helped has changed, the nudge line says `chat.nudge_helped_changed` ("a proposal you helped changed — look, and update your rating if you like it"). Priority: below fresh-feedback-on-mine, above unasked-characters. The trace also lives in the `helped` branch chips + celebration. | [IMPLEMENTED 2026-08-04] |
| **A helped proposal was edited** | Local toast (sessionStorage watermark, first sighting is silent so fresh tabs don't replay history) + change-badge on the `helped` menu option; inside the branch, the item shows the CURRENT text + "improved since your idea" marker (compared against `suggestion.createdAt`, NOT `lastUpdate` — resolution bumps lastUpdate and would wrongly hide the marker). | [IMPLEMENTED] |
| **Follow-ups** | Free follow-up box on each helped item; sending stays in the branch (no phase change, no guide line — the loop belongs to the two students now). Re-rating via the compact scale likewise stays put. | [IMPLEMENTED] |
| **Thanked / declined** | Visible only as the status chip on my sent suggestion in the helped branch. No notification, no guide commentary — a decline must not sting (mirror of §3). | [IMPLEMENTED] |

---

## 6. Live-state changes while idle at the menu

The ACTIVE menu is a live dashboard: options, badges, and the nudge recompute
from Firestore state on every redraw. History menus are inert copies.

| Change while the menu is active | What updates | Status |
|---|---|---|
| New classmate proposals arrive | `rate_more` appears/updates its count badge | [IMPLEMENTED] |
| New suggestion lands on my proposal | `my_feedback` appears with the open-count badge; nudge may switch to `chat.nudge_feedback` | [IMPLEMENTED] |
| Classmates re-rate after my edit | `my_feedback` appears (ratings-moved trigger, no badge number) | [IMPLEMENTED] |
| A helped proposal changes | `helped` gets the change badge | [IMPLEMENTED] |
| My character reviews go stale | fresh-dot on `ask_characters` | [IMPLEMENTED] |
| **Any of the above while a NON-menu card is active** | Nothing moves in the transcript (I2). The signal waits until the student next reaches a menu. The HUD (outside the transcript) may update — it is ambient, not conversational. | [IMPLEMENTED] |

The **nudge** is one line, chosen by fixed priority: opening ratings due →
fresh feedback on mine → characters never asked → under-rated proposals
remain → generic. One soft goal at a time; never a list of chores. [IMPLEMENTED]

---

## 7. Stage boundaries & class-shape edge cases

| Situation | Behavior | Status |
|---|---|---|
| **Teacher advances to results mid-composition** | The stage router swaps the view; engine state + transcript persist (I8) but unsent drafts (composer text) are view-local and are lost. Policy: acceptable — deliberation has ended; the guide does not get a "goodbye" turn. | [IMPLEMENTED] |
| **Teacher returns the class to deliberation** (same session) | The chat restores from storage exactly where it was (§1). | [IMPLEMENTED] |
| **Student joins after deliberation already started** | Normal first-visit opening; candidates already exist so the guided opening has material immediately. | [IMPLEMENTED] |
| **Single-student class / solo testing** | Propose → `chat.no_candidates` → menu with only `improve_mine` + `ask_characters` (options are conditional). The characters are the built-in "someone to talk to". | [IMPLEMENTED] |
| **Two-student class** | Fully functional loop (the walkthrough is exactly this); honest-disagreement outcome is mathematically unreachable — a results-stage caveat, not a chat concern. | [IMPLEMENTED] |
| **Teacher deletes/hides a proposal mid-round** | Rate card: §2 candidate-gone row. Helped/feedback references simply drop out of live queries. | [IMPLEMENTED] |

---

## 8. Change discipline

1. New guide behavior = new `ChatEvent` + reducer case in `chatFlow.ts`
   (pure, tested), view dispatches only after the write succeeds (I5).
2. Every new bot line: add to ALL SIX language blocks in `lib/i18n.ts`
   (Hebrew authored first, plural address form), register rotation count in
   `VARIANTS` if it rotates.
3. Extending `CardRef`: new fields must be optional — persisted transcripts
   from before the change must still restore (test the roundtrip; see the
   `acceptedText` tests).
4. Update THIS file in the same commit, and flip `[PLANNED]` → `[IMPLEMENTED]`
   only when the code + tests exist.
