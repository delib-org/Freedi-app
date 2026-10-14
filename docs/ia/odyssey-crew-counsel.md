# Odyssey: Crew counsel on the island screen — IA spec

Status: draft
Date: 2026-10-15
Supersedes: the single collapsed "📜 להתייעץ עם המלחים" panel placed under the shores (`CrewCounsel.tsx` as of d884b716c)

Scope: only the island screen (`/voyage`) changes. Crew picking (`/elders`), the map, the summary and the reveal's ship mechanics are untouched. Odyssey has no shared-i18n layer: UI strings are hardcoded Hebrew, plus admin-editable keys in `DEFAULT_TEXTS` (`src/lib/defaults.ts`, read with `text()`); the "i18n key" column below says which.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Player (adult voter, Hebrew, phone) | Mark my attitude to each shore of the island after thinking it through; the crew helps me think, not decide | Any tally of where the crew leans; a sailor's reaction before I mark; anything a sailor "says" that I did not ask for |
| Player with no crew (chose none, or the organizer disabled sailors) | Same, without counsel | A counsel affordance that opens on nothing |
| Organizer (admin / patch scripts) | Author each sailor's lean and lines per island and per shore | — (not on this screen) |

Assumption: every player on `/voyage` has already passed `/elders` (or was never offered it). A crew of 0 is a real state, not an error.

