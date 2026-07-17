# Testing Handoff — What Remains to Finish the Claim-Registry Benchmark

*Written 2026-07-17 for a fresh session. Everything below assumes the repo state at commit `7ed663aa1` on `feat/claim-registry-improvements`.*

## Where things stand (all committed)

| Work | Status | Result |
|---|---|---|
| Main benchmark, 8 conditions × 875 hard triplets | ✅ done | Registry 95.0% (raw claims) vs embeddings 0.5% vs paper's DPT 80.0% |
| Phase 0 (enriched codebook lines) + verification | ✅ shipped `f403bf05a` | B2 70.1% → B2E 87.4% |
| Phase 0b (stance-caution prompt) + verification | ✅ shipped `273b341fd` | false merges 19.3% → 10.3%, single-claim 88.6% |
| Phase 1 (hierarchy data model) | ✅ shipped `273b341fd` | dormant, 44/44 tests |
| Phase 2 (two-hop classification + flat fallback) | ✅ shipped `09be6876e` | dormant; unit-tested; **benchmark verification NOT run** |
| Recall-gap experiment (Condition E) | ✅ done | gate safe in English; Hebrew 100% judge recall |
| Reports | ✅ current through Phase 0b | `TEST_REPORT.md`, `report/claim-registry-report.pdf`, `benchmark/RECALL_GAP.md` |

## THE ONE REMAINING TEST: Condition CH (Phase 2 verification)

**Why it didn't run:** the org exhausted gpt-4o-mini's 10,000 requests/day quota on 2026-07-16 (the benchmark day used ~15–20k requests). The harness is ready and smoke-tested; topic structures for 10/11 datasets are already generated and cached in `benchmark/results/topic-structure.jsonl`.

**What it verifies:** the production `classifyHierarchical` (route to ≤2 topics → scoped classify → flat fallback) at 94-claim codebook scale, against these gates from `plans/claim-registry-hierarchy-plan.md`:

1. Strict triplet accuracy within **2pp of CE2** (CE2 = 53.8% [50.5, 57.1], so CH ≥ ~51.8%)
2. Fallback rate **< 15%** of decisions
3. Mean candidate-list size **< 40%** of the codebook

**How to run** (from `scientific-research/20206-07-16-Claim-regestry/benchmark/`, needs `OPENAI_API_KEY` in `functions/.env` — loaded automatically):

```bash
LLM_CONCURRENCY=4 npx tsx run-registry-hierarchical.ts   # ~2,000-2,600 requests, ~40-60 min
npx tsx analyze.ts                                        # → RESULTS.md (CH section + gates table + McNemar CE2-vs-CH)
```

Both are resumable (append-only JSONL keyed by triplet id) — if the run aborts on quota, rerun the same command; completed triplets are skipped. The runner throws rather than persisting any fail-closed (rate-limit-corrupted) row, so the data cannot be silently poisoned. Before running, check quota headroom on the OpenAI dashboard; a burst of `429 ... requests per day (RPD)` warnings in the output means wait for the rolling window (or request a tier bump).

**Note the 40-row smoke artifact:** `results/registry-hierarchical-CH.jsonl` already contains 40 rows produced with tiny per-dataset codebooks (4 claims → all decisions correctly took the flat path). These rows are from limit-sliced codebooks, NOT the full-scale test — **delete the file before the real run** so all rows come from full 100-claim codebooks:

```bash
rm results/registry-hierarchical-CH.jsonl
```

**After the run, update:**
1. `RESULTS.md` regenerates itself (analyze.ts).
2. `TEST_REPORT.md` — add a Phase 2 verification paragraph next to the Phase 0/0b table (§5.3 area), stating each gate pass/fail.
3. `report/claim-registry-report.html` — short paragraph in the recommendations/§4.3 area; re-render:
   ```bash
   cd ../report && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="claim-registry-report.pdf" "file://$(pwd)/claim-registry-report.html"
   ```
4. `plans/claim-registry-hierarchy-plan.md` — Phase 2 status → verified (or gate-failed + diagnosis).
5. Commit per repo convention.

**Decision rule:** if all three gates pass → Phase 3 (topic growth via consolidation) is unblocked. If the fallback rate fails (>15%) → routing quality is the problem; inspect `routedTopicIds` on failing rows and consider MAX_ROUTED_TOPICS=3 or better topic explanations before Phase 3. If accuracy fails → compare CH's misses against CE2's on the same ids (both files keyed identically) to see whether routing or scoping caused them.

## Optional follow-ups (in priority order, none blocking)

1. **Consolidated-codebook C variant** — the strict C/CE scores are depressed by unconsolidated near-duplicate claims; run consolidation over the benchmark codebooks first for a cleaner scale measurement.
2. **Arabic recall test** — extend `run-recall-gap.ts` (add an `arabic` style next to `hebrew`) to cover Freedi's other main language.
3. **Organic recall gap** — once the registry runs live, query `_claimRegistry/{qid}/decisions` for matches with low/absent `cosineAtMatch`; that measures the real-world recall gap the synthetic test couldn't.
4. **OpenAI tier bump** — 10k requests/day is the binding constraint for benchmark-scale work (~1.2–2.4 requests/statement in production; see TEST_REPORT cost section).

## Key file map

```
scientific-research/20206-07-16-Claim-regestry/
├── TESTING_HANDOFF.md            ← this file
├── TEST_REPORT.md                ← engineering report, all numbers
├── report/claim-registry-report.{html,pdf}  ← plain-language scientific report
├── Proccacia-dataset/            ← the 875 + 100 hard triplets
└── benchmark/
    ├── README.md                 ← how to run every condition
    ├── RESULTS.md, RECALL_GAP.md ← generated tables
    ├── run-*.ts, analyze*.ts     ← harness (imports production code unmodified)
    └── results/*.jsonl           ← raw per-triplet decisions (resumable caches)

plans/claim-registry-hierarchy-plan.md   ← phase statuses + Phase 3/4 designs
functions/src/services/claim-registry-service.ts  ← everything shipped lives here
```
