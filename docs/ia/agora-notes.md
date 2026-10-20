# Agora: Notes at the booths (write, see, rate, improve) — IA audit + spec

Status: draft (audit done, redesign proposed, nothing implemented)
Date: 2026-10-20
Supersedes: nothing. Extends `agora-student-clarity.md` (label choices kept: פתק = container, plural address) and the "one bar, four doors" model. Scope: the student's note in the 3D village and its flat fallback. Teacher view only where it shares code.

Method: real walk on the solo emulator suite (vite 3029), Hebrew and English, 390x844 and 1280x800. Two sessions from `npm run fast:solo`: a story booth (8 bots, `--plan=wizcol --stage=question`) and the solutions booth (9 bots, 8 proposals, lottery on). Bots write proposals only, so a classmate-filled story booth was read from code. Screenshots: `.playwright-mcp/ia-notes-01..21.png` (gitignored). Strings: `apps/agora/src/lib/locales/{he,en,ar,es,de,nl}.ts` (not `lib/i18n.ts`, which the clarity spec names).

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Student 12-15, Hebrew, phone | Write my note, know it arrived, read and react to classmates', improve mine | Classmates' real names, AI text presented as theirs, a "saved" that is not true |
| Student in ar/en/es/de/nl | Same | Hebrew-only text (today they see it, see D1) |
| Team of 2-3 on one device | Same, as one player | Another team's draft |
| Teacher watching (ClassView) | See every note at a booth | A pen (it has none, correct today) |

## 2. Audit: what is wrong today (most severe first)

The student's tasks today: write (W), know it saved (C), see mine (M), see others' (O), rate (R), send an idea (I), answer ideas on mine (A), edit (E), carry forward (F).

D1. Critical. The village speaks only Hebrew, in masculine singular. The guide's bubble, the only invitation to write, is hardcoded: `prototypes/olive-hill/world-scene.js:257-258` ("✍️ לכתוב את זה על הפתק שלי", "הפתק שלך כבר על הלוח"), booth names and prompts `village.js:26-30`, the board canvas `village.js:152-167`, the map, walk and stop buttons in `village.html`. The desk's own header comes from `lib/flows/villageRoute.ts:207-231` (`villageDesk`, label "ההצעה שלי", prompt "איזה פתרון אתה מציע? כתוב…") and is rendered as the bubble's h2 at `components/VillageShell.ts:886-892`. Seen: the English UI shows "ההצעה שלי" over an English card (shot 20). It also breaks the plural, gender-neutral rule from the clarity spec. Tasks: W, M, E.

D2. Critical. The lottery board lies before you write. With more than 6 students, `visibleNotes` (`lib/flows/handFlow.ts:43-57`, through `lib/hands.ts:135-152`) shows only mine, my hand and what I rated. Before the first write the hand is empty, so the board says "עוד אין פתקים. כתבו את שלכם בתחנה" (`VillageCommunity.ts:735`) while 8 notes exist (shot 09). The 3D board gets the same list through `stationPapersFor`. This breaks the promise in `lib/flows/placeNav.ts:80-83` ("the board is readable before you have written"). After writing, `hand.waiting` reads "בינתיים קיבלתם 0 פתקים…" (shot 05; `HandStatus.ts:34`). Tasks: O, R.

D3. High. Two homes for classmates' notes, with different rules, sets and numbers. In the village the "My note" door renders the whole classic stage inside the bubble (`views/GameController.ts:926-935` into `VillageShell.ts:916`). For a story, need or vision that is `RoundStage.ts:400-470` with its own "סיפורים של אחרים" list. For an open question it is `QuestionStage.ts:228-285`. The board is a second list (`VillageCommunity.ts:723-733`). They disagree:
- The gate: the bubble says "כתבו קודם, ואז תקראו את האחרים" (read is locked). The board lets you read and locks only rating ("כתבו קודם פתק משלכם כדי לדרג").
- The set: QuestionStage shows every answer (no lottery). The board shows the hand.
- The number: the board counts mine as note 1, so the first classmate is "פתק 2" (`VillageCommunity.ts:502-503`, shot 13). RoundStage numbers the dealt list from 1 (`RoundStage.ts:290`), QuestionStage numbers by order as "תשובה n". The same note has two numbers on one screen.
- The hand line: the board uses `HandStatus` ("דירגתם n מתוך total הפתקים שקיבלתם", "להגריל עוד פתקים"). RoundStage uses `round.read_n_of` and "עוד כמה" for the same thing.
Tasks: O, R.

