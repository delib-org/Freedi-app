# LLM-only clustering baseline on the 100-statement live-synth corpus

**Date:** 2026-09-04 · **Corpus:** `scripts/seedSynthBenchmark.accuracy100.en.json` (sha `8fdcaccc66dd`; 10 topics × 5 synth-groups × 2 paraphrases, English) · **Scorer:** `scientific-research/2026-08-18-live-synth-accuracy/score100.mjs` (unchanged) · **Runner:** `llmBaseline.mjs` · **Aggregation:** `analyze.mjs` → `TABLES.md`, `summary.json` · **Total spend: $0.18.**

## What was measured

How well a *bare* chat model — no embeddings, no queue, no judges, no consolidation, no re-judge sweep — clusters the same corpus the production pipeline was certified on, so the number can be reported as a baseline. Three conditions:

- **L1 — one-shot batch.** One prompt with the question and all 100 statements (id-prefixed, in seeded arrival order); the model returns `{syntheses:[{title, memberIds}], topics:[{title, synthesisIndices, looseStatementIds}]}`. Run for `gpt-5.6-luna` (worker tier) and `gpt-5.6-terra` (taxonomy tier) × seeds 42, 7, 1234.
- **L2 — incremental LLM-only placement.** Statements arrive one at a time in the seeded order. Per arrival one call sees the question, every current synthesis (index + all member texts verbatim) and the new statement, and answers `join`/`new` with a confidence; join is accepted only at confidence ≥ 0.6. A final call groups the syntheses into topics. `gpt-5.6-luna` only, 3 seeds, 101 calls per run.
- **L3 — order consistency.** Pairwise Adjusted Rand Index between the synthesis partitions of the three seeds of each condition × model (own implementation in `analyze.mjs`; statements in no synthesis are singletons), plus the count of the 50 ground-truth pairs merged in all three seeds vs in at least one.

Arrival order is byte-identical to the pipeline harness's (`scripts/runAccuracyBenchmark.ts`: flatten topic→synth→paraphrase, Fisher-Yates driven by `mulberry32(seed)`; verified against `en-seed42-consolidated/statements.json`). Ids `s001..s100` follow the original corpus order so they are stable across seeds. Calls go through the standard chat-completions endpoint with `response_format: json_object` and `max_completion_tokens` (16000 for L1, 2000 per L2 step, 8000 for the L2 topic pass); `temperature` is omitted for gpt-5.\* exactly as production's `buildModelParams` does (we did not test whether the API would reject it). Retry on 429/5xx with the `retry-after` hint, max 6 attempts; no retry was ever needed. Both model names were accepted — **no fallback to gpt-4o\* was used.**

Every run folder under `runs/` holds `statements.json`, `results.json`, the scorer's `scores.md` and `scores.json`, `raw.json` (verbatim model output and usage; for L2 every per-arrival decision with its confidence and reason) and `meta.json` (model, tokens, cost, wall-clock, calls, invalid-output counts).

## Per-run results

| run | composite | synth F1 (P / R) | pairs clean | false merges | topic F1 (P / R) | synths | topics | coverage | invalid | calls | tokens in / out | cost | wall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `L1-gpt-5.6-luna-seed42` | **0.918** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.796 (0.763 / 0.831) | 50 | 9 | 100/100 | 2 unfiled syn | 1 | 1669 / 2221 | $0.0030 | 24.0s |
| `L1-gpt-5.6-luna-seed7` | **0.931** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.826 (0.789 / 0.867) | 50 | 10 | 100/100 | 1 unfiled syn | 1 | 1669 / 2092 | $0.0028 | 22.3s |
| `L1-gpt-5.6-luna-seed1234` | **0.949** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.873 (0.810 / 0.947) | 50 | 9 | 100/100 | 0 | 1 | 1669 / 2178 | $0.0029 | 22.7s |
| `L1-gpt-5.6-terra-seed42` | **0.955** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.887 (0.841 / 0.938) | 50 | 10 | 100/100 | 0 | 1 | 1669 / 2291 | $0.0308 | 19.8s |
| `L1-gpt-5.6-terra-seed7` | **0.937** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.843 (0.771 / 0.929) | 50 | 9 | 100/100 | 0 | 1 | 1669 / 1828 | $0.0253 | 18.5s |
| `L1-gpt-5.6-terra-seed1234` | **0.918** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.796 (0.736 / 0.867) | 50 | 9 | 100/100 | 0 | 1 | 1669 / 2148 | $0.0291 | 18.8s |
| `L2-gpt-5.6-luna-seed42` | **0.972** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.930 (0.914 / 0.947) | 50 | 10 | 100/100 | 0 | 101 | 91662 / 8885 | $0.0290 | 189.1s |
| `L2-gpt-5.6-luna-seed7` | **0.937** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.844 (0.785 / 0.911) | 50 | 9 | 100/100 | 0 | 101 | 91545 / 9320 | $0.0295 | 193.8s |
| `L2-gpt-5.6-luna-seed1234` | **0.984** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.960 (0.956 / 0.964) | 50 | 10 | 100/100 | 0 | 101 | 90899 / 9007 | $0.0290 | 187.0s |

