# Report — budgeted cost and accuracy probe for proposal clustering

11 September 2026 · prepared for Tal Yaron and Fany Yuval · run by Claude (claude-opus-5)

> **Status.** All 240 planned judgements ran and were scored. The **labels are
> provisional**: model-authored, pending two independent human annotators. Every
> accuracy statement below is conditional on those labels. The protocol's scientific
> decision gate is **not** satisfied. Spend: **US$0.269 of the US$5 cap**.

## 1. Bottom line

1. **Cost: measured, and large at N=500.** Retrieval keeps the judge's input flat at
   about 655 prompt tokens. The full list grows linearly: 2,734, then 5,150, then
   12,520 tokens at N = 100, 200, 500. The median paired saving is
   **2.6×, 4.3× and 9.4×** (undiscounted list prices; 95% query-bootstrap for
   N=500: 8.9–9.8×). It is smaller than the 19× input-token ratio because both methods
   emit about 130–160 output tokens (about 55% of B's cost), and output does not shrink
   with retrieval.
2. **Accuracy: no sign of full-list degradation up to 500; a consistent difference in
   how readily the two methods join.** A was correct in 28, 31 and 31 of 40 cells at
   N = 100, 200, 500, so no decline appeared at 200 or 500. False joins were A 1 / 0 / 0
   and B 0 / 0 / 0. Across the 60 A-vs-B cell pairs on match-present queries, the two
   methods disagreed 19 times. In 18 of them **A joined and B said "none", although B
   had the target in its 15**. At N=500: 25 pairs both correct, 6 only A correct,
   0 only B correct. B − A correctness at N=500 is −15 points (bootstrap 95% −27.5 to
   −2.5).
3. **Pre-registered triage at N=500 (provisional labels):** cost ✔ (9.4× ≥ 2×),
   false joins ✔ (0 vs 0), retrieval recall ✔ (10/10 at each size), total incorrect
   ✘ (B 15 vs A 9, allowed excess 2). **Not all pass.**
4. **What decides the reading is the labels, not more API calls.** The disputed
   joins are pairs like "Internet services should be a public municipality" and "BGMU
   needs to offer residential fiber internet as a UTILITY". If humans call these
   *same*, B is missing matches. If they call them *different*, those are A false
   joins and B is the more precise method. Re-scoring costs nothing; see
   `annotation/GUIDE.md`.

**Is a larger study worthwhile?** The cost side, yes: the mechanism saves an order of
magnitude by N=500, and the saving grows with N. The accuracy side is not settled. Do
**not** buy the full-stream study yet. First: (1) human labels, which are free; then (2),
only if B's extra "none" answers survive them, one small pre-registered follow-up on
*fresh* queries that isolates the cause (§7). Estimated cost for (2): under $0.50.

## 2. What was measured, and what was not

| measured (this probe) | assumed or not measured |
|---|---|
| per-judgement prompt/completion/reasoning tokens, provider usage | the complete Freedi pipeline's cost (briefs, spawn writer, themes, maintenance, retries) |
| usage-estimated billed and undiscounted cost per call, at verified 2026-09-11 prices | the paper's 2,000/200-token Freedi budget, still an **assumption** and **not** replaced by B |
| paired A/B decisions at sampled states N=100/200/500, 2 orders | a streamed discussion from 0 to N (cumulative cost, order-stability) |
| B's retrieval recall and target rank (exact cosine, 3-small) | production's approximate index, 0.45 floor, up to 45 candidates, pairwise judge |
| position manipulation (anchor at ≈5% vs ≈50%) | cluster F1, synthesis fidelity, themes |
| | human ground truth (**pending**) |

## 3. Setup

- **Corpus.** Pol.is "Improving Bowling Green / Warren County" (openData commit
  `3be5785`, CC BY 4.0). One question, 896 comments, 607 approved (`moderated = 1`), no
  exact duplicates. Median 101 characters. Real participants, a real distribution of
  topics, and naturally occurring near-paraphrases and same-topic distractors. There is
  **no synthetic text and no concatenation of discussions**. The bank has fewer than
  1,000 items, so the optional 1,000-item extension was **not run** (`dry-run.json →
  extension1000`).
- **Queries.** Candidates were walked in a seeded order (seed 42, 97 walked; every
  decision logged in `annotation/query-selection.jsonl`). Rules: actionable proposals
  only; distinct interventions; no query inside another query's labelled core. The
  outcome was 10 match-present + 10 no-match test queries and 2 + 2 dev queries, chosen
  before any judge call. All 24 are removed from the bank (583 left).
- **Labels (provisional).** Claude read each query's screening shortlist (union of top-25
  text-embedding-3-small, top-25 text-embedding-3-large, top-15 BM25; about 42 items)
  and marked matches, hard distractors with a reason, and *borderline* items.
