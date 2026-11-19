# join-class: Proposals at the table (student) — IA spec

Status: draft, for Tal's approval
Date: 2026-11-19
Cards: 6KEXvzXK (proposals unclear, too many buttons), fJij2wMx (one writer at a time, tidy the buttons)
Related: `join-class-tables-merge.md` (labels "Move on", table step), `join-class-student-screen.md` (Proposals sample = writing)

## In one paragraph

Today every phone at Proposals can jump between Talk, Write and Rate at any moment, so buttons for writing and rating show while a tablemate is still speaking, and several students write and "broadcast" at once. The proposal: the table goes through **Talk → Write → Rate** together. Each screen shows only the buttons that work right now. There is always one line that says **whose turn it is and what comes next**. At Write, **one student holds the pen at a time**. The rest of the table reads that student's text as it is typed, as the main screen and not as a pop-up.

## 1. Audiences

| Audience | Goal | Must never see |
|---|---|---|
| Student at a table (12-15, Hebrew, phone, noisy room) | Speak once per round, write one proposal, rate the class's proposals | Buttons that do nothing yet; another table's text while it is being typed |
| Teacher (table card only) | See where each table is and unstick it | — (the full console is another spec) |

## 2. Today (from the code)

Always visible at Proposals, in every sub-state: the heading "הציעו פתרון לשאלה ״…״" (`proposals.heading`), the strip **מדברים | כותבים | מדרגים** (`turn.pill_*`, `SubStepStrip.ts`: three tappable buttons that move only this phone), the button **הכיתה כותבת** / "The class is writing" (`rate.class_writing`, `proposalsParts.ts`), which opens a sheet titled **כל ההצעות** (`proposal.class_list`), and the line **"{name} כותב/ת עכשיו"** (`answer.live_one/many`, `liveWritingParts.ts`), which opens the watch pop-up (`WatchView.ts`).

| Sub-state (code) | Student sees | Buttons beyond the four above |
|---|---|---|
| Talk, may speak (`may`) | Idle clock | **אני רוצה לענות** / I want to answer (`turn.answer`), **אני רוצה לוותר** / I want to pass (`turn.pass_answer`), **לעבור הלאה** / Move on (`turn.move_on`) — `TalkScreen.ts`, `MoveOn.ts` |
| Talk, someone speaks (`speaking`) | "{name} עונה" (`turn.answering`) + clock | Move on |
| Talk, my time (`mine`) | "הזמן שלכם" (`turn.answer_mine`) + clock | **סיימתי** / Finish (`turn.finish`) |
| Talk, I spoke (`spoke`) | "כבר עניתם" (`turn.answered_me`) | Move on |
| Talk, next round (`may`, turn+1) | Same as `may`; only the header number changes | Same as `may` |
| Talk, all rounds spoken (`done`) | "כולם דיברו. חכו למורה" (`turn.proposals_done`) | **סיימנו, לכתוב** / We are done, write (`turn.finish_talk`): moves only this phone |
| Write (`write`) | Box "ההצעה שלי" (`proposal.mine`), checkbox **משדרים את הכתיבה לשולחן** (`answer.broadcast`, on by default), "השולחן רואה…" (`answer.broadcast_on`) | **שליחת ההצעה שלי** (`proposal.send_mine`), **שלחנו, לדרג** / We sent, let's rate (`turn.to_rate`), after sending: **תגובות · n** (`reply.open`) and the push question — `WritePanel.ts` |
| Rate (`rate`) | The class's proposals with faces | Faces per card — `RateScreen.ts`, `RatedList.ts` |

Defects, most severe first:

