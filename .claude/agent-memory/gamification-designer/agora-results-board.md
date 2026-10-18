---
name: agora-results-board
description: Accepted design of the Agora results board (Trello S1bTjb7P, 2026-10-18): game-reveal recap + class points board rules; what was deliberately NOT done
metadata:
  type: project
---

Built 2026-10-18 on branch `feat/agora-gamified-results` (Trello S1bTjb7P, "make the results board game-like + show every student's points in order"). Spec: `docs/ia/agora-results-board.md`.

**Accepted leaderboard rules (PointsLeaderboard + lib/leaderboard.ts):**
- Ranks by the game's existing `participant.points.total` — NO new points minted, no new reads (participants already stream via lib/session.ts).
- Collective channel first (class total "יחד צברנו N"), then individual rows. Same card, kept distinct.
- Standard competition ranking (ties share, next rank skipped), roster-order tie-break so the list never reshuffles.
- Medals only for rank ≤3 WITH points > 0. Podium placed by SLOT (2nd–1st–3rd), tinted by RANK — ties at the top still get three steps (first version collapsed when three students tied at rank 1).
- My row highlighted, zero printed plainly, no bottom/deficit styling.
- Role tag per row = strongest point category, collaborative roles win ties (helping > rating > revising > appreciation > proposals > valueAccuracy) — gives raters/helpers an identity, not just a small number.
- Teacher projects the same board with no highlighted row; names are `anonName` only.

**Why:** Tal asked for "points of participants in order of results" — a ranked board — so the collaboration safeguards are structural (no last-place, class total first, role identity, medals only when earned) rather than refusing the ranking.

**Rejected / not done:** per-student delta vs class average; streaks; a "most improved" ladder; re-sorting live during the lesson (the board is finale-only, like HelpersBoard's rule); a prettier reformat of i18n.ts (43 pre-existing errors on main — left alone to avoid conflicts).

**How to apply:** any future Agora recognition surface should reuse `buildLeaderboard`/`podiumRows` and the `.scoreboard` BEM block rather than a second ranking; if Tal asks to show points mid-lesson, point back to the finale-only decision first.