- **Pools.** Nested 100 ⊂ 200 ⊂ 500 per query. The core (all matches + ≤ 8 hard
  distractors, borderline first) is present at every size. Fill is drawn from the rest
  of the bank in a length-stratified seeded order. Two orders per cell: the anchor
  (designated target, or the strongest hard distractor for no-match queries) at ≈5%
  and at ≈50% of the list.
- **Judge.** `gpt-5.6-luna` (the production attachment-judge model; returned model id
  exactly `gpt-5.6-luna` on all 240 attempts). Chat Completions, strict JSON schema
  `{decision: same|none, target_id, reason}`. `reasoning_effort` not sent (production
  parity; provider default "medium"). `max_completion_tokens` 4000 for both methods;
  the largest observed completion was 414. One prompt for both methods; B's list is
  A's list filtered to the top-15, in A's order.
- **Retrieval.** text-embedding-3-small, 1536-d, text `Question: … \nAnswer: <original>`
  (the production contract without the brief), exact cosine, ties by id, no threshold.
  About 1 ms per query at N=500 in process.
- **Prices** (verified 2026-09-11, developers.openai.com/api/docs/pricing and
  …/models/gpt-5.6-luna): luna $0.20 in, $0.02 cached, $1.20 out per 1M tokens; cache
  writes billed at 1.25×; more than 272K input tokens ⇒ 2× in / 1.5× out (not reached;
  the largest prompt was 12.6K). text-embedding-3-small $0.02/1M, 3-large $0.13/1M.

## 4. Results

### 4.1 Cost (fig. 1, fig. 2)

| N | A prompt tok | B prompt tok | A $/call undiscounted | B $/call | median paired A/B (undiscounted) | median A/B (usage-billed) |
|---|---|---|---|---|---|---|
| 100 | 2,734 | 661 | 0.00073 | 0.00028 | 2.55× [IQR 2.27–2.84] | 2.99× |
| 200 | 5,150 | 658 | 0.00120 | 0.00029 | 4.29× [3.76–4.64] | 5.20× |
| 500 | 12,520 | 654 | 0.00268 | 0.00030 | 9.38× [8.26–10.17] | 11.58× |

- **Output is B's floor.** Completion was 125–157 tokens on average in both methods,
  of which 76–108 were reasoning. At $1.20/1M that is about $0.00016 of B's $0.00030.
- **The billed ratio is larger than the undiscounted one.** Every A prompt (≥ 1,024
  tokens) was billed as a *cache write* at 1.25×, with **zero cache reads** across 240
  calls. B's short prompts were not cached at all. Prompt caching made A *more*
  expensive, not less.
- The embedding cost of a B query is about $0.000001, negligible.
- Latency: mean API time 2.0–2.4 s (A) and 1.9 s (B) per call. This is not a
  deployment benchmark.

![Prompt tokens](figures/fig1-prompt-tokens.png)
![Paired cost ratio](figures/fig2-paired-cost-ratio.png)

### 4.2 Decisions (fig. 3; full tables in `TABLES.md`)

