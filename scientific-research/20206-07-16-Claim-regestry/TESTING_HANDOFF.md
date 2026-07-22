# Testing Handoff — What Remains to Finish the Claim-Registry Benchmark

*Written 2026-07-17, updated 2026-07-22, for a fresh session. Everything below assumes the repo state at commit `7ed663aa1` on `feat/claim-registry-improvements` plus the harness fix described below.*

## Where things stand (all committed)

| Work | Status | Result |
|---|---|---|
| Main benchmark, 8 conditions × 875 hard triplets | ✅ done | Registry 95.0% (raw claims) vs embeddings 0.5% vs paper's DPT 80.0% |
| Phase 0 (enriched codebook lines) + verification | ✅ shipped `f403bf05a` | B2 70.1% → B2E 87.4% |
| Phase 0b (stance-caution prompt) + verification | ✅ shipped `273b341fd` | false merges 19.3% → 10.3%, single-claim 88.6% |
| Phase 1 (hierarchy data model) | ✅ shipped `273b341fd` | dormant, 44/44 tests |
| Phase 2 (two-hop classification + flat fallback) | ✅ shipped `09be6876e` | dormant; unit-tested; **benchmark verification IN PROGRESS, incomplete (see below)** |
| Recall-gap experiment (Condition E) | ✅ done | gate safe in English; Hebrew 100% judge recall |
| Reports | ✅ current through Phase 0b | `TEST_REPORT.md`, `report/claim-registry-report.pdf`, `benchmark/RECALL_GAP.md` |

## THE ONE REMAINING TEST: Condition CH (Phase 2 verification) — 2026-07-22 status

**A harness bug was found and fixed today.** `buildTopicStructure` in `run-registry-hierarchical.ts` cached per-claim topic assignments keyed only by dataset name and reused any cached entry unconditionally (`if (cached) return cached`). A stale cache from an earlier small pilot run (4-8 claims/dataset assigned, out of ~100) got reused for the first full-scale attempt: claims missing from the cache defaulted to "no topic parent," and production's `classifyHierarchical` has a deliberate safety rule — any claim with no topic parent is always included in the candidate set (`claim-registry-service.ts:469-471`). That made ~90-99% of every dataset's claims look unrouted, sweeping nearly the whole codebook into every decision regardless of actual routing quality. Measured effect: candidate-list-size 92% (gate: <40%), fallback rate 19.8% (gate: <15%). **Fix (already committed):** `buildTopicStructure` now checks that every claim id in the current run is present in a cached entry's assignments before reusing it; otherwise it rebuilds from scratch. See the diff in `run-registry-hierarchical.ts`'s `buildTopicStructure`.

**Then we hit a second, unrelated problem: the OpenAI account's daily request quota.** It's a **sliding 24-hour window**, not a fixed daily reset — confirmed because every `429 ... requests per day (RPD)` warning's "please try again in Xs" hint was consistently **8.64s**, and `10,000 requests/day ÷ 86,400 seconds/day = 8.64s` exactly. That means once the day's usage is pinned at the ceiling (as it was today, after ~5 benchmark attempts), throughput drops to a steady ~1 request/8.64s trickle that does **not** clear early — it only eases as each hour's earlier usage ages past the 24h mark. Combined with the classification call chain (hop 1 → hop 2 → optional fallback, all sequential per statement, ~100 triplets' worth of hop-1 calls all queued at once per dataset before any hop-2 call even gets a turn), this made full-scale runs crawl — one attempt even got silently killed by an external process-runtime limit around the ~78-minute mark (not a script error; safely resumed since the script tracks completed ids).

**Current state (stopped intentionally 2026-07-22, not a failure):** `results/registry-hierarchical-CH.jsonl` holds **249 of 875 rows**, genuinely produced under the FIXED code, covering 3 of 11 datasets (`polis_canadian_electoral_reform` and `remesh_right_to_assemble` complete, `remesh_campus_protests` partial). `results/topic-structure.jsonl` has valid, fully-covering topic assignments for those 3 datasets. `RESULTS.md` was regenerated against this partial data — its CH section honestly shows `n=249`, not `n=875`.

