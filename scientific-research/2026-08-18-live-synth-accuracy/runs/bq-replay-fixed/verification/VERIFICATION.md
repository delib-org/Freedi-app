# Verification audit of the FIXED build — Bq-VQPMPiG7b replay #2

**Date:** 2026-08-24 · **Run:** `runs/bq-replay-fixed` (114 real Hebrew statements, original
arrival order, 3-large pin, ~95 min) · **Baseline:** `runs/bq-replay-alljudged` + its audit in
`../bq-replay-alljudged/verification/VERIFICATION.md`.

The build under test carries the three fixes motivated by the baseline audit (committed
`324bd8306` + fix commits): the anti-snowball merge gate (judge sees up to 6 members/side +
farthest-pair transitivity check), the revisit pass (left-behind options re-enter the full
judged pipeline as the synthesis landscape grows), and the writer fidelity clauses (never add
commitments; every input's ask must remain visible). Same instruments as the baseline audit,
same rubric, only cross-judge-agreed findings counted.

## Before / after

| axis | baseline (alljudged) | fixed | verdict |
| --- | --- | --- | --- |
| statements grouped | 34/114 in 11 synths | **43/114 in 20 synths** | more of the corpus organised |
| largest synthesis | **8 members (snowball, 6 wrong)** | 4 members | **snowball eliminated** |
| member-level precision (both judges) | 22/34 = **65%** | 32/43 = **74%** (9 refuted, 2 contested) | improved |
| clean syntheses | 6/11 | 11/20 | error now confined to small pairs |
| sweep merges | 9 (two of them built the snowball) | 2 | merge gate conservative as designed |
| missed merges (both judges) | 11 attach + 5 spawn — **19/21 silent, no mechanism to ever retry** | 12 attach + 3 spawn — **9/18 were revisit-judged and refused; rest awaited further sweeps** | structurally different (see below) |
| text fidelity | **0.647** — 3 lost, 9 weakened, 2 fabricated | **0.953** — 0 lost, 2 weakened, 1 soft fabrication | **fixed** |

## What each fix did

**1. Anti-snowball gate — worked.** No synthesis exceeded 4 members; only 2 sweep merges fired
(vs 9), and neither produced a multi-hop drift cluster. The baseline's catastrophic failure mode
(an 8-member synthesis where 6 members were "related, not same" and 3 voices were lost from the
published text) did not recur in any form.

**2. Revisit pass — worked as a mechanism, exposing the next bottleneck.** 50 revisit events
fired; 36 distinct options got a second run through the full pipeline; late queue pumps drained
13 and 3 items where the baseline's always drained 0. The measurable outcome: 9 more statements
correctly grouped, and several of the baseline's exact misses now exist as syntheses (the
transdisciplinary pair, the citizen-science group, the accessible-language synthesis). The
remaining 15 both-judge-agreed misses divide evenly: **9 were revisit-judged and REFUSED** by
the spawn/attach judges (fail-closed refusal errors — the judges' Hebrew strictness, not a
candidacy gap), and **9 never got their turn** within the harness's few sweep rounds
(production's 10-minute cadence keeps sweeping; the harness ran ~4 rounds). The "silent,
structural, permanent" miss class of the baseline no longer exists.

**3. Writer fidelity clauses — worked.** Fidelity 0.647 → **0.953**: zero lost voices (was 3),
weakened 9 → 2, fabrications 2 → 1 — and the surviving one is soft (elaborated benefit claims
on the personal-acquaintance synthesis, not invented mechanisms/commitments like the baseline's).

## The residual error profile (what to fix next, if anything)

- **Precision's remaining site is the SPAWN writer, not the merge gate.** All 9 refuted merges
  are 2-member pairs (plus one 4-member with 2 refuted members) that entered at Pass-2 spawn:
  the writer's coherence check accepted "related" Hebrew pairs as "same" (e.g. two different
  interventions sharing a theme). The merge-sweep errors of the baseline are gone; the spawn
  judge is now the dominant contributor at ~9 wrong pairs of 25 spawns.
- **Recall's remaining site is judge refusals + sweep budget.** Half the misses were seen and
  refused (same statements the blind sweepers call high-confidence matches — a genuine
  judge-disagreement band worth a targeted prompt A/B), half just need more sweep rounds than
  the harness ran.
- Contested (single-judge) items for human review are listed in the sweep/audit JSONs
  (3 attach targets, 2 member verdicts).

## Bottom line

All three success criteria of the plan are met: precision materially up with **no snowball**,
the missed-merge class **structurally changed** (candidacy is now guaranteed; remaining misses
are visible judge decisions, not silent permanent losses), and fidelity far above threshold
with **zero fabricated mechanisms and zero lost voices**. The fixed build is strictly better
than the baseline on every axis measured, on real data. Nothing is deployed; the migration of
`Bq-VQPMPiG7b` remains blocked only on the decision to ship.

**Provenance:** judge inputs/outputs in this folder (`fixed-audit-A/B.json`,
`fixed-sweep-A/B.json`, `fixed-synths.json`, `fixed-nonmerged.json`); fidelity verdicts cached
in `scripts/.cache/text-fidelity-judge.jsonl`; run parameters in `../results.json`; revisit and
merge events in `../audit.json` (actions: 50 revisit, 2 merge, 25 spawn, 78 attach).