"Invalid" counts invented ids, ids duplicated across syntheses, missing ids, 1-member syntheses, out-of-range synthesis indices, syntheses filed under two topics, loose ids that were also in a synthesis, invalid JSON and truncation (`finish_reason: length`). All of those were **zero in every run**; the only defect observed was L1-luna leaving 2 (seed 42) and 1 (seed 7) syntheses out of every topic ("unfiled"). "Tokens out" includes hidden reasoning tokens: 640–1100 per L1 call, ≈32 per L2 step on average.

## Summary — mean (range) over the three seeds

| condition × model | composite mean (range) | synth F1 | pairs clean | false merges | topic F1 mean (range) | topics produced | calls / run | tokens / run | cost / run | wall / run |
|---|---|---|---|---|---|---|---|---|---|---|
| L1 · gpt-5.6-luna | **0.933 (0.918–0.949)** | 1.000 | 50/50 ×3 | 0 | 0.832 (0.796–0.873) | 9, 10, 9 | 1 | 3.8k | $0.003 | 23s |
| L1 · gpt-5.6-terra | **0.937 (0.918–0.955)** | 1.000 | 50/50 ×3 | 0 | 0.842 (0.796–0.887) | 10, 9, 9 | 1 | 3.8k | $0.028 | 19s |
| L2 · gpt-5.6-luna | **0.965 (0.937–0.984)** | 1.000 | 50/50 ×3 | 0 | 0.911 (0.844–0.960) | 10, 9, 10 | 101 | 100k | $0.029 | 190s |
| *Production pipeline (reference)* | *0.900 (0.884–0.910)* | *1.000* | *50/50 ×3* | *0* | *0.750 (0.711–0.775)* | *11, 10, 17* | *many (live triggers + pumps)* | *n/a* | *n/a* | *15–60 min* |

**The pipeline row is not from this study.** It is copied from the 2026-08-18 study's `RESULTS.md` (runs `en-seed42-consolidated` 0.910 / topic F1 0.775, `en-seed7-consolidated` 0.905 / 0.763, `en-seed1234-consolidated` 0.884 / 0.711, build `c9ee88713`, shipped defaults). Its wall-clock is the `durationMs` recorded in those runs' `results.json` (895 s, 3474 s, 3572 s) and is dominated by the harness's settle-detection waits, not by model latency, so it is not comparable to the LLM-only timings. The pipeline processed the same three seeded orders.

## L3 — order consistency (synthesis partitions across seeds)

| condition × model | ARI 42↔7 | ARI 42↔1234 | ARI 7↔1234 | mean ARI | GT pairs merged in ALL 3 seeds | in ≥1 seed | in 0 seeds |
|---|---|---|---|---|---|---|---|
| L1 · gpt-5.6-luna | 1.000 | 1.000 | 1.000 | **1.000** | 50/50 | 50/50 | 0 |
| L1 · gpt-5.6-terra | 1.000 | 1.000 | 1.000 | **1.000** | 50/50 | 50/50 | 0 |
| L2 · gpt-5.6-luna | 1.000 | 1.000 | 1.000 | **1.000** | 50/50 | 50/50 | 0 |

Every run produced the identical synthesis partition — the 50 ground-truth pairs and nothing else — so cross-seed ARI is trivially 1.000 and the all-three vs at-least-one distinction collapses. Order consistency at the synthesis layer is therefore not a differentiator between the bare model and the pipeline on this corpus: both are exact and order-independent. The order effect lives entirely in the topic layer (see below), which the L3 metric, as specified, does not cover.

## L2 — decision statistics