| N | A correct / 40 | B correct / 40 | A false joins | B false joins | match-present A / B (of 20) | no-match A / B (of 20) |
|---|---|---|---|---|---|---|
| 100 | 28 | 24 | 1 | 0 | 9 / 4 | 19 / 20 |
| 200 | 31 | 25 | 0 | 0 | 11 / 5 | 20 / 20 |
| 500 | 31 | 25 | 0 | 0 | 11 / 5 | 20 / 20 |

- All outputs were valid: 0 invalid, 0 truncated, 0 technical failures, 0 retries.
- Join precision among predicted joins is 90–100% for A and 100% for B. With 0–11
  joins per cell this is **not** evidence of a ≤ 1% error rate.
- No-match queries were easy for both methods (one A false join in 120 cells). All the
  action is on match-present queries.
- Two match-present queries were never joined by either method at any size or order
  (`pc3m2` local-business incentives, `peqy9` accessible transit for the elderly). Most
  likely the provisional labels there are more lenient than the judge. This is for
  humans to settle.
- **Sensitivity (lenient labels, borderline = allowable):** A 16 / 17 / 17 and
  B 10 / 11 / 11 correct of 40. The judge almost never joins borderline pairs, so the
  lenient reading makes both methods look worse, and the gap is unchanged.
- **Position manipulation:** A's match-present correctness with the target at ≈5% vs
  ≈50% was 5/4, 5/6 and 6/5 (of 10) at N = 100, 200, 500. No visible position effect.
  With two orders and 10 queries this cannot exclude a small one.

![Decisions](figures/fig3-decisions.png)

### 4.3 Retrieval (fig. 4)

B retrieved at least one approved target for **10/10** match-present queries at every
size. The best approved target was rank 1 or 2 by cosine every time. **Caveat:** matches
were found by screening that itself used embeddings (3-small, 3-large) and BM25, so
paraphrases that no embedding finds would be missing from both the labels and this
recall. The human `fill-check` rows test this.

![Retrieval rank](figures/fig4-retrieval-rank.png)

### 4.4 Why B says "none" more often

A and B saw the same target text. What differed was its company. In B the other 14 items
are the query's nearest neighbours: variants on the same subject. The judge's reasons
show it holding the target to that dense neighbourhood:

- **"Internet services should be a public municipality."** A (N=500): *same* as "BGMU
  needs to offer residential fiber internet as a UTILITY…" (reason: "both call for
  residential internet … as a public municipal utility"). B: *none*, because "the
  existing proposals specify particular providers, technologies, or residential
  expansion."
- **"The university and city should develop stronger mutually beneficial
  partnerships."** A: *same* as "more cooperation between WKU and Bowling Green,
  especially for … internships". B: *none*, because "the existing proposals address
  specific university-community collaborations".
- **The "6 cents per $100" homelessness levy.** A joins it to the same author's
  "I will pay 6 cents per $100 … via Apt. $". B (N=100, 200): *none*, because "does not
  specify the apartment-based intervention and family scope".
- **The one A false join** (N=100, order 2): "We need to carefully preserve agricultural
  land" joined to "Prevent the development of new housing areas, especially in farm
  land areas". This item was pre-flagged *borderline*. B rejected it in the same cell.

So retrieval did not lose targets. It changed the **contrast set**, and the judge became
more conservative. This is a property of *list* judging. The production attachment judge
compares pairs (option vs. synthesis title), so this probe does not show the effect
exists there.

### 4.5 Uncertainty

A query-block bootstrap (2,000 resamples, stratified 10/10, all sizes, methods and
orders of a query carried together) gives B − A correct = −10.0% [−25.0, +5.0] at
N=100, −15.0% [−25.0, −5.0] at 200, and −15.0% [−27.5, −2.5] at 500. The bank is shared
and there is one discussion, so these intervals do not cover variation across
discussions, languages or models. Ten positive queries is a small sample. The 240 calls
are not 240 independent semantic examples.

## 5. Side findings on the manuscript's cost projection (fig. 5)

