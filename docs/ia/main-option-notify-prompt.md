# Main app: Answer notification prompt — IA spec

Status: draft
Date: 2026-11-09
Source: Trello 6sHeWQgD

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Person who publishes an answer (signed-in or anonymous uid) | Choose what to be told about after publishing | The browser permission dialog before pressing Save; this prompt twice on one question |
| Host seeding or curating answers | Set up the question uninterrupted | This prompt on bulk add, cluster duplicate or mind-map placeholders |

## 2. Object model
- **Answer** = `StatementType.option`, parent is a `StatementType.question`. The prompt exists only under a question parent.
- **Reply** = `StatementType.statement` child of an answer (its Discussion tab). **New answer** = option child of the question.
- **Notification choices** (what to hear about) are separate from the three existing channel booleans (how to hear it).
- **Question subscription** (`{uid}--{questionId}`) is the single home of three values: replies choice, new-answers choice (each true, false or absent), and a prompt-closed marker.
- **Answer subscription** (`{uid}--{answerId}`) holds no choice. It keeps channels and tokens as today.
- Why the question document: later answers reuse the choice with zero writes, and a settings change is one field write.
- Lifecycle: not asked → closed without answering (marker only, choices absent) → answered (both booleans plus marker), editable forever.
- Server, in `notifyStatementSubscribers`; `false` vetoes that event on every channel, true or absent means no veto:
  - New answer (option child, question parent): skip subscribers whose subscription has new-answers `false`. No extra read.
  - Reply (statement child, option parent): for `parent.creator.uid` only, read their question subscription; skip if replies is `false`. One read per reply. Other subscribers of that answer are unaffected.
