# HDBSCAN theme probe (2026-10-24)

**Question.** The "HDBSCAN themes, protected synthesis" implementation prompt proposes that density clustering (exact precomputed-cosine HDBSCAN) should propose the theme partition, and a constrained judge should validate it. Before building any of that, does HDBSCAN on our embeddings produce a useful theme partition?

**Answer: no, not on its own. With a perfect judge, the result comes from the judge, not from HDBSCAN.** Offline, no LLM calls, about $0.002 of embeddings.

## Setup

- `hdbscan==0.8.40`, numpy 2.5.4, scikit-learn 1.9.1, Python 3.13 (venv in the session scratchpad, not in git).
- HDBSCAN exactly as the prompt specifies: L2-normalise, `D = clip(1 - XXᵀ, 0, 2)`, symmetrise, zero the diagonal, `metric="precomputed", algorithm="generic", approx_min_span_tree=False`. Grid: `min_cluster_size` 2–10, `min_samples` 1–m, `eom` and `leaf` (108 configs).
- **EN / HE accuracy corpora** (`scripts/seedSynthBenchmark.accuracy100.{en,he}.json`): 50 paraphrase pairs in 10 topics. An atom is one ground-truth synthesis (the mean of its two vectors), which is the prompt's atom contract when synthesis is perfect. Scoring is pairwise P/R/F1 and ARI over the 50 atoms, the same as `score100.mjs`'s topic level. Each atom in noise ("Other") counts as a singleton. Also scored on the 100 raw statements.
- Embeddings use production's `Question: …\nAnswer: …` key. 3-small comes from the preflight cache, HE 3-large from `he-large-embeddings.json`, and EN 3-large was embedded fresh into the scratchpad.
- **Bq-VQPMPiG7b** (114 real Hebrew statements, narrow question) is embedded with 3-large @1536, which is production's pin for that question. **Fanny's hand labels are no longer on disk.** `~/Downloads/statements_full.xlsx` now holds only id + text (re-saved 2026-10-15), so Bq is scored on structure only.
- The harness reproduces the old geometry ceilings exactly (`analysis/themeCeiling.mjs`): best pair cut F1 0.480 (3-small) / 0.535 (3-large), agglomerative k=10 F1 0.432.

## Results: accuracy corpora, atom level (50 atoms)

"Oracle" means the best of 108 configs chosen **on the test data itself**. That is an optimistic upper bound, not a tuned result.

| corpus | median cos same / diff theme | HDBSCAN oracle F1 / ARI (Other) | + nearest-centroid filing F1 | agglomerative k=10 F1 | **current LLM theme layer, live runs** |
|---|---|---|---|---|---|
| EN 3-small | 0.742 / 0.670 | 0.386 / 0.332 (28%) | 0.431 | 0.432 | **0.652–0.775** (themefix, consolidated, filingfix, seeds 7/1234) |
| EN 3-large | 0.702 / 0.622 | 0.425 / 0.376 (24%) | 0.409 | 0.478 | – |
| HE 3-small | 0.861 / 0.837 | 0.148 / 0.122 (64%) | 0.259 | 0.147 | – |
| HE 3-large | 0.791 / 0.747 | 0.306 / 0.269 (26%) | 0.393 | 0.328 | **0.658–0.910** (formulation … judgedattach) |

At statement level (100 raw statements, no synthesis) HDBSCAN reaches F1 0.42 / 0.35 (EN small / large) and 0.16 / 0.29 (HE).

**Parameter transfer fails.** The best config on EN (m=3, s=1, eom) applied to HE 3-large gives **one heading holding 43 of 50 atoms** (F1 0.167, ARI 0.02), the same catch-all collapse we fought in September. The HE-best config applied to EN gives F1 0.31. There is no single setting that works on both languages.

**Order stability holds.** On the same snapshot, 10 shuffled arrival orders gave identical memberships (worst ARI 1.0) for every best config.