D4. High. Every first rating is thanked as a re-rating. `components/RateScale.ts:93-96` always shows `delib.rerate_ack`: "הדירוג שלכם עודכן — תודה שסגרתם את המעגל!" (shot 15). The student hears "updated" and "closed the circle" on a note they just rated for the first time. Task: R.

D5. High. Seven names for the note, its places and its verbs. A 12-year-old cannot tell whether these are one thing.
- The thing: פתק, טקסט (`delib.edit_text` "עריכת הטקסט"), תשובה (`question.*`), הצעה (`delib.*`), and the kind as a name ("הסיפור שלי" over a card titled "הפתק שלכם": shot 07).
- Whose: "הפתק שלי" (door, `village.note.mine`) next to "הפתק שלכם" (`village.note.yours`, `round.your_text`) for the same object.
- Where: "כל הפתקים" (door), "הלוח" (hints, flight), "כיכר הדיון" (stage), "עלתה לכיכר" (celebration), "ביתן הפתרונות" (world sign), "הלוח הגדול" (3D board), "תחנה" (empty state). In shot 12 "ההצעה שלכם עלתה לכיכר" and "הפתק שלך בדרך ללוח" are on screen together.
- Send: שליחה / שמירת הפתק / שליחת התשובה / שומרים את ההצעה / עדכון / עדכון התשובה; done: נשלח / נשמר / התשובה נשלחה.
- Edit: "עריכת הטקסט", "לערוך את הפתק שלי", "לערוך את ההצעה שלי", "✍️ לערוך את הפתק שלי".
- Close: "סגירת הפתק" (`village.desk.close`) reads as "finalise the note", not "close this window".
Tasks: all.

D6. High. Sending takes the student away. When the confirmed text changes, `VillageShell.ts:607-628` closes the desk and plays a 5-second paper flight. Every door is locked meanwhile (`placeNav.ts` `HINT_FLIGHT`, shot 04). The student lands on the board, where their card has no "sent" mark (shot 05). In the solutions booth a "הידד!" modal appears over the flight as well. A student who wanted to fix a typo is walked away. "Did it save?" is answered by an animation, not a word. Tasks: C, E.

D7. Medium. Two ways to edit, and four ways in. Round and question stages show a reading card with an "עריכת הטקסט" button, so editing takes two taps (shot 07). The solutions desk is always a live textarea (shot 18). The pen opens from the world bubble's button, the bottom "לגשת לשולחן ולפתק", the "הפתק שלי" door and the board's "לערוך את הפתק שלי". The last one turns the camera first. After sending, the bubble header still asks "איזה פתרון אתה מציע? כתוב…". Tasks: E, M.

D8. Medium. Feedback on my note lives in two homes. For a question booth it is on the board, under my card's "התגובות לפתק שלי" (`VillageCommunity.ts:590`, 719-720). For solutions it is in the desk, under "רעיונות לשיפור שקיבלתם" (Deliberation `myWorkshop`), and also behind the board door's badge (`GameController.ts:1092`). The inbox lands on either one. Task: A.

D9. Medium. The improve flow keeps changing its name. The card button says "להציע שיפור", the screen says "שיחה עם הכותב", the box says "ההודעה או הרעיון לשיפור", and the button says "שליחת רעיון לשיפור", then "שליחה" for the next message (shot 17). Two backs are stacked: "חזרה לכפר" and "חזרה ללוח" (`VillageCommunity.ts:651`, 696-699). The board's "חזרה לכפר" repeats the Village door. Task: I.

D10. Medium. Writing is blocked by the wrong screen. A student without a side opens "ההצעה שלי" and gets "איפה אתם עומדים?" (Deliberation catch-up positioning) under the write prompt (shot 10). Task: W.