- **Unanswered people keep today's behaviour.** Discussion messages on the question itself are never gated. Master mute, app mute, `mutedUntil` and frequency still apply above the choices.
- **One deliberate change to today:** paths 4 and 6 below must write the author's answer subscription at creation (as `createStatementWithSubscription` does). Without it, "replies" can never deliver on those answers.
- Facilitator nudges ignore the choices. Copy for a new answer must not say "reply" (today's subject line and default `triggerType` do).

## 3. Labels
Keys follow the natural-English convention. New keys go in all 7 files (en, he, ar, de, es, fa, nl).
| Concept | EN | HE | i18n key | Code | Retire in this flow |
|---|---|---|---|---|---|
| Answer | answer | תשובה | `Your answer`, `Answers` (exist) | `StatementType.option` | option/אפשרות, solution/פתרון, suggestion/הצעה |
| Prompt title | Get notified about this question? | לקבל התראות על השאלה הזו? | new | notification choices | message/הודעה, update/עדכון |
| Choice 1 | Replies to my answers | תגובות לתשובות שלי | new | replies choice | comments, responses, chat |
| Choice 2 | New answers to this question | תשובות חדשות לשאלה הזו | new | new-answers choice | new options, new solutions |
| Confirm / dismiss | Save / Not now | שמור / לא עכשיו | `Save`, `Not now` (exist) | | |
| Before permission | Your browser will ask for permission next. | הדפדפן יבקש אישור בשלב הבא. | new | | |
| Push blocked | Push is blocked in your browser settings. You can still see notifications here. | (exists) | exists | | |
| iOS, not installed | Install the app to your home screen to get push notifications. | (exists) | exists; action `Install app` exists | | |
| Unsupported device | This device can't show push notifications. You can still see them in the app. | המכשיר הזה לא יכול להציג התראות דחיפה. עדיין אפשר לראות אותן באפליקציה. | new | | |
| Settings section | What to notify me about | על מה לקבל התראות | new | notification choices | |
| Settings entry | Notification settings | הגדרות התראות | exists | | `Notification Settings` (capitalised duplicate) |
No new route segment. Labels are noun phrases or infinitives, so Hebrew stays gender-neutral.

## 4. Hierarchy (role: person who published an answer)
0 Question
1   Add answer (existing sheet or modal)
2     Notification choices prompt (overlay, returns to where the person was)
1   Menu or bell → Notification settings (panel)
2     What to notify me about (question only)
2     How to notify me (existing channels)

## 5. Navigation and where the prompt appears
- One host, mounted once in AppShell beside `AddStatementSheetContainer`. Add paths only report "answer published (questionId, answerId)", so the prompt survives sheet close and navigation. A multi-split publish raises one prompt.
- It shows after the add surface closes and the write is local; it does not wait for the server. Show only if the question subscription has no marker.
- Form: atomic `Modal` molecule, `Checkbox` atoms, `Button` atoms. It has no route and no deep link.
- Back, close, backdrop, Esc and Not now are all the same dismiss.

| # | Path | Code | Prompt |
|---|---|---|---|
| 1 | Add-answer sheet (FAB; `/statement/:id/addOption` becomes `?add=1`; `AddSolutionPrompt` leads here) | `AddAnswerSheet`, `useCreateStatementFlow` | Yes |
| 2 | Shell add sheet, any opener, intent answer, commit `db` | `AddStatementSheet` | Yes; `storeTemp` no (unpublished) |
| 3 | Bottom-nav refined idea | `StatementBottomNav.tsx:257` | Yes |
| 4 | Legacy modal, when option type is chosen (evaluation page, suggestion card, chat card, enhanced map) | `CreateStatementModal`, `createStatementFromModal` | Yes; add answer subscription |
| 5 | New-statement form and similar screen (multi-stage included) | `GetInitialStatementData`, `SimilarStatements` | Yes |
| 6 | Better wording as a new answer | `OptionImprovement` | Yes, over the new answer's Discussion; add answer subscription |
| 7 | Supports a similar answer instead of publishing | `SIMILARITY_SUPPORTED` | No, nothing added |
| 8 | Message converted to an answer | `changeStatementType` callers | No, not an add; the choices still apply |
| 9 | Bulk add, cluster duplicate, mind-map placeholder nodes | `BulkAddOptions`, `ClusterBoard.duplicate`, `mindMapStatements` | No, host or placeholder |

## 6. Task flows
Answer first time (existing add + 1 or 2 taps): 1. Add sheet, publish. 2. Prompt, change boxes (optional). 3. Save.
Answer again on the same question (no added steps): 1. Add sheet, publish. Prompt does not appear.
Change later (3 taps): 1. Question header menu or nav bell. 2. Notification settings. 3. Toggle a choice; saved at once.

Rules:
- **Default state:** Replies ticked (one's own words, low volume, matches today). New answers unticked (can be dozens on a live question).
- **Key:** the marker on the person's question subscription, so it holds per person, per question, across devices. Someone with older answers is asked on their first answer after release.
- **Dismiss:** writes the marker only, choices stay absent, today's behaviour continues, and the person is not asked again on that question. Closing the app before answering writes nothing, so the next answer asks.
- **Save with both unticked** is a valid answer (`false`, `false`).
- **Saving a yes:** switches in-app on for the matching subscription if it was off, and never switches a channel off. If permission is granted, register push and the token on the matching subscription (question for new answers, this answer for replies), because the answer was created before the prompt.
- **Writes** must update the existing document. `setStatementSubscriptionToDB` returns early when the document exists.

Browser permission, by state when the prompt opens:
| State | In the prompt | On Save with at least one tick |
|---|---|---|
| granted | No line | Register tokens, close |
| default | "Your browser will ask" | Choices save and the dialog fires, from the Save click itself (do not await a write first). Not fired on Not now or with no ticks. If refused: the Push blocked line once, no retry |
| denied | Push blocked line | Save; in-app still delivers |
| iOS, not installed | Install line and `Install app` action (saves ticks, then opens the existing install prompt) | Save; no dialog |
| unsupported | Unsupported line | Save; no dialog |

## 7. Screen inventory
| Screen | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|
| Prompt | Capture the two choices once | n/a | Not shown until the marker is known | Save fails: logged, prompt closes, no marker, asks next time | Lines above | Closes to the prior screen |
| What to notify me about | Show and change the choices | Absent choices display as ticked (today's effective behaviour) | Existing | Revert toggle | Must render in every permission state | Saved inline |

Settings defect to fix: `NotificationSettingsButton` returns null when push is unsupported and replaces the panel when permission is default or denied. The choices govern in-app too, so the entry and this section must stay reachable; only the push area shows the permission state. Answering here also sets the marker. Answer-level panels are unchanged.

## 8. Findability
Not applicable: two fixed rows, no list.

## 9. Decisions on open questions
Answer word: answer. Unticked: silent on all channels. Default ticks: Replies on, New answers off. Volume: existing frequency. Converted messages: no prompt.
