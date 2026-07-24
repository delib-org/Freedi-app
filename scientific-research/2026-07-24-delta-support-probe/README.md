# Δ-Support Probe — Embedded Measurement of Convergence in Deliberative Events

- **Date:** 2026-07-24
- **Status:** Method design + implementation spec (pre-registration stage — no data collected yet)

## Abstract

Can we tell, during a live deliberative event, whether support for the leading
proposals is actually growing? This study designs an **embedded probe**
method: in the Mass-Consensus evaluation flow (batches of 6 proposals per
participant), one slot per batch from batch 2 onward is filled with a proposal
from the current top set ranked by average evaluation. The statistic is the
per-user, within-batch delta between the probe rating and the participant's
mean rating of the sampled items, aggregated as Δ(r) across batch indices,
with top-set churn and probe-rating dispersion as companion metrics. The
design is participant-invisible, costs ≈12.5% of evaluation budget, controls
regression-to-the-mean (eligibility floor), pool drift and attrition
(within-user construction), and keeps a causal frozen-cohort analysis
reconstructable via per-evaluation tagging.

## Folder map

| File | Contents |
|---|---|
| [`delta-support-probe-method.md`](./delta-support-probe-method.md) | Full method report: design, threats to validity, power analysis, and the concrete implementation plan for `apps/mass-consensus` |

## Reproduction / verification

No empirical data yet. The method report is verifiable against the codebase it
cites: every implementation claim references exact files in this repo
(`apps/mass-consensus/src/lib/utils/sampling.ts`,
`apps/mass-consensus/app/api/statements/[id]/batch/route.ts`,
`functions/src/evaluation/statementEvaluationUpdater.ts`,
`packages/shared-types/src/models/evaluation/Evaluation.ts`). Once a pilot
event runs, its raw evaluation export and the Δ(r)/churn analysis script will
be added here.