**Partial signal (n=249, NOT a final gate check — too small, don't treat as pass/fail):**

| Metric | Buggy full run (n=875) | Partial fixed run (n=249) | Gate |
|---|---|---|---|
| Candidate-list size | 92% | **56%** | < 40% |
| Fallback rate | 19.8% | 27.7% | < 15% |
| Triplet accuracy vs CE2 | 52.3% (McNemar p=0.111) | comparable (McNemar p=0.583) | within 2pp of 53.8% |

The fix clearly worked directionally (92%→56% is real, not noise) but 56% is still above the 40% target on this small slice — consistent with the *secondary* factor flagged in the original diagnosis: topic granularity is coarse (2-8 broad topics covering up to 100 claims per dataset), so even correct routing may not narrow enough. The one dataset that escaped the original bug entirely (`gsc_chatbot_gen`) sat at 48%, just above target too — same story.

**Recommended next step — test on a subset before committing to a full run:**

A full run needs an estimated **~4,600 total API calls** (revised up from the original ~2,000-2,600 estimate — that undercounted the one-time per-claim topic-routing step, which alone is ~875 calls). At today's throttled rate that's many hours. Before burning that, get a cheap, fast read on whether the fix is sufficient, or whether topic granularity also needs tuning (e.g. `MAX_ROUTED_TOPICS=3` in `claim-registry-service.ts`, or asking for more/narrower topics in the `TOPICS_SYSTEM` prompt in `run-registry-hierarchical.ts`):

```bash
# Option A — first N triplets (quick, but likely just extends the same 3 datasets already done)
LLM_CONCURRENCY=3 npx tsx run-registry-hierarchical.ts --limit 200

# Option B — curated sample covering NEW datasets not yet touched, for a more diverse read
# (build a small ids.json first, e.g. via make-pilot-sample.ts or by hand from Proccacia-dataset)
LLM_CONCURRENCY=3 npx tsx run-registry-hierarchical.ts --sample results/subset-ids.json
```

Check quota headroom on the OpenAI dashboard first — today's usage should have started aging out of the 24h window by tomorrow, giving much more real throughput. If the subset's candidate-list-size clears (or gets close to) 40%, proceed to the full run below. If it's still ~50-60%, tune topic granularity first — re-running the full 875 without that would likely just reproduce the same gate failure.

**How to run the full test** (from `scientific-research/20206-07-16-Claim-regestry/benchmark/`, needs `OPENAI_API_KEY` in `functions/.env` — loaded automatically):

```bash
LLM_CONCURRENCY=3 npx tsx run-registry-hierarchical.ts >> results/ch-run.log 2>&1   # append mode preserves history; ~4,600 requests
npx tsx analyze.ts                                        # → RESULTS.md (CH section + gates table + McNemar CE2-vs-CH)
```

This resumes from the current 249 rows automatically (append-only JSONL keyed by triplet id, `doneIds()` skips completed triplets; cached topic structures for the 3 done datasets are reused correctly since they now pass the full-coverage check). The runner throws rather than persisting any fail-closed (rate-limit-corrupted) row, so the data cannot be silently poisoned. If it gets externally killed again (log just stops mid-retry-warning, no thrown error, no `Done ->`), just rerun the same command — it resumes safely.

**Gates to check (`plans/claim-registry-hierarchy-plan.md`):**

1. Strict triplet accuracy within **2pp of CE2** (CE2 = 53.8% [50.5, 57.1], so CH ≥ ~51.8%)
2. Fallback rate **< 15%** of decisions
3. Mean candidate-list size **< 40%** of the codebook

**After the run, update:**
1. `RESULTS.md` regenerates itself (analyze.ts).
2. `TEST_REPORT.md` — add a Phase 2 verification paragraph next to the Phase 0/0b table (§5.3 area), stating each gate pass/fail and noting the harness bug + fix.
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