| run | join | new | joins refused (conf < 0.6) | invalid outputs | mean prompt tokens / step | max prompt tokens / step | total tokens | of which reasoning | join confidence min / mean | new confidence min / mean |
|---|---|---|---|---|---|---|---|---|---|---|
| seed 42 | 50 | 50 | 0 | 0 | 901 | 1599 | 100,547 | 3,182 | 0.97 / 0.992 | 0.98 / 0.989 |
| seed 7 | 50 | 50 | 0 | 0 | 900 | 1599 | 100,865 | 3,545 | 0.86 / 0.988 | 0.98 / 0.990 |
| seed 1234 | 50 | 50 | 0 | 0 | 893 | 1599 | 99,906 | 3,265 | 0.95 / 0.989 | 0.98 / 0.989 |

Exactly 50 joins and 50 news in every seed — every second twin was joined to its first, every first twin opened a synthesis, no join was ever wrong. The 0.6 confidence gate never fired: the lowest confidence the model attached to any decision was 0.86. The per-step prompt grows linearly with the synthesis list (≈200 → 1599 tokens over the run), so total prompt tokens are quadratic in corpus size.

## Topic layer — statements of each theme gathered into a group that represents it (of 10)

| run | culture | digital | education | environment | health | housing | jobs | **parks** | safety | transport | cluster score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L1-luna-42 | 10 | 8 | 10 | 10 | 10 | 10 | 8 | **2** | 8 | 10 | 0.860 |
| L1-luna-7 | 8 | 10 | 10 | 10 | 10 | 10 | 10 | **2** | 10 | 8 | 0.880 |
| L1-luna-1234 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | **2** | 10 | 10 | 0.920 |
| L1-terra-42 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | **2** | 10 | 10 | 0.920 |
| L1-terra-7 | 8 | 10 | 10 | 10 | 10 | 10 | 10 | **2** | 10 | 10 | 0.900 |
| L1-terra-1234 | 8 | 10 | 10 | 10 | 10 | 10 | 10 | **2** | 8 | 10 | 0.880 |
| L2-luna-42 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | **6** | 10 | 10 | 0.960 |
| L2-luna-7 | 8 | 10 | 10 | 10 | 10 | 10 | 10 | **2** | 10 | 10 | 0.900 |
| L2-luna-1234 | 8 | 10 | 10 | 10 | 10 | 10 | 10 | **10** | 10 | 10 | 0.980 |