**Runtime is negligible.** 108 configs × 50–100 atoms finish in under 0.3 s. Cost is not the issue at this scale.

## Ceiling with a perfect judge

The prompt's design lets the judge (a) drop members that don't fit into Other and (b) file Other atoms into existing headings when they fit, but not repartition. `perfect_judge()` simulates an oracle doing both flawlessly: every cluster keeps only its majority-topic members, and every Other atom joins the largest cluster of its own topic, if one exists.

| corpus (atoms) | HDBSCAN raw F1 | HDBSCAN + perfect judge F1 (best of grid) | agglomerative k=10 + perfect judge | agglomerative k=15 + perfect judge |
|---|---|---|---|---|
| EN 3-small | 0.386 | 0.889 | 0.837 | **0.864** |
| EN 3-large | 0.425 | **0.936** | 0.824 | 0.864 |
| HE 3-small | 0.148 | 0.630 | **0.925** | 0.895 |
| HE 3-large | 0.306 | 0.824 | **0.925** | 0.795 |

The best HDBSCAN configs here are m=2 (tiny 2–3-atom seeds), so nearly all the work is the judge's filing. Cheap agglomerative seeding with the same perfect judge matches it on EN and beats it on HE. **HDBSCAN adds nothing specific.** Whichever clusterer is used, the quality ceiling belongs to the judge, and the judge is what the current pipeline already is (`nestSynthesis.ts`: every live theme offered to the judge, no cosine shortlist).

## Bq-VQPMPiG7b (narrow question)

- Pairwise cosine is tightly packed: median 0.709, p10 0.618, p90 0.800.
- **Across all 108 configs, at least 66% of statements end in Other.** The best configs give 9 headings of sizes 22, 3, 2, 2, 2, 2, 2, 2, 2 with 75 of 114 in Other. Zero configs meet "≥5 headings, Other ≤30%, largest ≤40%".
- Agreement with the production v3 theme layer (7 headings, 26 unthemed) is ARI 0.05–0.06.

On a narrow question, density clustering mostly reports "no structure". Under the prompt's rules that sends two thirds of the statements to Other, and the judge would then have to file them, which is today's pipeline again.

## Conclusions

1. HDBSCAN alone is worse than the current LLM theme layer, by about 0.25–0.35 F1 in English and more in Hebrew, even when tuned on the test set.
2. With a perfect judge, the ceiling is high, but agglomerative seeding gets the same ceiling. The proposal's value would come from the judge, not from HDBSCAN.
3. The parameters don't transfer across languages, and on the narrow real question HDBSCAN leaves ≥66% unclustered. The "tune m and s on development data" step has no stable answer.
4. Still worth doing from the prompt, independent of the clusterer: the isolation contract (a separate theme read model instead of topic-cluster `Statement`s in the synthesis collection), the atom contract, and the frozen-response differential replay test.

## Limits

- Ground-truth corpora are small (50 atoms, 10 topics) and come from one broad question with clean topics. Oracle numbers are tuned on test data.
- The "perfect judge" is an oracle. A real LLM judge with HDBSCAN seeds was **not** run, so whether real-judge + HDBSCAN seeds beats real-judge alone is untested. Condition 2 suggests the seeding choice matters little.
- Bq has no ground truth until Fanny's labels are recovered.
- The live-run numbers in the last column come from end-to-end streaming runs (real judge, arrival order, debounce). They are not a matched offline comparison.

## Files

- `scripts/embed_bq.py` embeds Bq into the scratchpad (participant data never enters git).
- `scripts/probe.py` runs the grid, baselines, transfer, order stability, Bq structure and perfect-judge ceiling, and writes `results/results.json` and `results/grid.json`.
- `scripts/seed_control.py` runs agglomerative + perfect-judge control and writes `results/seed-control.json`.

```
python -I scripts/embed_bq.py <scratch>/bq-large.json
python -I scripts/probe.py <scratch> results
python -I scripts/seed_control.py <scratch> results/seed-control.json
```