1. **Buttons that should not be usable yet.** While a tablemate speaks, a phone shows up to six controls (three pills, class list, live line, Move on). A student can go and write in the middle of someone's talk (card 6KEXvzXK).
2. **"Wait" and "go" on one screen.** `done` says "wait for the teacher" and offers "We are done, write" in the same screen. The button moves only that phone, so the table splits and the teacher's card still says "talking".
3. **Everyone writes at once.** Broadcasting is on by default, so the screen can show "3 כותבים עכשיו", and the watch pop-up gets a picker to switch between writers. The pop-up sits over another screen and must close itself. That is the structural cause of the auto-close bug (card fJij2wMx).
4. **A false label.** "שלחנו, לדרג" (We sent, let's rate) shows before anything has been sent.
5. **No "what next" line.** "כבר עניתם" does not say who the table is waiting for. A new round starts with nothing on screen to say so. The write screen says "writing" three times (header "עכשיו: כותבים", pill, instruction "כותבים") and never says what comes after.
6. **Synonyms and clashes.** Talking at Proposals borrows Table talk's "answer" words (לענות, עונה, כבר עניתם), but nothing is being answered. The live text has two names ("broadcast / לשדר" and "writing / כותב"). "כל ההצעות" is both the sheet title and the next lesson step (`step.allProposals`). In English, "Turn" means both סבב (the round) and one person's time.

## 3. Objects and labels (one name each)

| Object | HE | EN | i18n key | Code | Change |
|---|---|---|---|---|---|
| Round (everyone speaks once) | סבב {n} מתוך {max} | Round {n} of {max} | `turn.header`, `console.turn_n` | `proposalsTurn` | EN value "Turn" → "Round"; HE kept |
| Speaker | {name} מדבר/ת · הזמן שלכם | {name} is speaking · Your time | NEW `proposals.talk.speaking`; `turn.answer_mine` kept | `speakerUid`, `speakerEndsAt` | Retire "עונה / answering" at Proposals (Table talk keeps it) |
| Ask to speak | אני רוצה לדבר | I want to speak | NEW `proposals.talk.claim` | `claimSpeaker` | Replaces `turn.answer` here; delete unused `turn.propose` |
| Spoke | דיברתם | You spoke | NEW `proposals.talk.spoke` | `spokenUids` | Replaces `turn.answered_me` here |
| Pass (speaking or writing) | אני רוצה לוותר | I want to pass | NEW `proposals.pass` (same value as `turn.pass_answer`) | `passSpeaking`, NEW `passWriting` | One verb for both |
| Pen (who writes now) | {name} כותב/ת | {name} is writing | `answer.live_one` kept | NEW `ClassTable.writerUid` | Retire "broadcast/לשדר": delete `answer.broadcast`, `answer.live_many`, `answer.live_started`, `answer.watch_*` |
| Ask for the pen | אני רוצה לכתוב | I want to write | NEW `proposals.write.claim` | NEW `claimPen` | — |
| Proposal | ההצעה שלי · שליחת ההצעה שלי | My proposal · Send my proposal | `proposal.mine`, `proposal.send_mine` kept | option under the challenge | — |
| Reply | תגובות · n | Replies · n | `reply.open` kept | `classReply` | — |
| Rating | מדרגים | Rate | `turn.pill_rate` kept | rating | — |
| Move on (stuck table) | לעבור הלאה | Move on | `turn.move_on*` kept | `moveOn` | Shown in one state only |
| Next line | הבא: … / מחכים ל… | Next: … / Waiting for … | NEW `proposals.next.*` | — | NEW |
| Class sheet | — | — | `rate.class_writing`, `proposal.class_list` | — | **Deleted** (the Rate screen is the list) |
| Duplicate instructions | — | — | `turn.instr_write_proposals`, `turn.instr_rate_proposals`, `turn.to_rate`, `turn.finish_talk` | — | **Deleted** |

The new keys go in all seven language files (he, en, ar, de, es, fa, nl). The live text itself (`liveDrafts`) stays as the data behind the pen. It has no label of its own.

## 4. Proposed flow

The phone always shows the table's step. The student never jumps ahead alone. The strip becomes a read-only marker, **מדברים › כותבים › מדרגים**, with the current part marked. Under it, the next line is always visible.

| # | State | Student sees | ONE action (or wait) | What moves them on |
|---|---|---|---|---|
| T1 | Round starts, nobody speaking, I have not spoken | "סבב 1 מתוך 2 · מי מדבר ראשון?" + empty clock. Next: "עוד לא דיברו: נועה, אבי" | **אני רוצה לדבר** (text button under it: אני רוצה לוותר) | Any tablemate's tap → T2 or T3 |
| T2 | My time | "הזמן שלכם" + clock | **סיימתי** | My tap or the clock → T4 / T1 / T5 |
| T3 | A tablemate speaks | "נועה מדבר/ת" + clock. Next: "אחרי נועה: מי שילחץ ראשון" | Wait for Noa. No buttons | Her tap or her clock |
| T4 | I spoke, others not yet | "דיברתם". Next: "מחכים ל: אבי, דנה" | Wait for the names. Only control: quiet **לעבור הלאה** (for a mate who left) | Last mate speaks, or Move on |
| T5 | Round over, another round left | "סבב 1 נגמר. סבב 2 מתוך 2: מי מדבר ראשון?" | Same as T1 | Same as T1 |
| T6 | All rounds spoken | "כולם דיברו. עכשיו כותבים" | **לעבור לכתיבה** — moves the whole table | One tablemate's tap, or the teacher's "לכתוב" |
| W1 | Pen free, I have not written | "מי כותב ראשון?" Next: "עוד לא כתבו: …" | **אני רוצה לכתוב** (text button: אני רוצה לוותר) | Any tablemate's tap → W2 or W3 |
| W2 | I hold the pen | My box "ההצעה שלי", line "השולחן רואה מה שאתם כותבים" | **שליחת ההצעה שלי** (text button: אני רוצה לוותר) | Sent → W4. A refused text stays in W2 |
| W3 | A tablemate holds the pen | "נועה כותב/ת" and her text appearing, read-only, as the screen. Next: "אחרי נועה: מי שילחץ ראשון" | Wait for Noa. No buttons | She sends or passes → W1, or W4 if I already wrote |
| W4 | I sent (or passed), others still writing | "נשלח" + my proposal card (תגובות · n), push question once. Below it, the live text of whoever holds the pen | Wait. Next: "מחכים ל: אבי" | Last mate sends or passes → R1 |
| R1 | Everyone wrote | The class's proposals, each with faces. Next: "דירגתם 3 מתוך 7" | Rate a card | Teacher opens the next step |
| R2 | All rated | "דירגתם הכל. הצעות חדשות יופיעו כאן" | Wait for the teacher | Teacher |

Rule behind the table: a screen has a button only when its tap works right now. A wait screen names who the table is waiting for.

## 5. Writing rules

1. **One pen per table.** Only the pen holder has a text box. Nobody writes while the table is talking.
2. **Taking the pen:** when the pen is free, every tablemate who has not written sees "אני רוצה לכתוב". The first tap wins, and a lost race just shows W3.
3. **What the table sees meanwhile:** the pen holder's text as it is typed (W3), on every tablemate's phone, as the screen itself. No pop-up, no picker, no checkbox. Other tables and the projector never see it.
4. **The pen comes back free when** the holder sends (after the language check), taps "pass", leaves the screen or loses the connection (the live text's existing disconnect cleanup), or the teacher frees it. Each of these ends the live text on every phone at once, because the state changes.
5. **Writing ends** when every tablemate with a phone has sent or passed. The table then moves to Rate by itself. People without a phone never hold the table up, as at Talk.
6. **One proposal per student** (the lesson default). With "unlimited", a student who has sent may take the free pen again until writing ends.

## 6. Teacher's table card (minimum)

- At Talk, the timer row reads "{name} מדבר/ת" instead of "{name} עונה". When the rounds are spoken, the card says "כולם דיברו" (NEW `console.proposals_spoken`) instead of "כולם סיימו": writing is still ahead.
- At Write, a NEW row: "נועה כותב/ת · שלחו 2 מתוך 4", or "אף אחד לא כותב · שלחו 2 מתוך 4".
- The quick buttons stay ("לכתוב", "סבב נוסף", "לדרג"). In the table sheet, the pen holder gets "לוותר בשם {name}" (`turn.pass_for`, kept), which frees a stuck pen.

## 7. Screen inventory (no new screen)

| Component | Fate |
|---|---|
| `TalkScreen.ts` | Changes: new labels, next line, states T1–T6 |
| `proposalsParts.ts` | Changes: one action per state; class sheet, "שלחנו, לדרג" and the always-on Move on go |
| `SubStepStrip.ts` | Changes: read-only marker, no buttons |
| `WritePanel.ts` | Changes: pen states W1–W4; broadcast checkbox goes; its dead Table-talk branches go (its own TODO) |
| `WriteBox.ts` | Kept; its read-only mode shows the pen holder's text |
| `liveWritingParts.ts`, `WatchView.ts` | **Go.** The live text becomes W3/W4's body. One polite live region ("נועה כותב/ת") stays in `TableFlow.ts` |
| `MoveOn.ts` | Kept, shown in T4 only |
| Class sheet (`Sheet` + `RatedList` overlay) | **Goes** from Proposals. `RatedList` stays as the Rate body |
| `proposalsTurn.ts` | Grows the write kinds. `showsWriteButton` goes |
| `TableFlow.ts` | The phone follows the table step (no per-phone override at Proposals) |
| `TableCard.ts`, `tableTurnConsole.ts`, `tableSheetTurn.ts` | Write row, the "מדבר/ת" label, pass for the pen holder |
| `AllProposalsScreen.ts`, `VoteScreen.ts` | Unchanged (later lesson steps) |

Data this needs (for the builder, not a design choice): `ClassTable.writerUid` and `writtenUids`, the engine actions `claimPen` / `passWriting`, and a successful send that releases the pen. The table moves to `rate` when every device member is in `writtenUids`.

## 8. Navigation and findability

The order is fixed: Talk › Write › Rate, then the teacher's next lesson step. There is no back path inside the step, and none is needed, because the table moves forward together. The Rate list keeps today's order and count line; it is the only long list.

## 9. Open questions for Tal

1. **One pen per table** (A, this spec), or everyone writes at once with no live text at all (B)?
2. **Talk → Write:** one tablemate's tap on "לעבור לכתיבה" (A, this spec), automatic when the last round ends (B), or only the teacher (C)?
3. **Write → Rate** automatically when everyone has sent or passed: yes/no? (No = only the teacher's "לדרג".)
4. Students can no longer jump between talk, write and rate on their own phone. This reverses the free sub-steps of 2026-10-25. Keep the strip as a read-only marker (A) or remove it (B)?
5. **Time limit on the pen:** none (A, this spec) or the lesson's speaking time (B)?

## 10. Handoff to UX

Fixed by this spec: the states and their single action, which buttons exist in each state, the labels, the writing rules, and the teacher-card rows.
Yours to decide: how the next line, the read-only marker and the live text in W3 look; where the quiet "pass" and "Move on" sit; the motion when the pen changes hands.