D11. Medium (RTL/mobile). On a phone the question title shrinks to one word per line beside the pen icon, and the bubble scrolls sideways (shots 02, 07; `styles/components/_village-round.scss`). Note text and textareas have no `dir="auto"`, so Hebrew in the English UI ends in "…העם." with the full stop on the wrong side (shots 20, 21). The world shows "W A S D הליכה · E כניסה" on a phone. Tasks: W, O.

D12. Low. The standing line under a rated card reads "-6% class agreement · 1 ratings" right after a positive rating (shot 21). The plural is wrong (`t` instead of `tCount`, `VillageCommunity.ts:357`), and the cautious score is shown without its ⓘ. When a station is closed and the student wrote nothing, the world says "הפתק שלך נשמר" (`world-scene.js:257`). It shows "כבר על הלוח" from cached text that the server has not confirmed. Tasks: C, R.

D13. Low. Carrying forward is uneven. `CarriedContext` opens by default for needs and vision, is closed for open questions, and is closed for stories. It is the only place earlier notes come back, and it has no label shared with the board ("מה הכיתה אמרה" (?)). Task: F.

Language gate: refusals keep the draft and say why (`RoundStage.ts:220-225`, `Deliberation.ts:2656`). That is good. Two problems: the 30-word notice (`language.flagged`) leads with coins, and the board shows nothing for a refused note. Keep the gate. Shorten the notice in Phase 1.

## 3. Object model
| Object | What it is | Statement mapping | Cardinality | Lifecycle |
|---|---|---|---|---|
| Booth (ביתן) | One plan item with a desk: question (story, needs, vision, open) or deliberation | QUESTION Statement (`item.statementId`; deliberation: `challengeQuestionId`). Place `booth:<itemId>` | 1 per question item | locked, open, current, closed |
| Note (פתק) | What one student (or team) writes at a booth | option Statement, `parentId` = booth question, `creatorId` = student | at most 1 per student per booth | draft (device), sending, on the board (server-confirmed, `isProposalConfirmed`), refused (language gate; never stored), stuck, changed (`lastUpdate`), hidden by teacher, closed (read-only), carried forward |
| Kind | story, need, vision, answer, proposal | `questionKindOf(item)`, not stored on the note | 1 per booth | — |
| Rating | My reaction to a classmate's note: heart (story) or 5 faces | evaluation on the note | at most 1 per note per student | none, sending, saved, failed |
| Reading pile (הפתקים שלי לקריאה (?)) | The notes dealt to me when the class is over 6 | `agoraHands/{session}--{uid}`, not a Statement | 5, topped up | empty before I write, dealt, read through, more |
| Idea (רעיון לשיפור) | A classmate's suggestion on my note, or mine on theirs | child Statement of the note, `agoraThreadUserId` = helper | many | open, woven in, declined, thanked 🙏 |
| Conversation (שיחה) | The thread an idea opens, owner and one helper | child messages under the note, keyed by helper | 1 per (note, helper) | — |

No new object. The Statement tree is unchanged. The reading pile stays outside it on purpose (memory: `getRandomStatements` cannot deal unrated notes).

