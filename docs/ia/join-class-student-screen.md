# join-class: Student screen sample on the teacher console

Status: built, 2026-11-05. Card 7S3Axkzd.

## Audience

Teacher: see what phones show now. Never on the projector; no `views/teacher/projector/*` change.

## Object

A view of the current step, not a saved object. One persona, no data of its own.

## Label

| EN | HE | Key | URL | Code |
|---|---|---|---|---|
| Student screen | מסך התלמידים | `console.student_screen` | `?view=student` | `ConsoleView 'student'`, `StudentScreenSample` |

Caption, `console.student_screen_note`: "דוגמה של תלמיד אחד. הטקסטים לא אמיתיים." Do not reuse `plan.intro.preview`: it means the plan editor.

## Place

Third item in the existing `console.view_label` segment: שולחנות | מה כתבו | מסך התלמידים. It replaces the board, like `texts`. Closed by default (tables stays default). The header gets nothing new. The rail stays visible.

## Behaviour

Follows `getLessonStep()` and lesson status live, with no step picker.

**Data.** Lesson wording stays real (question, intro, side names and claims, guiding questions). Student-made content is fixed sample strings in i18n (names, proposals, answers, votes, percentages); the sample reads none of it from Firestore. Reason: "Show on this screen" serves one mirrored computer, so the class may see the console.

**Differing students.** One fixed moment plus the caption, no persona switcher:

- Side: thumb at centre
- Tables: "Table 3", three sample names, one marked "you"
- Table talk: P1 (picking a question)
- Proposals: writing
- Vote: real ballot state (waiting/open/paused/closed) with sample cards

**Look-only.** Wrapped in `inert`, with no-op handlers. Must not import `studentWrites`, `classroom/api`, or the write functions in `c3Data`/`proposals`.

Never mount `StudentStage`: `watchClass` calls `resetClassState`, wiping the console's roster and tables; `ensureMemberSubscription` writes; `startReplyHost` appends to `document.body`.

## Screens

**As they are:** `OpeningView`, `LessonStateScreen` paused.

**Stand-ins, built on `StudentFrame`:** Waiting, Side (`SideSlider`), Tables, Table talk and Proposals (`QuestionPick`, `WriteBox`, `TextCard`), All proposals (`TextCard`, disabled `RateFaces`), Vote (locked `VoteList`), Summary (`DecisionCard`, disabled `RateFaces`, `SupportBySide`), Ended.

## Assumptions

- The console language is the teacher's, so chrome may differ from the phones.
- Lazy chunks load on first open; the frame shows meanwhile.