## 2. Object model
- **Island** = one `question` Statement (`IslandContent`). 1—n **Shore** = `option` Statement (`island.stances`, ordered). Unchanged.
- **Attitude** (`OdysseyAttitudeKey`: support / livewith / oppose) = a standard evaluation on a shore. Lifecycle per shore: unmarked → marked (this visit) → earlier answer (a later visit). Unchanged.
- **Sailor** (`OdysseyElder`): name, role, values, `positions[islandId] → stanceId`, `challenges[islandId] → line`, `reactions[stanceId] → line`. **Crew** = the sailors this player invited (`invitedElders`), 0–5, in `sortOrder`.
- **Counsel** (NEW as a named object; derived, never stored): what one sailor says when asked, in one of two **scopes**:
  - **Island counsel** (`IslandCounsel`, today's `ElderCounsel`): lean = the shore `positions[islandId]` points to, or none; line = `challenges[islandId]`, else the values line, else silent. 1 per sailor per island.
  - **Shore counsel** (`ShoreCounsel`, NEW): for one shore. lean = *leans to this shore* | *leans to shore N* (another one) | *no documented position*; line = `counsel[islandId][stanceId]` when authored, else fallback (below). 1 per sailor per shore.
- **Reaction** (`ElderRemark`, exists): a sailor's agree/oppose line to a marked shore. Lifecycle: hidden until the island is submitted; shown only in the reveal phase. Never part of counsel. (Today `pickIslandRemark` is called only from tests; this spec gives it its one place, see §7.)

Data gap and the minimal addition: `challenges` is per island, not per shore. Add to `OdysseyElderSchema` an **optional** field `counsel: record(islandId, record(stanceId, string))` (optional, so deployed readers keep parsing; see the picklist-trap rule). Seed shape in `DefaultElder`: `counsel?: Record<islandSlug, string[]>` by 1-based shore index, converted in `buildEldersFromDefaults`; `scripts/patch-elders.ts` carries it like `challenges`. **Fallback rule** when `counsel[islandId][stanceId]` is absent: show the lean only, plus the sailor's island line *once*, labelled as being about the island, not this shore. No Cloud Function; counsel is read client-side from the game doc, and nothing about consulting is written anywhere.

Equal-juice invariants (fixed): all crew members are listed in the same order and the same form in both scopes; a sailor who leans elsewhere or is silent appears exactly like one who leans here; no counts or sums ("3 sailors lean to this shore") in any scope; one sailor's card open at a time; nothing is shown until a sailor is tapped; `reactions` never render in the question phase.

## 3. Labels
One name per concept. Code and route keep `elder` (renaming `/elders`, `OdysseyElder`, `elderId` is out of scope; accepted debt, see §9).

| Concept | EN | HE | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| Sailor (one member) | Sailor | מלח / מלחית; pl. מלחים | hardcoded | — | `OdysseyElder` | "זקן/elder" never in UI (already true) |
| Crew (the group this player invited) | Crew | הצוות | hardcoded | — | `invitedElders()` result | "המלחים שאיתך" as a *group* name (Summary.tsx:476), "המלחים" alone as the group |
| Crew screen | The sailors | המלחים | hardcoded (`GameChrome stage`, `voyageSteps` label) | /elders | `Elders.tsx` | "לבחירת צוות" (CrewCounsel.tsx:43) → "להוספת מלחים" |
| To consult (the verb, both scopes) | Consult | להתייעץ | hardcoded | — | `CrewCounsel` | "לשמוע" (CrewCounsel.tsx:49 "כדי לשמוע") |
| Island counsel | Island counsel | התייעצות על האי | hardcoded; affordance text "📜 להתייעץ עם הצוות על האי" | — | `IslandCounsel` (rename of `ElderCounsel`) | "להתייעץ עם המלחים" without scope |
| Shore counsel | Shore counsel | התייעצות על החוף | hardcoded; affordance text "📜 להתייעץ על חוף N" | — | `ShoreCounsel` NEW | — |
| Lean (where a sailor's record points) | Leans to | נוטה אל חוף N / נוטה אל החוף הזה | hardcoded | — | `positions`, `leansTo` | "עמדה" for a sailor's lean (SILENT_LINE "עמדה מתועדת" → "נטייה מתועדת") |
| Sailor's line | Line | (no UI label; the text itself) | hardcoded | — | `challenges`, `counsel` | — |
| Silent sailor | No documented lean | אין לי נטייה מתועדת כאן. כאן אני מקשיב/ה, לא מדבר/ת. | `SILENT_LINE` | — | `silent` | "עמדה מתועדת" |
| Shore | Shore | חוף N | hardcoded | — | `stances[]` / `option` Statement | "stance" in UI text (none today; keep it that way) |
| Attitude (the player's mark) | Attitude | יחס (תומך/ת · יכול/ה לחיות עם זה · מתנגד/ת) | `ODYSSEY_ATTITUDES` labels | — | `OdysseyAttitudeKey` | "עמדה" for the player's mark (Summary: "לשנות עמדה") → "לשנות יחס" |
| Reaction (after marking) | Reaction | המלחים מגיבים | hardcoded | — | `ElderRemark`, `reactions` | "remark" as a UI word (none today) |
| AI-persona disclaimer | — | 📜 דמות בינה מלאכותית — שחזור משוער, לא ציטוט ולא המלצת הצבעה | hardcoded | — | — | the two different wordings in CrewCounsel.tsx:102 and Voyage.tsx:444 → one string |

Hebrew note: נוטה is spelled the same for m/f; the silent line already uses the /ה form. No new gendered verbs are introduced.

## 4. Hierarchy (player)
```
0 Home (/) — intro
1   ההפלגה (/voyage) — island i of n
2     Island counsel — crew row, visible; opens on tap
3       Sailor's island card (one at a time)
2     Shore N (×4) — attitude buttons
3       Shore counsel for shore N — collapsed line; opens to this shore's crew row
3       Sailor's shore card — opens from that row, one at a time (same disclosure, one more tap)
2     Captain's log
2     Reveal (after submit) — ships, then "המלחים מגיבים"
```
Taps from the island to anything a sailor says: crew row → sailor (1 tap); shore line → sailor (2 taps). Depth from home stays ≤ 3.

## 5. Navigation model
- Global: `GameChrome` (stage name, way back along the voyage steps). Unchanged.
- Local: `IslandStrip` (jump to any chosen island). Unchanged.
- Contextual (this spec): on each island, the crew row at the top of the panel; under each shore, one collapsed counsel line; in the reveal, the reaction card. Crew of 0 → the crew row is replaced by one line "עדיין אין מלחים על הסיפון · להוספת מלחים" linking to `/elders`; no shore counsel lines are rendered at all.
- Order inside the question panel, top to bottom, and why: **opening → island question → crew row (island counsel) → instruction line → shores, each: shore text → shore counsel line → attitude buttons → log → continue**. The question stays first on a phone: the sailors' lines are questions *about* the island question and are meaningless before it is read; placing the crew before the question would push the question below the fold and have sailors speak about something unseen. The crew row sits before the shores because that is what "consult before you answer" means in reading order, and it is one row of portraits, not a wall of text. Shore counsel sits between the shore text and the buttons so the reading order is text → consult → mark; it costs one line per shore.
- Back paths: a sailor card closes with its own control and by tapping the sailor again; opening a sailor in one scope closes any open card in the other scope; opening one shore's counsel closes the other shores'. Island change resets everything (components keyed by `island.statementId`, as today).
- Persistence: nothing. Counsel state lives only in the island's React state; nothing is written to the journey or Firestore. Marks and the log persist as today.
- Deep links and URL: unchanged, `/voyage` with resume logic; no URL state for counsel.

## 6. Task flows (player)
Task a: consult the crew about the island before answering (3 steps)
1. /voyage — read the question (above the fold).
2. /voyage — tap a sailor in the crew row → their island card: lean ("נוטה אל חוף N: …" or the silent line) + their line + disclaimer.
3. /voyage — tap another sailor (card swaps) or scroll on to the shores.

Task b: consult about one shore (3 steps)
1. /voyage — on shore N, tap "📜 להתייעץ על חוף N" → the crew row for this shore.
2. /voyage — tap a sailor → their shore card: lean relative to this shore + `counsel` line, or the fallback (lean + island line marked as about the island).
3. /voyage — mark an attitude on shore N; the card stays, unchanged, until the player closes it or opens another.

Task c: mark and see reactions (3 steps)
1. /voyage — mark at least one shore (counsel open or closed makes no difference).
2. /voyage — "להמשך המסע" → reveal phase: ships move.
3. /voyage (reveal) — "המלחים מגיבים" card shows one sailor's reaction (`pickIslandRemark`); tapping a sailor's ship shows that sailor's reaction to the focus shore in their `ShipCard`. Not available before step 2.

Task d: returning player with earlier answers (2 steps)
1. /voyage — arrives in the question phase; shores show "התשובה הקודמת שלך — אפשר לשנות"; crew row and shore counsel lines are present and identical to a first visit; no reactions.
2. /voyage — changes a mark or not, then "להמשך המסע" → reveal as in task c.

## 7. Screen inventory (one screen; elements and states)
| Element | Pre-mark | Post-mark (question phase) | Reveal phase | Empty / no crew | Error |
|---|---|---|---|---|---|
| Header, strip, opening, question | as today | same | header + strip only | same | — |
| Crew row (island counsel) | visible, no card open | same, unchanged | hidden | one line + link to /elders | sailor with no data → silent line |
| Sailor's island card | opens on tap, one at a time | same | hidden | — | — |
| Shore card: text | as today | + "earlier answer" note on a later visit | hidden | same | — |
| Shore counsel line | collapsed; opens to the crew row for this shore | same, unchanged | hidden | not rendered | — |
| Sailor's shore card | opens on tap, one at a time | same | hidden | — | fallback rule (§2) |
| Attitude buttons | as today | active state | hidden | same | — |
| Captain's log, continue | as today | continue enabled after ≥ 1 mark | hidden | same | saving state as today |
| Ships / nearby ships | hidden | hidden | as today | as today | — |
| "המלחים מגיבים" card | never | never | one reaction; or omitted when no sailor declared on this island | omitted | — |
Loading and no-permission states are the page-level ones that exist today (`NoGameYet`, redirect to `/map`); nothing new.

## 8. Findability
Crew is at most 5 and shores at most ~4, so no search. Grouping is the only scheme: by scope (island, then per shore) and, inside a scope, crew order. A crew row never wraps to a second row of portraits at 5 (UX to confirm at 320 px).

## 9. Open questions and assumptions
- Assumed: Tal's "before the questions" means before the *shores* (the answerable items), with the island question still first. If he means literally before the question text, the crew row moves above the h2 and the question drops below the fold on most phones; the spec would change only §5 order.
- Shore-counsel fallback: showing the island line again on every shore is honest but repetitive; once `counsel` is authored for the twelve default sailors the fallback becomes rare. Authoring 12 × ~8 islands × 4 shores lines is content work, not UI work.
- `reactions` have no renderer today although the data and picker exist; §6 task c assigns them to the reveal. If the reveal should stay ships-only, drop that row from §7 and keep the rule (never in the question phase).
- Accepted debt: `elder` in code and route vs מלח in UI. One rename later, not in this change.
- Analytics on whether players consult at all would need a write; none is specified here (privacy by default).

## 10. Handoff to UX
Fixed by this spec: the order in §5; two scopes with one interaction pattern (crew row → one open card); identical presentation of every sailor in every scope; no tallies; nothing shown before a tap; reactions only in the reveal; the labels in §3; the optional `counsel` field and its fallback.
Yours to decide: how a collapsed shore-counsel line and the crew row look on a 320 px phone; how an open card is distinguished from the shore it belongs to; the single disclaimer string's placement; whether the crew row at the top of the panel needs a one-line caption ("הקישו על מלח…") or the portraits alone carry it; motion when a card swaps; placement of the reaction card relative to the ships in the reveal.
