# Pre-registration — clustering-scale probe

Written 2026-09-11 **before any judge (gpt-5.6-luna) call was made**. Hashed into
`frozen/HASHES.sha256` by `node probe.mjs prepare --step=freeze`; the main run
refuses to start if this file changes afterwards.

## What is being tested

One component of the Freedi mechanism: does showing an LLM judge **only the top-15
candidates by exact embedding cosine (B)**, instead of **the whole pool (A)**,
cut inference cost at 100 / 200 / 500 existing proposals without an evident loss in
matching decisions? Same question, rubric, schema, model, output cap and
candidate texts in A and B; B keeps A's relative order.

This is **not** a measurement of the seven-stage Freedi pipeline (no briefs, no
thresholds, no synthesis writing, themes or maintenance), and query-level accuracy
is **not** cluster F1.

## Design (frozen)

- Corpus: Pol.is Bowling Green (CC BY 4.0), `moderated == 1`, 607 items; 24 queries
  removed → bank of 583. One question.
- Queries: 20 test (10 with ≥1 allowable match, 10 with none) + 4 dev (smoke only),
  chosen in a seeded candidate order (seed 42) by the rules logged in
  `annotation/query-selection.jsonl`. No judge output existed at selection time.
- Pools: nested 100 ⊂ 200 ⊂ 500 per query; core = all matches + ≤ 8 hard
  distractors at every size; fill length-stratified (seed 1234).
- Orders: 2 per query × size; anchor (designated target, or strongest hard
  distractor for no-match queries) at ≈ 5 % and ≈ 50 % of the list; rest shuffled
  from seeds 42 / 7.
- Calls: 20 × 3 × 2 methods × 2 orders = **240**, interleaved with scheduling seed
  20260911, concurrency 2, ≤ 2 attempts (transport failures only), invalid output
  = failed decision.
- Judge: `gpt-5.6-luna`, Chat Completions, strict JSON schema, no
  `reasoning_effort` sent, `max_completion_tokens` fixed after the smoke test
  (4000 unless a smoke call truncates → 10192 for both methods).

## Labels

The labels used for the main run are **PROVISIONAL**: written by Claude
(claude-opus-5) from screening shortlists (union of top-25 text-embedding-3-small,
top-25 text-embedding-3-large, top-15 BM25), not by humans. Every output of the
main run is stamped `labelStatus: provisional`. The protocol's scientific decision
gate is **not** satisfied until Tal Yaron and Fany Yuval's independent, adjudicated
labels replace them (`annotation/sheet-annotator-{1,2}.csv`); decisions are then
re-scored without re-running (labels apply at score time; the core design means a
re-label never changes which items are in a pool).

Primary scoring uses the strict labels. A pre-planned sensitivity analysis counts
items flagged `borderline` as additional allowable matches ("lenient").

## Pre-registered engineering triage criterion (exploratory, not a significance test)

At **N = 500**, a *useful signal for further testing* requires all three:

1. **Cost:** the median over the 20 × 2 paired cells of (A undiscounted cost ÷ B
   undiscounted cost) is **≥ 2**. Undiscounted = `(prompt·$0.20 + completion·$1.20)/1M`
   so prompt-cache effects cannot masquerade as less processed text.
2. **Accuracy:** across the 40 paired cells at N = 500, B's false joins exceed A's
   by **≤ 1**, and B's incorrect decisions (false joins + misses + invalid +
   truncated + technical) exceed A's by **≤ 2**.
3. **Retrieval:** B's candidate recall (≥ 1 approved target among the 15 shown) is
   **≥ 9 / 10** positive queries at every size.

If A and B are equally accurate and inexpensive, that is reported as such; no
failure near 200 is expected or required. A negative or inconclusive result is a
valid outcome. Zero observed false joins is not evidence of a ≤ 1 % error rate.

## Analysis plan

- Per size × method: raw counts of correct / false-join / miss-abstain /
  miss-no-retrieval / invalid / truncated / technical; false joins as count, as a
  fraction of attempted decisions, and precision among valid predicted joins
  (undefined when there are none).
- Candidate recall, best approved target's cosine rank and score.
- Per-query and per-order outcomes; paired A-vs-B outcome tables; paired cost ratios.
- Tokens: total / cached / cache-write / completion / reasoning; billed and
  undiscounted cost; API, retrieval and total elapsed time.
- Uncertainty: query-block bootstrap (2,000 resamples, seed 42), stratified by
  match status, carrying all sizes, methods and orders of a query together. The
  bank is shared; intervals do not cover variation across discussions.
- Observed points only — no fitted accuracy curve, no change-point at 200.
- Smoke calls (4 dev queries) are excluded from every score.
