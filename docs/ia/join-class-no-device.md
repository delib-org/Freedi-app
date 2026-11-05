# join-class: Students without a device and the proposal limit — IA spec

Status: implemented on `feat/class-proposals-proxy` (not deployed); the defaults in §9 are provisional, Tal was asked and has not answered
Date: 2026-11-05
Cards: Trello siS949fy ("Let the teacher decide whether students may submit one proposal or more"), hz4jk97f ("Some students will not have phones, so the teacher can submit proposals on their behalf and also vote on their behalf. There can be several such students")
Supersedes: nothing. Extends docs/ia/agora-classroom.md §24.3 (a student's one proposal) and §16.9.5 (no-device members never gate a table).

What Tal agreed:
- Votes and proposals entered by the teacher count like any other.
- "Entered by teacher" appears only on the teacher's screen, never to students or on the projector.
- The proposal limit is a teacher setting with two values, one or unlimited, starting on one, enforced on the server.

This spec was first written from reading the code. §11 lists what building it showed to be wrong or missing.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Teacher (console, desktop or phone, Hebrew first) | Enter proposals and votes for students without a phone, without ever landing one on the wrong student | |
| Student with a phone (12-15, anonymous) | Send one proposal or several, as the teacher set | "Entered by teacher"; the name of a student without a device on a proposal or a vote |
| Projector | Show the class's proposals and votes | "Entered by teacher"; who entered what |

## 2. Object model
- **No-device student**: the existing `NoDeviceMember {id: nd_*, name}` on `ClassTable.noDeviceMembers`. At most 5 per table when added. Has no account: no subscription, no credits, no pushes.
- **Proposal**: `classPostProposal` gains optional `forStudentId`, the lesson's teacher only, the id must sit at a table of this lesson. Writes an option under the challenge question with `creatorId: nd.id`, `creator: {uid: nd.id, displayName: '', photoURL: null, isAnonymous: true}`, `classTable: {tableId, shared: false, coAuthors: [], enteredByUid: actor}`.
- **Name**: never on a statement or a vote. Every phone loads proposals, while `classTables` reach only table-mates and admins. Teacher screens resolve the name by id (`noDeviceNamesById`).
- **Vote**: `votes/{nd.id}--{challengeId}`, `userId: nd.id`, `enteredByUid: actor`, written by the admin callable `classCastVoteFor`, which repeats the rule's `classBallotOpen` check in the transaction that writes. Tallied by the same trigger as any vote.
- **Proposal limit**: `statementSettings.proposalLimit` on the lesson, absent = one, read through `proposalLimitOf()`. A plain string on the schema, not a picklist (strict-parse trap). A prepared game carries it (`ClassGameSettingsSchema`).
- **Present count**: `statementSettings.noDeviceCount`, server-maintained, recounted from the tables by `classAddNoDevice` and `classAssignTables`, for phones, which cannot read other tables. The console and the projector count from the tables.
- **Who may write what**: a proposal comes only from `classPostProposal`. No client creates one, moves or turns anything into one, or rewords one. No client writes `enteredByUid`, on a vote or a statement. No client changes `creatorId`, `creator` or `classTable` on a statement that carries `classTable`.

## 3. Labels
| Concept | EN label | HE label | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| No-device student | No device | בלי מכשיר | `console.no_device` (existing) | none | `NoDeviceMember` | "no phone" |
| Propose action | Propose on behalf of {{name}} | להציע בשם {{name}} | `console.propose_for` | none | | |
| Save an edit | Save on behalf of {{name}} | לשמור בשם {{name}} | `console.save_for` | none | | |
| Vote action | Vote on behalf of {{name}} | להצביע בשם {{name}} | `console.vote_for` | none | | "Vote for {{name}}": reads as voting for Dana |
| Proposal confirmation | The proposal on behalf of {{name}} was sent | ההצעה בשם {{name}} נשלחה | `console.proposal_sent_for`, `console.proposal_saved_for` | none | | |
| Vote confirmation | {{name}}'s vote was counted | ההצבעה של {{name}} נקלטה | `console.vote_counted_for` | none | | |
| Next | Next: {{name}} | הבא: {{name}} | `console.act_for_next` | none | | |
| Marker | Entered by teacher | הוזן על ידי המורה | `console.entered_by_teacher` | none | `classTable.enteredByUid`, `Vote.enteredByUid` | |
| Setting | Proposals per student | כמה הצעות לכל אחד | `console.proposal_limit`, `_one`, `_unlimited`, `_help` | none | `ClassProposalLimit` | |
| Limit reached (phone) | You can send one proposal | אפשר לשלוח הצעה אחת | `proposal.limit_reached` | none | | |
| Limit reached (sheet) | {{name}} already has a proposal. It can be edited | כבר יש הצעה בשם {{name}}. אפשר לערוך אותה | `console.act_for_limit` | none | | |

The rest of the sheet's lines are `console.act_for_*`. Every key above is in all 7 locales, in `src/lib/locales/actFor/`.

## 4. Hierarchy (per role)
Role: teacher
0 Lesson console `/t/:mid`
1   Switch band: "בלי מכשיר (2/5)"
2     Act-for sheet (over the console, no route)
3       One student: name and table, then their proposal or vote
3       Students by table, with done marks
3       Add a student without a device, with a table choice
1   Settings popover: "כמה הצעות לכל אחד"
1   Plan screen `/t/:mid/plan`: "כמה הצעות לכל אחד"

Role: student
0 Proposals step
1   Write box
1   Own proposals, when there may be several

## 5. Navigation model
- Entry points to the sheet: "בלי מכשיר (2/5)" in `SwitchBand`, opening at the first student not done; a no-device chip on a table card and the row in `TableSheet`, both on that student.
- Back path: Close, Escape or the scrim return to the console. From the table sheet's row, the table sheet closes first, so Close still lands on the console.
- No deep link: the sheet has no route.
- The console stays live under the open sheet, and the band's count keeps moving.

**Knowing whose behalf (critical: a vote must never land on the wrong student):**
- The header always shows name and table number.
- The action label and the confirmation repeat the name.
- Each student has their own vote listener, `VoteCaster` and draft, bound to `nd.id` when made; nothing carries over between students.
- The server receives the id explicitly.
- Moving to another student is always a tap, never automatic, also after adding a student.
- When a student's listener stops, their caster forgets every pick: nothing remembered is ever sent without a new tap.

## 6. Task flows
Role: teacher, task: propose for a student (4 steps)
1. Band or chip — opens the sheet on Dana.
2. Type, "להציע בשם Dana".
3. The confirmation names Dana. On a failure the draft stays, with an inline retry; changed words go out under a new id.
4. Tap "הבא: Noa".

Role: teacher, task: vote for a student (3 steps)
1. Band or chip — opens the sheet on Dana; her current vote shows.
2. Pick a card (pick = vote, changeable while the ballot is open): "ההצבעה של Dana נקלטה".
3. Tap "הבא: Noa".

Role: teacher, task: set the limit (2 steps)
1. Settings popover or plan screen, beside the turns at Proposals.
2. Pick one or unlimited. Switched back to one: nothing is deleted or hidden; proposals stay listed, votable and editable; anyone holding one or more cannot add; a phone mid-draft keeps its text and sees `proposal.limit_reached`. The teacher's own proposals obey the limit the same way.

Role: student, task: send several (3 steps)
1. Write, send.
2. The proposal joins the list of own proposals, each with edit and replies; the box is empty.
3. Write the next one.

## 7. Screen inventory
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Act-for sheet, proposal part | none, over `/t/:mid` | Send or edit a proposal for one student | Add form with a table choice | | Inline retry, draft kept | Server refuses anyone but the lesson's teacher | Confirmation names the student |
| Act-for sheet, vote part | none, over `/t/:mid` | Cast one student's vote | "The vote is not open yet" | | Inline retry | Same | Confirmation names the student |
| Student write panel | existing | Send or edit own proposals | Box only | existing | Inline retry, draft kept | existing | Listed among own proposals |

Availability:
- Proposals: steps `proposals` and `allProposals`, until the ballot freezes, independent of table sub-steps. Existing ones stay editable; the language check stays off for the teacher.
- Votes: step `vote`, ballot open only. Paused, closed or held: read-only.
- Other steps: chips are inert, the row offers nothing and the band is not shown.
- "Entered by teacher" appears in `ProposalBlock` and `WhatTheyWrote` only.

## 8. Findability
At most 5 per table when added, so the sheet lists students grouped by table, with done marks, one look away. No search.

## 9. Open questions and assumptions
Provisional defaults; Tal was asked and has not answered:
- Raw documents may carry `nd_*` ids and `enteredByUid` with no names, as long as they are never rendered to students. Any signed-in client can read them.
- Rating on behalf stays out (`console.rate_for` stays disabled), so no-device students' ratings don't count, apart from the auto +1 on their own proposal.
- Exports show blank names for these students until resolved by id.

Assumptions:
- A re-split never drops a student: each stays at their table number if it has room, the rest go to the emptiest table, and that may pass the cap of 5. A lesson with only such students keeps one table.
- Nothing removes a no-device student today. Whatever adds removal must recount `noDeviceCount`.
- A lesson from before `noDeviceCount` undercounts on phones until its next add or re-split.
- Hidden proposals count toward the limit.
- A teacher moving an option under a class challenge, or turning a statement there into an option, from the main app's map is refused: the callable is the one way in.

## 10. Handoff to UX
Fixed by this spec: the objects, labels, entry points and the rules of §5.
Yours to decide: the look of the sheet, built with the table sheet's shell and design tokens.

## 11. What the first version of this spec got wrong
Credits and accounts:
- It named only `updateVote` as crediting `nd_*`. `trackStatementCreation` and the evaluation trigger (the auto +1) credit too. All three are guarded in `trackEngagement.ts`.
- It missed `setupAdminsForStatement`, which would have made an admin subscription for an id nobody can sign in as.

The setting:
- It missed the game snapshot's whitelist, which would have dropped a limit set on the plan screen.
- It wrote the field as a picklist; the strict-parse trap makes it a string, narrowed by `proposalLimitOf`.

Rules, which it took to be stronger than they were:
- A student could write `enteredByUid` on their own vote or statement.
- A student could change `creatorId`, `creator` or `classTable` on their own proposal or answer, handing it to a classmate or to `nd_*`.
- A student could make a proposal without the callable, skipping the limit and the language check, by moving their answer under the challenge or by creating a `statement` there and turning it into an option. `rewordsClassProposal` looked only at the document as it stood.

Behaviour:
- "At most 5 per table" holds when adding, not after a re-split to fewer tables.
- A `VoteCaster` kept a pick after its listener stopped, and could send it again when the next listener answered "no vote": a vote nobody tapped.
- A retry reused its proposal id even after the text changed, so the server answered "sent" and dropped the new words.

Confirmed as written: the votes rule allows only your own slot; `autoEvaluatorUids` checked only `memberUids`; "present" counted the roster only; `newTable` reset `noDeviceMembers`; `ownProposalOf` returned the first match; `myProposal` was singular; `classEditProposal` already allowed the teacher; `TableCard` hides "+ no device" at `allProposals`, `vote` and `summary`.
