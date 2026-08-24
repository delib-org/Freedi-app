# Distance, Alignment, Convergence — a short methods report

**Project:** Israeli Odyssey → Agora civic game (Freedi) · **Date:** 2026-08-24
**Scope:** (1) how party stands were constructed; (2) how they are evaluated against a player's preferences; (3) how "coming closer" is measured in the Agora.
**Full method report:** `REPORT.md` (same folder). **Metric spec:** `apps/agora/docs/opinion-distance-and-map.md`.

---

## 1 · Constructing the party stands

The unit of measurement is the **individual statement (היגד)**, not the issue: each of Israel's 11 Knesset parties received a continuous score **e_p(s) ∈ [−1, +1]** on each of 48 deliberative statements (12 topics × 4), where −1 = strongly opposes and +1 = strongly supports the *exact wording*, qualifiers included.

Scores were estimated from the public record under a strict **evidence hierarchy**: recorded Knesset votes ≻ official platforms ≻ leader statements attributable to the party line ≻ governing behavior (budgets executed vs. rhetoric) ≻ flagged ideological inference. Research ran as **one web-search agent per topic** (Hebrew sources, 2022–2026, recency-weighted), each returning per-cell score + confidence (high/medium/low) + rationale + citations under a fixed JSON contract. When no published position exists, the cell is estimated from the party's general ideology and flagged `inferred` (forced low confidence) rather than silently zeroed — full coverage keeps low-documentation parties from biasing their own distances.

A validator enforces range, coverage, and the citation/inference invariants; the dataset then passes a **human review gate** (auditable per-cell review sheets) before production. Result: 528/528 cells, 592 citations, confidence high 41% / medium 40% / low 19%, 18% inferred; only 13.6% of scores are at the ±1 extremes, versus 100% under the previous one-declared-stance model.

## 2 · Evaluating party stands against a player's preferences

Playing the game *is* the player's measurement: on each statement the player marks support (+1), can-live-with (+0.5) or oppose (−1) — ordinary Freedi evaluations. Player and party thus occupy the same space, and one metric serves both comparisons:

> **d(a, b) = mean over shared statements of |e_a(s) − e_b(s)| / 2  ∈ [0, 1]**

0 = identical routes, 1 = maximally opposed. Parties enter as *virtual users* via their researched attitude maps; the same formula runs player↔party and player↔player. A minimum-overlap rule guards against noise (a player-pair distance needs ≥5 shared statements; a party ship reacts from the first shared island). Because the comparison is statement-level, distance is not a bloc tautology — cross-cutting topics (e.g., direct family aid, where all 11 parties score positive) let a player be near one party on economics and far from it on religion & state.

Presentation follows two honesty rules. Proximity bands ("close to your route / midway / drifting away") display the scalar with the caveat that closeness is *temporary anchoring, not a voting instruction*. The 2-D opinion map embeds all pairwise distances by classical MDS and **hides itself when unfaithful**: fidelity (Pearson r between true and drawn distances, plus stress and variance-explained) is always computed, and the map only renders when r ≥ 0.8.

## 3 · Measuring "coming closer" in the Agora

When island deliberations open onto the Agora, the event scores itself on whether the room actually converged — using the *same* distance metric, so game and event cannot disagree about the same people.

- **Baseline.** On entering the square, each participant's current statement evaluations are snapshotted (`stanceBaseline`). The snapshot is essential: the closing re-rate overwrites the same evaluation documents, destroying the before-picture otherwise.
- **Re-rate.** At closing, participants restate where they now stand on the island's statements; these are written back as ordinary evaluations (so the Odyssey map immediately reflects the deliberation) and convergence is recomputed.
- **Estimator.** Mean pairwise distance before (D̄_before) and after (D̄_after), computed **over the identical set of participants and the identical set of pairs**: anyone missing either half is dropped from *both* means, and a pair counts in both or in neither. This is the anti-attrition guard — a room that merely emptied of dissenters cannot report convergence. Overlap floor per island: min(3, statement count), since the voyage-wide floor of 5 is unreachable on a 4-statement island.

> **Convergence = (D̄_before − D̄_after) / D̄_before × 100**

— the percent of the room's initial disagreement that closed. The score is deliberately **signed** (a deliberation that polarized the room reports negative), and a room that began in perfect agreement scores 0 rather than dividing by zero. The estimator is covered by unit tests and a 26-check end-to-end suite (baseline preserved, same-population rule, positive-score path, answers landing back on the island).

## 4 · Validity notes

Party stands are single-coder LLM estimates pending human review; a second-model disagreement pass is the recommended next step. Convergence measures *movement of stated positions*, not their quality — social-desirability pressure at the closing re-rate is an acknowledged threat, partly mitigated by re-rates being ordinary private evaluations rather than public declarations. Both instruments are dated (2026-08-24) and the party dataset carries a standing re-estimation protocol for new statements and post-event drift.
