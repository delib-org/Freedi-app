# IA spec — Agora results board ("מועצת הכפר" recap)

Trello S1bTjb7P. Scope: the recap screen a class reaches at the council once
the room is scored (`AgoraStage.results` / `ended`). The ballot screen is NOT
in scope (another branch adds the teacher's live-results switch there).

## Objects

| Object | Source of truth | Who writes it |
|---|---|---|
| Decision | `session.agreement.voteWinnerStatementId` (+ `voteWinnerMetThreshold`, `voteRejected`), fallback `leadStatementId` | server, once, when results open |
| Vote tally | `session.agreement.voteCounts`, `voteTotal` | server |
| Ranked proposals | `session.agreement.ranked[]` (`AgoraCarriedAnswer`: statement, mean, consensus, raters, anonName) | server |
| Student points | `agoraParticipants.points.total` and its category columns (`helping`, `rating`, `revising`, `appreciation`, `proposals`, `valueAccuracy`) | server triggers (the existing game economy — nothing new is minted here) |
| Class points | sum of every non-AI participant's `points.total` | derived on the client (`lib/leaderboard.ts`) |
| Display name | `participant.anonName` — generated handle, or the name typed at the door in a `named` session. Never the roster's real name (teacher console only) | server |

One name per concept: "decision" (ההחלטה), "vote" (ההצבעה), "proposals by
agreement" (ההצעות לפי הסכמה), "class points" (הנקודות של הכיתה). The word
"leaderboard" never appears in UI text — it is the points board.

## Hierarchy (top → bottom, one scroll on a 360px phone)

1. **Decision** — the shared moment. Trophy, "החלטנו!", the winning text, its
   author's handle, and the share of the vote as one big number. Confetti
   burst on first paint (CSS only, none under `prefers-reduced-motion`).
   Variants: decision met the bar / vote rejected the motion / no vote — the
   proposal with the most agreement / nothing rated.
2. **The class vote** — every candidate as a bar that grows in from zero,
   winner tinted, count and share on each. A one-candidate motion keeps the
   existing for/against pillars.
3. **All proposals, by agreement** — ranked rows: rank (medal for the top
   three that were actually rated), the text, author handle, a zero-centred
   agreement meter and the net-agreement figure, "N rated" as meta.
4. **Class points** — the personal-recognition channel. Class total first
   ("יחד צברנו N"), then a podium of the top three, then every student in
   points order. See the leaderboard rules below.
5. **What the room said so far** — unchanged, collapsed.
6. Install offer — unchanged.

Sections reveal in that order (staggered CSS delay) so the screen reads as a
sequence: decision → how we voted → how everything ranked → who earned what.

## Leaderboard rules (collaboration vs. individual)

- Collective channel = the decision + the class total. Individual channel =
  the ranked rows. Both are on the same card so neither eats the other.
- Ranked by `points.total`, then `joinedAt` (stable, never reshuffles).
- Standard competition ranking: ties share a rank, the next rank is skipped.
- Medals only for ranks 1–3 **with points > 0** — no prize for zero.
- The viewing student's own row is highlighted ("אתם") and is always visible.
- No "last place" treatment: rows below the podium are plain, zero is printed
  as 0 with no deficit styling, no red, no arrows.
- Every row carries a **role tag** for its strongest category (helper /
  rater / writer / reviser / appreciated / values) so a student who spent the
  lesson rating others has an identity on the board, not just a small number.
- AI raters are excluded upstream (`lib/session.ts` already filters `isAI`).
- The teacher projects the same board (no highlighted row). Real names never
  reach this screen in any role.

## Who sees what

| | Student | Teacher (projector / watch) |
|---|---|---|
| Decision, vote, ranked proposals | yes | yes |
| Class points board | yes, own row highlighted | yes, no highlight |
| Names | handles (`anonName`) | handles — same component, same data |
| Confetti / stagger | yes (off under reduced motion) | yes (off under reduced motion) |

## Screens touched

- `views/AgreementResults.ts` — recomposed from four components.
- `views/Results.ts` and `views/ConvergenceResults.ts` — gain the same
  points board card (additive).
- New components: `WinnerReveal`, `VoteTally`, `RankedProposals`,
  `PointsLeaderboard`. New pure module `lib/leaderboard.ts`. New stylesheet
  `styles/components/_scoreboard.scss`.

## Not doing

- No new points, no new server writes, no new collection reads.
- No per-student comparison with the class average, no deltas, no streaks.
- No change to the ballot screen or to note cards.