(Scorer's "cluster score" = mean over themes of the share of its 10 statements sitting in one group that is majority-that-theme. The pipeline reference runs scored 0.840 / 0.760 / 0.760 on this metric.)

## Observations

1. **On this corpus a bare model matches or beats the production pipeline, and the whole difference is in the topic layer.** Composite: L1 0.918–0.955, L2 0.937–0.984, pipeline 0.884–0.910. Synthesis F1 is 1.000 for all twelve measurements (9 here + 3 pipeline): 50/50 pairs merged cleanly, zero false merges, every seed. Topic F1: pipeline 0.711–0.775, L1 0.796–0.887, L2 0.844–0.960. Any claim in the paper should be phrased at that resolution — the pipeline does not buy synthesis accuracy on this benchmark; what it buys (streaming arrival at scale, thousands of statements, Hebrew, evaluation-aware re-judging, bounded per-call cost) this experiment does not measure.

2. **The synthesis task is saturated by this corpus.** Paraphrase pairs are two well-formed English sentences proposing the same specific action; every model in every condition found all 50 with no false merges, and L2's confidences were ≥ 0.86 on every one of 300 decisions (mean 0.99). The 0.6 join gate, the strong-vs-cheap model choice and the arrival order made no difference at all (cross-seed ARI 1.000 everywhere). A harder corpus — near-miss distractors within a topic, sloppy real participant text, Hebrew — would be needed before synthesis-layer numbers can separate any of these methods. The `he` corpus and the production runs' `he-seed42-large-*` history suggest that is where the pipeline's judges start to matter.

3. **The one systematic topic-layer loss is a taxonomy disagreement, not a clustering error.** In 8 of 9 runs the model filed `street-trees` and `community-gardens` (and, in 7 of those, `neighborhood-parks` too) under an environment heading ("Environment and green space(s)"), and `accessible-playgrounds` / `dog-parks` under culture-and-community or education-and-children — so the ground truth's `parks-and-green-space` theme scores 2/10 in seven runs (its 10 statements split 6/2/2 across three other headings). Only L2 seed 1234 kept a "Parks and Community Amenities" topic (10/10), and L2 seed 42 a partial one ("Parks, recreation and accessibility", 6/10). An expert might defend either taxonomy; the scorer, rightly for its purpose, does not.

4. **The remaining topic-layer variance is small filing noise**: one synthesis (a pair) landing in a neighbouring topic. Checked against ground truth across all nine runs, only three such strays exist: `culture/youth-music-programs` filed under an education heading (5 runs), `public-safety/traffic-calming` under transport (2 runs), `jobs-and-economy/cut-permit-bureaucracy` under digital services (1 run) — each a defensible reading. Together with the parks split, that is the entire difference between seeds (topic F1 L1 luna 0.796–0.873, L2 0.844–0.960). The pipeline's reference runs show the same mechanism but with worse fragmentation (11/10/17 headings vs 9–10 here): the bare model never produced more than one heading per real theme except the parks split.

5. **L2 (incremental) scored higher on topic F1 than either L1 model in every seed (mean 0.911 vs 0.832 / 0.842), clearly at seeds 42 and 1234 and only marginally at seed 7 (0.844 vs 0.826 / 0.843) — most likely because its topic pass sees 50 tidy syntheses instead of 100 raw statements and a two-part task.** With n=3 and overlapping ranges (L2 seed 7 sits inside the L1 range) this is suggestive, not established. It does mean the paper should not describe incremental placement as an inherently weaker regime — the incremental *synthesis* decisions were perfect.

6. **gpt-5.6-terra brought nothing over gpt-5.6-luna at 10× the price** in L1 (0.937 vs 0.933 mean, identical synthesis output, overlapping topic ranges). Given the observation in (2), this is a statement about the corpus, not the models.

7. **Cost and latency.** L1-luna clusters the whole corpus for $0.003 in ~23 s (one call, 1.7k prompt tokens, ~1k hidden reasoning tokens). L2 costs ~$0.029 and ~190 s for 101 sequential calls, and its prompt tokens are O(n²) in corpus size (≈900 tokens/step at n=100, 1.6k by the end) — it would not stay cheap at a few thousand statements, which is the regime the embedding-gated pipeline exists for. L1's single-context approach has a hard ceiling at the context window and degrades in known ways on long lists that this 100-item corpus does not probe.

8. **Output validity was perfect.** Across 309 calls: zero invalid JSON, zero truncations (`finish_reason` was always `stop`), zero invented, duplicated or missing ids, zero refusals, zero retries. The only structural defect was L1-luna leaving 2 (seed 42) and 1 (seed 7) syntheses outside every topic; the scorer still counts an unfiled synthesis as its own group, so the effect is a small topic-recall loss rather than an error. `max_completion_tokens` headroom (16000 / 2000 / 8000) was never approached.

9. **What the pipeline numbers are and are not.** The 0.884–0.910 / topic F1 0.711–0.775 figures quoted above are taken verbatim from `scientific-research/2026-08-18-live-synth-accuracy/RESULTS.md` (runs `en-seed{42,7,1234}-consolidated`), not re-run here; they were produced by a different build date and involved the emulator, live triggers and manual pumps. The comparison is fair on inputs (identical corpus, identical arrival orders, identical scorer) and unfair on task (the pipeline was never allowed to see all 100 statements at once, and was solving the streaming problem with settle timeouts).

10. **Recommended framing for the paper.** "On a clean 100-statement English corpus with exact paraphrase pairs, a single prompt to a small reasoning model recovers the synthesis ground truth perfectly (F1 1.000, 3 seeds) and organises topics at F1 0.80–0.89; the production pipeline matches the synthesis result and trails on topics (0.71–0.78). The pipeline's justification is therefore operational (scale, streaming, multilingual, cost bounds), not accuracy on this benchmark — and a benchmark that separates the methods at the synthesis layer remains to be built."

## Reproduce

```
cd scientific-research/2026-09-04-llm-only-baseline
node llmBaseline.mjs --all          # 9 runs, pool of 3, skips runs that already have scores.json (--force to redo)
node analyze.mjs                    # regenerates TABLES.md + summary.json
```
`llmBaseline.mjs` reads `OPENAI_API_KEY` from `functions/.env` (never printed). Single run: `node llmBaseline.mjs --condition=L2 --model=gpt-5.6-luna --seed=7`.