## 4. Labels (one name per concept)
| Concept | EN | HE | i18n key (keep or rename) | Code type | Retire |
|---|---|---|---|---|---|
| The object | note | פתק | `village.note.*` | `AgoraProposal` | טקסט, תשובה, the kind as a name |
| Mine | my note | הפתק שלי | `village.note.mine` (also the door) | — | הפתק שלכם (`village.note.yours`, `round.your_text`) |
| Kind tag on a note | story, need, vision, answer, proposal | סיפור, צורך, חזון, תשובה, הצעה | new `note.kind.<kind>` | `VillageBoothKind` | the kind as the card title |
| Booth | booth | ביתן | `village.booth.*` (new) | `VillagePlace` | תחנה, כיכר (for notes), דוכן |
| All notes of a booth | all notes / the board | כל הפתקים (door) / הלוח (in sentences) | `village.nav.board` | — | הכיכר, הלוח הגדול |
| Desk | my note's place | — (the door is the name) | `village.desk.*` | — | — |
| Send | Send | שליחה | `note.send` (new, replaces `round.save`, `question.save`, `delib.submit_proposal`, `village.note.save`) | — | שמירה, שליחת התשובה |
| Sending | Sending… | שולחים… | `note.sending` | — | שומרים את ההצעה |
| Done | On the board ✓ | על הלוח ✓ | `note.on_board` | — | נשלח, נשמר, התשובה נשלחה |
| Edit | Edit | עריכה / לערוך את הפתק | `note.edit` | — | עריכת הטקסט, לערוך את ההצעה |
| Send a change | Send change | שליחת השינוי | `note.send_change` | — | עדכון, עדכון התשובה, עדכון ההצעה |
| Close the desk | Close | סגירה | `village.desk.close` (new value) | — | סגירת הפתק |
| Rate | rate | לדרג | `rate.*` | — | שקלו, הוקירו |
| Rating saved | Saved | נשמר | new `rate.saved_ack` | — | `delib.rerate_ack` on a first rating |
| Reading pile | notes to read | פתקים לקריאה | `hand.*` (values change) | `HandStatus` | קיבלתם, להגריל, עוד כמה (`round.rate_more`) |
| More notes | More notes | עוד פתקים | `hand.draw_more` | — | להגריל עוד פתקים |
| Idea | idea | רעיון לשיפור | `delib.thread_suggestion_tag` | — | להציע שיפור, הצעת שיפור |
| Ideas and replies on mine | ideas for my note | רעיונות לפתק שלי | `village.note.replies` (new value) | — | התגובות לפתק שלי, רעיונות לשיפור שקיבלתם |
| Note number | Note 3 | פתק 3 | `village.note.n` only | — | `round.text_number`, `question.answer_number`, `delib.proposal_number` |

Rule: the kind word appears only in the booth's question and as a tag, never as the name of the object. Open question Q2 covers "הצעה" at the solutions booth, the vote and the results.

