# Agora: Lesson builder (the lesson's steps) — IA spec

Status: implemented
Date: 2026-10-18
Supersedes: the flat `plan-editor` row list (StagePlanEditor.ts as of 8c30bb141)
Trello: kDapxjir ("I can't edit or add steps, and it looks terrible"), Z7tOJMFU ("the question type opens a tiny unreadable window")

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Teacher, before the lesson (`/teach/start`, fold "מהלך השיעור") | Shape the lesson: which steps, in what order, what each question asks | Engine ids (`round-story`, `question-2`), stage names students see ("the square") |
| Teacher, during the lesson (`/teach/session/:id`, "עריכת השלבים הבאים") | Change only what has not happened yet | Controls on steps that already ran |

## 2. Object model
- **Lesson** (`AgoraSession`) 1—n **Step** (`AgoraStagePlanItem`), ordered. Max `AGORA_STAGE_PLAN` length. The plan lives in memory on `/teach/start` and is written once by `agoraCreateSession`; during a lesson it is written by the teacher's "save" (unchanged by this spec).
- **Step kind** = `stage` (`AgoraStage`). Single-instance kinds: lobby, framing, perspectives, needs, positioning, deliberation, voting, results. Multi-instance: question.
- **Question type** (`AgoraQuestionKind`): `open` | `story` | `needs` | `vision`. A field of a question step, NOT a stage (house rule: WizCol rounds are question items, no new stage kinds). `open` needs the teacher's own words; the three rounds ask in the book's words unless the teacher types their own.
- **Fixed steps**: Entry (lobby) is always first, Results always last. They cannot move, be removed, or have anything inserted before Entry / after Results. Why: the engine needs a room to gather in before anything starts and a place to end; `validateStagePlan` refuses any plan without them in place.
- **Done steps** (during a lesson): the prefix up to and including the current step (`frozenCount`). Read-only; nothing is inserted inside it.
- **Character steps** (framing, perspectives, needs, positioning) exist only in a scenario lesson (`hasCharacters`). An own-question lesson never offers them.
- **Template** (`AgoraStagePlanPreset`): a starting plan. Choosing one replaces every step that has not run.

## 3. Labels
| Concept | EN | HE | i18n key | Code type | Synonyms to retire |
|---|---|---|---|---|---|
| The ordered steps | Lesson flow | מהלך השיעור | startGame.plan_title | AgoraStagePlan | — |
| One step | Step | שלב | planb.* | AgoraStagePlanItem | "stage" in teacher-facing EN ("Add a stage") |
| Add a step | Add a step | הוספת שלב | planb.add | — | "Add a stage" |
| Insert here | Add a step here | הוספת שלב כאן | planb.add_here | — | — |
| Question type | Question type | סוג השאלה | startGame.plan_question_kind | AgoraQuestionKind | — |
| Own question | My own question | שאלה משלי | planb.kind_open | 'open' | bare "שאלה" as a type name |
| Story / Needs / Vision round | My story / My needs / Vision | הסיפור שלי / הצרכים שלי / חזון | question.kind_* | 'story' … | — |
| Edit a step | Edit | עריכה | planb.edit | — | "הגדרות" (settings) on a row |
| Done editing | Done | סיום עריכה | planb.done | — | "סגירה" |
| Fixed step | Always first / Always last | תמיד ראשון / תמיד אחרון | planb.fixed_first / planb.fixed_last | — | — |
| Template | Template | תבנית | planb.templates | AgoraStagePlanPreset | "להתחיל מ:" |

## 4. Hierarchy (teacher)
```
0 Start a lesson (/teach/start)
1   Advanced settings (fold)
2     Lesson flow (fold)               <- this spec
3       Template chips
3       Step cards 1..n  (+ insertion points between editable cards)
4         Step editor (inline, one open at a time)
3       Add a step  -> Add-step sheet (bottom sheet)
```
During a lesson the same list sits under "Edit upcoming steps" in the teacher panel; the done prefix renders as locked cards.

## 5. Navigation model
- Local only. The step editor opens inline under its card (one at a time); the add-step sheet is a modal bottom sheet (Escape / scrim / ✕ close it and return focus to the button that opened it).
- No new routes. The phone's back button is not captured by the sheet (it is short-lived and modal).

## 6. Task flows (teacher, before the lesson)
1. **Read the flow** (0 taps): every card shows its number, its kind as a chip, and its full title (wraps to two lines, never truncated to a few letters).
2. **Edit a question step** (1 tap): tap the card (or "עריכה") → editor opens: question type list (each with a one-line explanation), the question's words, explanation, and for an own question the cutoff. Every keystroke is kept; "סיום עריכה" folds it.
3. **Change its type** (1 tap inside the editor): pick a row in the type list (radio cards, 44px+). No native `<select>`.
4. **Reorder** (1 tap per place): ↑ / ↓ on the card's toolbar. A disabled arrow looks disabled (faded), never highlighted.
5. **Remove** (1 tap): 🗑 on the toolbar. Fixed steps have no toolbar.
6. **Add a step anywhere** (2 taps): tap the "+" insertion point between two cards, or "הוספת שלב" at the end (= before Results) → sheet lists every step that can be added here, each with a one-line explanation → tap one → it is inserted at that place; a new question opens its editor with the cursor in the words field.
7. **Start from a template** (1–2 taps): chips; the chip matching the current flow is marked. If the teacher has edited the flow, the first tap asks inline "Replace your steps?" before replacing.
8. **Fix a problem**: a card that blocks the lesson (an own question with no words) shows a red edge and the reason under its title; the list's error summary stays below.

During a lesson, flows 2–6 apply to steps after the current one only.

## 7. Screen inventory
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Lesson flow fold | /teach/start | Shape the steps | Never empty (template default) | Spinner of the page | Inline per card + summary | Page redirects to /teach | "Start the lesson" enabled |
| Add-step sheet | (modal) | Pick what to insert | "Nothing more can be added here" | — | — | — | Sheet closes, new card highlighted |

## 8. Findability
A plan is ≤ `AGORA_STAGE_PLAN.MAX_ITEMS` cards; numbered, no search needed.

## 9. Open questions and assumptions
- Insert "anywhere" is limited by the engine: after Entry, before Results, after the done prefix. Single-instance kinds already in the plan are not offered.
- A vote placed before any discussion or question is allowed to be placed but flagged by the validator (`voting_needs_source`); the card shows why.
- The own-question lesson's main question (from the question sheet) is the discussion's subject, not a step; unchanged.

## 10. Handoff to UX
Fixed by this spec: the labels above, fixed ends, insertion range, one editor open at a time, type as radio list, sheet for adding.
Yours to decide: card visuals, chip colours per kind, toolbar layout, motion.