- **Recomputed offline, exactly.** `analysis/recompute-cost-fit.mjs` reproduces
  `parameters.json` from the 300 archived placements: intercept 167.365, slope 14.760,
  output 83.38, topic 15.7 / 7.327 per statement.
- **Cache-write surcharge omitted.** 62.9% of the archived prompt tokens were cache
  **writes** (billed at 1.25× under the current schedule) and none were reads. The
  full-list projection is therefore understated: $0.44 → **$0.50** at N=500, $1.62 →
  **$1.86** at N=1,000, $149 → **$172** at N=10,000. The manuscript's "no cached input
  tokens were reported" is accurate about *reads*, but the writes are billed.
- **Observed A sits above the archived per-arrival line.** For example, $0.0027 vs
  about $0.0016 at N=500. This probe's prompt lists every raw proposal with an id and
  carries a longer rubric, while the archived fit lists synthesis members. The two are
  different prompt formats; neither is "the" full-list cost.
- **B's per-decision cost (about $0.0003) is below the paper's assumed complete-Freedi
  budget ($0.00064 per arrival).** This is a *component*: it omits briefs, synthesis
  writing, themes, maintenance and retries. Per protocol §8 it must **not** replace
  that assumption.

![Cost vs projection](figures/fig5-cost-vs-projection.png)

## 6. Budget and accounting

| stage | calls | usage-billed US$ | notes |
|---|---|---|---|
| prep (embeddings) | 20 batches | 0.0048 | 63,670 tokens, 3-small + 3-large, 607 texts each |
| smoke (dev, unscored) | 8 | 0.0047 | 8/8 valid, max completion 280 |
| main | 240 | 0.2598 | undiscounted 0.2191; 895,040 prompt (815,794 cache-write, 0 cached), 33,375 completion (21,668 reasoning) |
| **total** | | **0.2693** | 0 retries, 0 retained reservations, cap $5 never approached |

Every request reserved its worst case before dispatch: input bound × $0.25/1M +
4,000 × $1.20/1M. The input bound over-reserved by 2.3–2.5×, checked against smoke
usage in `dry-run.json`. The reservation was settled at the usage-derived cost
afterwards. "Billed" here means computed from provider usage at list prices; it is not
an invoice. The ledger is `budget-ledger.jsonl`, with raw usage per attempt in
`runs/*/attempts.jsonl`.

## 7. Limitations and next steps

**Limitations.**
- The labels are provisional.
- There is one English discussion.
- The corpus contains few paraphrases, so matches are near-duplicates found by embedding
  screening, and recall is optimistic.
- One small model at default reasoning, 20 test queries, two orders.
- Sampled states, not a stream.
- B is a simplified component. Production retrieves up to 45 candidates above a 0.45
  cosine floor, embeds a generated brief, and judges pairwise, not over a list.

**Next steps, in order. None has been launched.**
1. **Human labels.** Tal and Fany fill `annotation/sheet-annotator-{1,2}.csv`
   independently, then adjudicate and re-score (`annotation/GUIDE.md`). No API cost.
2. **Only if B's excess "none" answers survive the human labels:** a small follow-up on
   **fresh** queries (a new seeded draw, not these 20), pre-registered, with one added
   condition. B keeps the top-15 but pads them to 50 with random non-neighbours, which
   tests the contrast-set explanation. A second condition judges each top-k candidate
   *pairwise*, as production does. About 200 calls, under $0.50.
3. **Full-stream study (protocol §10)**, only after step 2:
   - 100, 200 and 500 arrivals, ≥ 2 orders, ideally a second labelled discussion.
   - Conditions: full-list incremental LLM, the complete Freedi configuration in an
     isolated emulator with every provider call metered, and an economical
     representatives/hierarchy LLM baseline.
   - This probe's A cost fit suggests a full-list stream to 500 arrivals costs about
     $0.7–0.9 per order. The Freedi arm needs its own dry-run, because background
     maintenance cost is unmeasured.