## 5. Hierarchy (student, village)
0 Village (the map; the "הכפר" door)
1   Booth X (standing at its table; the guide's bubble = one line + one button)
2     My note (the desk): the question, my note, its state, ideas for it
3       Conversation with one helper (accept, thank, decline)
2     All notes (the board): my note pinned (read-only, "edit" opens the desk), the reading pile, rate, idea
3       Conversation on a classmate's note (my idea)
1   Results (council)
Depth 3. The flat view is the same tree without level 0.

## 6. Navigation model
- Global: the four doors stay (`PlaceBar`). "הפתק שלי" always opens the desk of the booth on screen. "כל הפתקים" always opens its board.
- Local: the desk holds only my note. The classmates' list leaves the desk (fixes D3). The board holds everyone's, mine pinned first.
- Contextual: the guide's bubble has one button, labelled by state: write, edit, read (closed). The bottom "לגשת לשולחן ולפתק" and the board's "חזרה לכפר" go, because the doors cover them (D7, D9). The board card's "edit" opens the desk without a camera tour.
- After sending: stay at the desk. The note shows "על הלוח ✓", and one button "לקרוא את הפתקים של הכיתה" plays the flight and opens the board. No doors are locked unless the student chooses the flight (Q3).
- Back: a conversation has one back, "חזרה ללוח" or "חזרה לפתק שלי" depending on where it was opened. Panels close by a door or "סגירה".
- Deep links: inbox rows already use `requestFocus(target)`. An idea on mine goes to My note > conversation. My idea's reply goes to All notes > conversation. URL is unchanged (`/play/:id`, presentation state only).

## 7. Task flows (taps, proposed vs today)
Student:
1. Write the first note (3; today 3 + a forced 5 s flight). Booth > "לכתוב" in the bubble or the door > type > "שליחה" > desk shows "על הלוח ✓".
2. Know it arrived (0; today inferred from the flight). The state line on the note: שולחים… / על הלוח ✓ / לא נשלח, ולמה (refused, with the draft kept) / החיבור נתקע (stuck, with retry).
3. See mine (1). The door "הפתק שלי". Or the board, where mine is pinned at the top.
4. Read and rate (2 + 1 per note). "כל הפתקים" > pile "3 מתוך 5" > a face per note > "נשמר". Before writing, the lottery board says "8 פתקים על הלוח. כתבו את שלכם כדי לקבל 5 לקריאה" (Q1 decides whether they are visible).
5. Send an idea (4). Board > "רעיון לשיפור" on a card > type > "שליחה". The screen title is "רעיון לפתק 3".
6. Answer ideas on mine (3). The door with a badge > "רעיונות לפתק שלי" > one conversation > לשלב / 🙏 תודה / לא הפעם. Every booth uses this one place.
7. Edit (2; today 3-5). The door > edit in place > "שליחת השינוי". Raters are re-invited as today.
8. Carry forward (0). Earlier booths' notes appear as "מה הכיתה כתבה קודם" (?), the same block everywhere, open by default.

## 8. Screen inventory
| Screen | Where | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Guide bubble | world, booth | invite one action | — | camera turning (hidden) | world unavailable: flat view | watcher: "read" | written: "edit" / closed: "read" |
| My note (desk) | bubble / flat card | write, see, edit my note | blank pen + one-line prompt | שולחים… | refused (gate) / stuck (retry) | no seat (`hand_no_seat`) / no side: positioning gets its own title | על הלוח ✓, closed: read-only |
| Ideas for my note | inside desk | answer ideas | "עוד אין רעיונות" | — | send failed | — | woven / thanked |
| All notes (board) | panel | read and rate | "עוד אין פתקים" only when 0 exist | spinner | rating failed on the card | before writing: count + "כתבו קודם" | pile read through: "עוד פתקים" / "קראתם הכול" |
| Conversation | inside board or desk | one thread | first-message hint | — | `delib.send_failed` | watcher: no composer | — |
| Flight | world | optional transition | — | — | 5 s fallback | — | lands on board |

## 9. Findability
A board can hold 35 notes, past a phone screen. Keep the "עוד N פתקים למטה" jump. Add the pile first, then "already rated", then the rest (P2), with one stable note number per booth (`village.note.n`, by createdAt over all notes) so "פתק 3" is the same note in every list, in the inbox and in the thread. Search is not needed below about 35.

## 10. Implementation plan (smallest valuable phase first)
Locales: every new or changed key in all six files `apps/agora/src/lib/locales/{he,en,ar,es,de,nl}.ts`. `src/lib/__tests__/i18nParity.test.ts` must stay green. Read `feedback_agora_preflight_before_editing`: run `npm run preflight` before editing.

Phase 1: truth and words. No structural change (fixes D1, D2, D4, D5 in part, D12; about one day).
- `components/RateScale.ts`: show `rate.saved_ack` on a first rating and `delib.rerate_ack` only when a previous rating existed. Test in a new `components/__tests__/RateScale.test.ts`.
- `lib/flows/villageRoute.ts` `villageDesk`: return i18n keys `village.desk.<kind>.label|prompt` in plural address. Update `lib/flows/villageRoute.test.ts`.
- World strings: add a `strings` block to the `agora-village-state` payload (`VillageShell.ts` `sync()`). It carries the bubble invitation and button (write, edit, read), booth names and prompts, board canvas lines, map, walk and stop. `prototypes/olive-hill/world-scene.js` and `village.js` read it, with Hebrew fallback only for the standalone tour. The "written" state comes from a `confirmed` flag, and closed-with-nothing gets its own line. Test: `lib/__tests__/villageWorldPayload.test.ts`.
- `components/VillageCommunity.ts:735` and `lib/hands.ts`: when the lottery is on and I have no note, show `village.board.write_to_read` with the real count (`notesUnder`). `HandStatus.ts`: drop the n=0 sentence. Tests: `handFlow.test.ts`, `VillageCommunity.test.ts`, e2e `scripts/e2e-hand-board.mjs`.
- Label sweep (section 4). Values change in `village.note.yours` (retire), `village.desk.close`, `village.note.replies`, `village.note.improve`, `round.save|saved|update|saving|your_text`, `question.save|saved|update|saving_answer|your_answer`, `delib.submit_proposal|saving|edit_text|edit_proposal|update_proposal`, `hand.line|waiting|done|draw_more`, `round.rate_more`, `village.flight_status`, `celebrate.*` lines that say כיכר, and `language.flagged*` (shorter, coins second). Add `note.send|sending|on_board|edit|send_change`, `note.kind.*`, `rate.saved_ack`. Fix `village.standing.*` plurals with `tCount`.
- `dir="auto"` on note text and every note textarea (`RoundAnswer.ts`, `QuestionStage.ts`, `Deliberation.ts` write desk, `VillageCommunity.ts` `.village-note__text`, `ThreadChat.ts`).

Phase 2: one home per thing (fixes D3, D8, D9, D10; 2-3 days).
- `RoundStage.ts` and `QuestionStage.ts`: add `part: 'desk' | 'all'`. `GameController.ts:926-935` passes `'desk'` in village mode, so the bubble holds only my note. The flat view keeps `'all'`.
- New `lib/flows/noteNumber.ts` (pure, tested): one number per note per booth. Use it in the board, RoundStage, QuestionStage, ThreadChat (`proposalNumber`) and inbox rows.
- The flat RoundStage uses `HandStatus` and drops `round.read_n_of`/`round.rate_more` (Q4: QuestionStage joins the lottery).
- Received ideas: for question booths, move "רעיונות לפתק שלי" from the board's own card (`VillageCommunity.ts:706-722`) into the desk. Point the badge at the "note" door (`GameController.ts:1092`) and update `lib/__tests__/villageNotificationNavigation.test.ts`.
- `VillageCommunity.ts`: drop the board header's "חזרה לכפר" and keep one contextual back. The improve button opens a thread titled "רעיון לפתק n".
- Deliberation catch-up positioning gets its own desk header (`VillageShell.ts:886-892` reads the stage's title, not `villageDesk`).

Phase 3: the send moment and editing (fixes D6, D7, D11 layout, D13; 2 days, needs Q3).
- `VillageShell.ts:607-628`: remove the auto-flight. The desk shows the state line plus "לקרוא את הפתקים של הכיתה", which starts `agora-village-fly`. Update `placeNav.ts` and `placeNav.test.ts` so `inFlight` exists only during a chosen flight.
- One edit model: the textarea is always live for my note while the booth is open (round and question align with Deliberation). `RoundAnswer.ts` drops the read/edit toggle; update `RoundAnswer.test.ts`.
- The world bubble's single button by state; remove the bottom "לגשת לשולחן ולפתק" (`world-scene.js` footer).
- `CarriedContext`: one label, open by default.
- Hand to ux-ui-architect: the bubble header grid and sideways scroll (`_village-round.scss`), and the WASD hint on touch devices.
- E2E to update: `scripts/village-desk-board.mjs`, `scripts/e2e-story-in-village.mjs`, `scripts/e2e-hand-board.mjs`, `scripts/village-sim.mjs` (points still paid).

## 11. Open questions (for Tal)
Q1. Before writing, may a student read classmates' notes (the board's rule) or not (the desk's rule)? Today the two disagree, and the lottery hides them anyway.
Q2. At the solutions booth, is the object still "פתק" with an "הצעה" tag, or "הצעה" everywhere from there to the results?
Q3. After sending, should the paper still fly to the board on its own, or should the student stay at the desk and choose to go?
Q4. Should the lottery cover open questions too (QuestionStage shows every answer today)?
Q5. "ביתן" (on the world signs) or "תחנה" (in the app's text)?

Assumptions: Hebrew marked (?) needs a native read. The ⓘ pattern (`ExplainHint`) carries any reason longer than one line. AI still never writes student text; the gate only refuses.

## 12. Handoff to UX
Fixed by this spec: one name per concept (section 4); the desk holds only my note; the board holds everyone's; one state line on the note; one button in the guide's bubble; one back per conversation; one note number per booth; no doors locked after sending unless the student chose the flight.
Yours to decide: how the state line and the kind tag look; how mine is pinned on the board; how the pile counter looks; the bubble header layout on a phone (D11); whether the flight stays as an optional animation; placement of the "read the class's notes" button.
