# Main app: Discussion bottom edge — IA spec

Status: implemented
Date: 2026-11-09
Supersedes: none

Trello card syR0RaIn: "Main app: at the bottom there are too many elements."

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Participant on a phone or tablet (under 1024px) | Write in the discussion of a question, answer or statement | Two stacked control layers at the bottom |
| Admin / host | Same, and still reach Host, settings and maps | Nothing new; their controls stay in the header |

## 2. Object model
No new objects. The screen is the Discussion tab of a Statement (question, answer/option or statement). Group Discussion and compound questions are different cases (see inventory).

## 3. Labels
No new keys or names. Home = i18n key `Home`, route `HOME_PATH` (`/home`). Inbox and Me keep their current labels.

## 4. Hierarchy
Unchanged. Home stays reachable from every question screen: through the floating bar where it remains, and through the first row of the header Menu where the bar is hidden.

## 5. Navigation model
- Problem: on a phone the Discussion tab stacked the chat input (about 92px) above a floating Home / Inbox / Me / + pill (80px lane) plus a 32px dead strip under the content: about 204px, roughly a quarter of the screen.
- Decision: under 1024px, hide the floating bar on the Discussion tab of a question, answer or statement. The chat input is the only control at the bottom (about 92px).
- Rejected alternative: keep the bar and remove only the "+". The pill stays the same height and the two-layer stack remains.
- Where the bar's items go: Inbox is already in the header; Me is already the avatar row in the header Menu; Home becomes the first row of that Menu.
- `BottomNav` is drawn by `AppThinkingSpace` (mounted by `StatementContent`). On 1024px and up `BottomNav` is already `display: none`, so desktop only gains the extra Home menu row.

## 6. Task flows
Role: participant, task: write in the discussion (2 steps)
1. Question, Discussion tab — type in the chat input.
2. Send.

Role: participant, task: go Home from a discussion (3 steps)
1. Header — open Menu.
2. Tap Home (first row).
3. Home.

## 7. Screen inventory
| Screen | Route | Bottom bar |
|---|---|---|
| Discussion of question, answer or statement | `/statement/:id?tab=chat` | hidden under 1024px |
| Group Discussion | same | stays (its "+" asks a question in this group) |
| Compound question "chat" tab (phase screen, no input) | same | stays |
| Background, Answers, Questions, Results, Maps tabs | same | stays |
| Home, Me, settings, maps | various | unchanged |

`StatementBottomNav` never renders on Discussion and `AddAnswerFab` exists only on Answers; both are untouched.

## 8. Findability
Not affected.

## 9. Open questions and assumptions
Follow-ups, deliberately not part of this change: Notifications / Inbox synonym; input placeholder wording; tree-view reply input position (it is `position: fixed`); `--page-bottom-clearance` is never defined.

## 10. Handoff to UX
Fixed by this spec: bar hidden on the cases above; Home as first Menu row; chat input and send unchanged; header Inbox, Back and Host chip unchanged; gear and accessibility button unchanged.
Yours to decide: nothing further.

Acceptance: on a phone the Discussion tab shows the input at the very bottom with no bar and no empty strip; Answers shows the bar without a blink; switching tabs removes and restores it; Home menu row lands on Home; tree-view discussions can scroll the last card clear of the input; desktop unchanged apart from the Home row.
