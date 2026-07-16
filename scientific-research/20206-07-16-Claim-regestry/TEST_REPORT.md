# Claim-Registry Accuracy on Preferential Hard Triplets

**Benchmark of Freedi's claim-registry mechanism against embedding-cosine baselines on the evaluation set of Blair, Procaccia & Tambe, "Embeddings for Preferences, Not Semantics"**

*Freedi research — 2026-07-16. Branch `feat/claim-registry-improvements`. Harness and raw results in `benchmark/`.*

---

## 1. Executive summary

On 875 hard triplets — (anchor statement, same-stance paraphrase, stance-flipped rewrite) — the claim-registry LLM classifier reaches **95.0% triplet accuracy** with its production worker model (gpt-4o-mini), versus **0.5%** for the production embedding model (`text-embedding-3-small`, raw cosine) and **80.0%** for the reference paper's best system, an embedding model fine-tuned specifically for this task (DPT-tuned sentence-T5-XL).

Three further findings matter for production:

1. **The pipeline's cosine passes alone would misfile essentially every stance flip.** 100% of stance-flipped rewrites score above the Pass-2 attach threshold (cosine ≥ 0.60 against the anchor, production input format) and 99.1% above the Pass-1 threshold (≥ 0.85). The registry pass is the only mechanism in the pipeline that separates disagreement from agreement.
2. **The weak link is claim canonicalization, not classification.** Classifying against `generateClaim`'s 5–15-word canonical instead of the raw anchor drops accuracy from 95.0% to 70.1% (−24.9 points, McNemar p ≈ 2e-60). The summaries shift or blur the proposition; the classifier then faithfully misjudges against the shifted text.
3. **gpt-4o-mini is validated as the worker.** gpt-4o gains only +1.5 points (96.5%, p = 0.047) at ~20× the price, and detects fewer explicit "opposes" relations than mini (80.6% vs 95.9%).

The full-codebook condition (94 claims per prompt, no consolidation) shows a strict own-claim accuracy of 36.0%, but decomposition attributes most of the gap to unconsolidated near-duplicate claims in the benchmark codebook (attaching to an equivalent claim is scored as wrong) stacked on the canonicalization loss above — not to list-scale classifier failure (§5.5).

---

## 2. Background

**The paper.** Blair, Procaccia & Tambe show that text embeddings measure *semantic* similarity (topic, wording) rather than *preferential* similarity (would the same person endorse both?). Their diagnostic is the hard triplet: a semantic distractor that keeps the anchor's wording but flips its stance, and a preference match that keeps the stance but changes the wording. Base encoders rank the distractor closer 52–94% of the time (triplet accuracy 6.3–48.3%); their decorrelated preference tuning (DPT) lifts sentence-T5-XL to 80.0%.

**The mechanism under test.** Freedi's claim registry (docs/architecture/CLAIM_REGISTRY.md) is a canonical-labeling layer over the synthesis pipeline: every cluster carries a short canonical claim; new options that the cosine passes cannot place are classified by one gpt-4o-mini call against the question's *full* claim codebook, answering `expresses | opposes | none` with a confidence. An `expresses` at confidence ≥ 0.6 attaches; an `opposes` records a counter-edge and never attaches. The mechanism claims recall independent of embedding geometry; this benchmark tests the complementary property — that it does not *merge opposites* the way geometry does.

**The dataset.** `Proccacia-dataset/hard_eval_triplets_1k.jsonl`: 875 triplets over 11 deliberation datasets (Polis: Seattle minimum wage, Bowling Green, Brexit, Canadian electoral reform, UBI; Remesh: campus protests, foreign intervention, right to assemble; GSC: abortion ×2, chatbot personalization). Anchors are real participant statements; the paraphrase and flip are GPT-4o rewrites (the paper's own generation procedure, §4.3).

---

## 3. Method

The harness (`benchmark/`) imports the **production functions unmodified** — `classifyAgainstClaims`, `generateClaim`, `orderClaimsForClassification` from `functions/src/services/claim-registry-service.ts` — so the benchmark measures exactly the code that ships. The production attach rule (expresses ∧ confidence ≥ 0.6, `REGISTRY_MIN_CONFIDENCE`) is applied to all registry conditions.

A triplet is **correct** when the match attaches to the anchor's claim AND the distractor does not — the direct analogue of the paper's `s(a,p) > s(a,n)` criterion.

| Condition | What is measured |
|---|---|
| **A** | Cosine baseline, `text-embedding-3-small`, both raw text (paper-comparable) and the production `Question: …\nAnswer: …` input format; pipeline thresholds 0.60 / 0.85 simulated |
| **A2** | Embedding-gated judge (RAG pattern): the claim is only shown to the classifier if anchor↔statement cosine ≥ gate (0.45 = production vector-search floor; 0.60 variant). Derived analytically from B1 + A — the judge call is identical, only the gate differs |
| **B1** | Registry classifier, single-claim codebook, claim text = the raw anchor. Worker model gpt-4o-mini |
| **B2** | B1 with the claim text produced by `generateClaim` (production-faithful: codebooks store 5–15-word canonicals) |
| **C** | Full per-dataset codebook: every anchor's generated claim (13–100 claims, mean 94.3), ordered by `orderClaimsForClassification` with real cosine evidence — production scale and ordering |
| **D** | B1 re-run on gpt-4o (the production audit model) |

Statistics: Wilson 95% CIs; exact McNemar tests on paired triplet correctness. Question texts per dataset are inferred from the paper's dataset descriptions (the triplet files do not carry them); see Limitations.

A 150-triplet stratified pilot (seed 20260716, proportional across datasets) was run first as a go/no-go gate; the full run reuses its rows (append-only, resumable result logs keyed by triplet id).

---

## 4. Results

### 4.1 Headline: triplet accuracy, n = 875

| System | Triplet accuracy [95% CI] |
|---|---|
| A — cosine, raw text (production embedding model) | **0.5%** [0.2, 1.2] |
| A — cosine, production ctx format | 1.8% [1.1, 2.9] |
| *Paper: best base encoder (ST5-XL)* | *48.3%* |
| *Paper: DPT-tuned ST5-XL (fine-tuned for this task)* | *80.0%* |
| **B1 — registry, raw-anchor claim, gpt-4o-mini** | **95.0%** [93.3, 96.2] |
| A2 — embedding gate (0.45 or 0.60) + judge | 95.0% (identical to B1; gate never filters — see §5.4) |
| B2 — registry vs. generated canonical claims | **70.1%** [66.9, 73.0] |
| D — registry, raw-anchor claim, gpt-4o | **96.5%** [95.0, 97.5] |
| C — full 94-claim codebooks, strict own-claim scoring | 36.0% [32.9, 39.2] (see §5.5 decomposition) |

McNemar (paired): B1 vs A raw-cosine 827 vs 0 discordant, p ≈ 2e-249. B1 vs B2: 222 vs 4, p ≈ 2e-60. B1 vs D: 12 vs 25, p = 0.047.

### 4.2 Component rates (registry conditions)

| Metric | B1 (mini) | B2 (canonicals) | D (gpt-4o) |
|---|---|---|---|
| Match recall (paraphrase attaches) | 96.8% | 79.7% | 98.3% |
| Distractor false-attach | 2.1% | 12.8% | 1.8% |
| Distractor detected as **opposes** | 95.9% | 73.3% | 80.6% |
| Mean confidence (match / distractor) | 0.90 / 0.93 | 0.88 / 0.89 | 0.94 / 0.98 |

The `opposes` detection is a capability with no embedding analogue: production records it as a counter-edge (`counterStatementIds`), giving synthesis pro/con structure for free.

### 4.3 Pipeline-threshold simulation (Condition A, ctx-format cosine)

| Event | Rate |
|---|---|
| Stance-flip scores ≥ 0.60 vs anchor (would false-attach at Pass 2) | **100.0%** (875/875) |
| Stance-flip scores ≥ 0.85 (would false-attach at Pass 1) | **99.1%** |
| Paraphrase ≥ 0.60 (Pass 2 would correctly attach) | 100.0% |
| Pipeline-correct (paraphrase in, flip out, at 0.60) | **0.0%** |

Geometry cannot thread this needle at any threshold: on hard triplets the flip is *always* at least as close as the paraphrase.

### 4.4 Per-dataset triplet accuracy (abridged; full table in `benchmark/RESULTS.md`)

| Dataset | A cosine | B1 registry | B2 canonicals | D gpt-4o |
|---|---|---|---|---|
| gsc_abortion_gen | 0.0% | 98.0% | 76.0% | 98.0% |
| gsc_abortion_val | 1.0% | 92.0% | 79.0% | 97.0% |
| gsc_chatbot_gen | 0.0% | 90.9% | 52.5% | 90.9% |
| polis_15_per_hour_seattle | 0.0% | 76.9% | 30.8% | 92.3% |
| polis_american_assembly_bowling_green | 0.0% | 99.0% | 93.0% | 99.0% |
| polis_brexit_consensus | 0.0% | 97.9% | 68.8% | 97.9% |
| polis_canadian_electoral_reform | 0.0% | 96.0% | 60.0% | 97.0% |
| polis_scoop_hivemind_ubi | 0.0% | 93.3% | 80.0% | 100.0% |
| remesh_campus_protests | 2.0% | 98.0% | 68.0% | 98.0% |
| remesh_foreign_intervention | 0.0% | 97.0% | 62.0% | 97.0% |
| remesh_right_to_assemble | 1.0% | 90.0% | 74.0% | 94.0% |

B1 is ≥ 90% on 10 of 11 datasets. The exception (Seattle minimum wage, 76.9% but only n=13) contains the benchmark's noisiest anchors — e.g. a sarcastic "the small business will need to make poverty fashionable", where the "failure" is arguably correct behavior against an incoherent anchor.

---

## 5. Findings

### 5.1 Embeddings alone cannot see stance — and the production model is the extreme case

`text-embedding-3-small` scores 0.5% — below every encoder in the paper (6.3–48.3%). The stance flip barely moves the vector because the vector is dominated by topic and wording, which the flip shares by construction. In pipeline terms (§4.3): without the registry pass, essentially **every "I oppose X" arriving after "I support X" would merge into the same cluster**. This validates the registry's reason to exist with production's own geometry, not a proxy encoder.

### 5.2 Reading beats measuring — and beats task-specific fine-tuning

A single gpt-4o-mini call over the claim text (95.0%) outperforms the paper's purpose-built fine-tuned embedding (80.0%) by 15 points, with zero task-specific training. The classifier also *names the relation* (expresses/opposes/none) rather than emitting a distance, which is what lets production route opposition into counter-edges instead of merges.

### 5.3 The canonicalization step is the weak link (−24.9 points)

B2 replaces the raw anchor with `generateClaim`'s 5–15-word canonical — exactly what production codebooks store — and accuracy falls to 70.1%. 222 triplets that B1 gets right fail under B2, versus 4 the other way. Failure inspection shows a consistent mechanism: **compression shifts the proposition**, e.g. an anchor arguing that individuals with medical advice should decide becomes the canonical "The medical community should decide abortion policy"; both rewrites are then (correctly) judged against text that no longer says what the participant said. The classifier is not the failing component; its input is.

**Production implication (recommended change):** classify against richer claim context — at minimum `canonicalClaim` + `publicExplanation`, ideally plus one exemplar member statement per claim. This is a prompt-construction change in `classifyAgainstClaims` (the codebook line currently renders `canonicalClaim` only). The B1↔B2 gap bounds the available gain at up to ~25 points on stance-critical matching.

### 5.4 Embedding-gated retrieval ties the registry here — by construction, not in general

A2 (cosine gate ≥ 0.45 or 0.60, then judge) is *identical* to B1 on this dataset: 0 of 875 matches were lost at the gate, because hard triplets are lexically close on purpose — nuisance similarity is the trap. This dataset therefore **cannot test the registry's recall claim** (finding same-meaning/different-wording statements that cosine retrieval misses, the §1.2 "recall gap" of the mechanism doc). What it does establish: all of the accuracy comes from the judge, none from the geometry. Measuring the recall-gap advantage needs the opposite dataset — low-cosine paraphrase pairs — which the registry's own decision log accumulates in production (matches recorded at low/absent cosine).

### 5.5 Full-codebook scale: most of the strict-score drop is benchmark artifact, some is real

Condition C scores 36.0% under strict scoring (match must attach to *its own* anchor's claim among ~94). Decomposition:

- **74.4%** of matches attach to *some* claim (vs B2's 79.7% single-claim recall → list length itself costs only ~5 points of recall);
- **290 matches (33.1%)** attach to a *different* claim — and sampled inspection shows these are predominantly **legitimate near-duplicates** (the benchmark codebook gives every anchor its own claim and never runs production's consolidation pass, so one conversation contributes many equivalent claims — in one sampled case two participants' canonicals are word-for-word identical);
- distractor→own-claim false-attach is 10.3%, in line with B2's 12.8% — crowding does not inflate false attaches.

So C's honest reading: at production scale the classifier keeps rejecting flips, keeps attaching paraphrases *somewhere reasonable*, but inherits the B2 canonicalization loss and is unfairly penalized by duplicate claims that production consolidation would have merged. A cleaner scale test would consolidate the codebook first; left as follow-up.

### 5.6 gpt-4o adds 1.5 points at ~20× the cost

96.5% vs 95.0% (p = 0.047). The worker/audit split (mini decides, gpt-4o audits 5%) is the right economics. Notably mini labels flips "opposes" more often (95.9% vs 80.6%; gpt-4o prefers "none") — mini actually yields better counter-edge coverage, while both reject the attach equally well.

### 5.7 Operational finding: sustained TPM ceilings silently corrupted fail-closed classifications

The gpt-4o condition initially saturated the org's 30k tokens/min limit; `callLLM`'s 3 fast retries (~1.5s window) exhausted against a bucket that refills over a minute, and `classifyAgainstClaims` failed **closed** — returning `none` results indistinguishable from honest verdicts (260 of the first 456 rows were silent corruption; purged and re-run throttled). In production the same mechanism would surface as a burst of spurious "new claim" spawns during any dense backfill/first-run. **Fixed on this branch** (commit `25f25c07`): 429-aware retries honoring the server's retry-after hint (6 attempts, jittered, capped 20s), an explicit `failedClosed` marker on degraded classifications surfaced in the persisted decision log, and audit hygiene (failed-closed primaries not audited; failed-closed secondaries not persisted). After the fix and matched concurrency, the remaining ~1,500 calls produced **zero** corrupted rows.

---

## 6. Cost

Measured prompt-size-based estimate for the complete benchmark (≈ 8,000 LLM calls + ~7,500 embeddings):

| Stage | Calls | Est. cost |
|---|---|---|
| B1 classify (gpt-4o-mini) | 1,750 | $0.19 |
| B2 claim-gen + classify (gpt-4o-mini) | 2,625 | $0.25 |
| D classify (gpt-4o) | 1,750 | $3.16 |
| C classify, ~94-claim prompts (gpt-4o-mini) | 1,750 | $0.72 |
| Embeddings (A + C ordering) | ~7,500 texts | $0.01 |
| **Total** | | **≈ $4.3** (+ modest retry overhead) |

Production-relevant rates: **≈ $0.11 per 1,000 registry classifications** at small codebooks, **≈ $0.41 per 1,000** at 100-claim codebooks (gpt-4o-mini).

## 7. Limitations

1. **Question texts inferred.** The triplet files carry no question; per-dataset question texts were written from the paper's dataset descriptions. The classifier receives the question as context, so wording differences could shift marginal cases.
2. **Dataset label noise.** Anchors are raw participant text; some are sarcastic or self-contradictory, and a few GPT-4o "paraphrases" arguably flip stance themselves (e.g. `main:854`). B1/D errors concentrate there.
3. **A2 cannot show the recall gap** (§5.4): all pairs are high-cosine by construction. The registry's always-classify-full-codebook advantage over gated retrieval is untested here.
4. **C conflates three effects** (canonicalization loss, unconsolidated duplicates, list-scale confusion); the strict number is a lower bound (§5.5).
5. **English only**, single run per condition (temperature 0 makes repeats near-deterministic but not guaranteed identical).
6. Triplet scoring tests *pairwise* stance discrimination, not end-to-end pipeline behavior (spawn/consolidation dynamics, cosine passes firing before the registry, etc.).

## 8. Recommendations

1. **Ship the registry pass** for stance integrity, independent of the recall-gap motivation — it is the only defense against opposite-stance merges (§5.1), at ~$0.1–0.4 per 1,000 statements.
2. **Enrich the classification codebook text** (canonical + explanation + exemplar) to recover the ~25-point canonicalization loss (§5.3). Cheap prompt change; re-run B2/C afterward to verify.
3. **Keep gpt-4o-mini as worker** (§5.6).
4. Rate-limit hardening is merged (§5.7); for future backfills/first-runs, size `LLM_CONCURRENCY` to the model's TPM ceiling (mini's 200k TPM supports ~3 concurrent 2k-token codebook prompts at current latencies).
5. Follow-up experiments: consolidated-codebook C variant; a low-cosine paraphrase benchmark (from production decision logs) to measure the recall gap A2 could not.

## 9. Reproduction

```bash
cd scientific-research/20206-07-16-Claim-regestry/benchmark
npx tsx make-pilot-sample.ts                      # fixed stratified pilot (seed 20260716)
npx tsx run-cosine-baseline.ts                    # condition A
npx tsx run-registry-single.ts                    # B1
npx tsx run-registry-single.ts --generated-claims # B2
LLM_CONCURRENCY=2 npx tsx run-registry-single.ts --model gpt-4o   # D (30k TPM ceiling)
LLM_CONCURRENCY=3 npx tsx run-registry-codebook.ts                # C (200k TPM, ~2k-token prompts)
npx tsx analyze.ts                                # → RESULTS.md
```

Requires `OPENAI_API_KEY` (read from `functions/.env`). All runners are resumable (append-only JSONL keyed by triplet id). Raw per-triplet decisions: `benchmark/results/*.jsonl`; aggregate tables: `benchmark/RESULTS.md`.
