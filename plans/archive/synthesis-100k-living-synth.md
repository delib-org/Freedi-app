# Plan: Scale `synthesizeIdeas` from 764 → 100k options, with a living-synth layer

## Context

Today's idea-synthesis pipeline (`functions/src/fn_synthesizeIdeas.ts → synthesizeIdeasPreview`) hits the 540s Cloud Function ceiling at **764 options**. The roadmap is 100k options under one question, with synth-statements that:
- Aggregate evaluations from their members (with the right vote-counting rules).
- Accept direct evaluations on the synth itself.
- Auto-update when members are evaluated, edited, or added.
- Participate in the **Polarization / Collaboration Index** so demographic-aware bridging math works on them.

### What already exists in the codebase (don't reinvent)

A scan of `functions/src/condensation/`, `fn_hybridClustering.ts`, `fn_synthesizeIdeas.ts`, `evaluation/onCreateEvaluation.ts`, and `fn_polarizationIndex.ts` revealed the model is already partially built:

- **Cluster statements use `integratedOptions: string[]`** — a Statement listing the IDs of members it aggregates. Used by the synthesis pipeline (line 697 of `fn_synthesizeIdeas.ts`), the condensation pipeline (`condensation/pipeline.ts:665, 723`), and hybrid clustering (`fn_hybridClustering.ts:607`). **This IS the synth model. We don't need a new `'synthesis'` statement type or a `members` field.**
- **Aggregator already exists**: `condensation/aggregation.ts` has `computeClusterEvaluationFromRawEvals()` and `fetchEvaluationsForIds()`. Today it dedupes per evaluator using **average of all their votes (member + direct)**. That's *one* vote per evaluator per cluster — which is the right shape — but doesn't honor "direct vote wins." Easy to extend.
- **Cluster lookup helper exists**: `condensation/aggregation.ts:368–371` queries `statements where integratedOptions array-contains <memberId>` to find which clusters contain a given member.
- **Polarization Index already does demographic walk**: `fn_polarizationIndex.ts:64 updateUserDemographicEvaluation()` looks up the evaluator's demographics via `demographicAnchorId` or ancestor walk, then writes per-group MAD to `polarizationIndex/{statementId}`. **It runs per-statement and is not currently cluster-aware** — it computes for the directly-evaluated statement only.
- **Polarization is stored separately** in collection `polarizationIndex/{id}`, not on the Statement doc.
- **Evaluation triggers** call `updateUserDemographicEvaluation(statement, userEvalData)` from `evaluation/onCreateEvaluation.ts:95` and `evaluation/onUpdateEvaluation.ts:78`.

**Implication for demographics:** synths do NOT need to *carry* demographic data. The polarization compute looks up demographics per evaluator at trigger time. As long as the synth's evaluator set is correct (rolled up from members + direct), the existing collaboration-index math works for it automatically. The work is wiring the trigger to also fire on parent clusters when a member is evaluated.

## TL;DR

- **Ship 1 (week 1–2)** clears today's 540s pain for 1k–10k. Bulk in-memory UMAP+HDBSCAN replaces Phase 3's N anchor-queries, two-tier judge replaces all-pairs LLM, Bayesian pre-filter shrinks the working set. Outputs the **same `integratedOptions` cluster shape** the rest of the codebase already understands.
- **Ship 2 (week 3–4)** makes synthesis async: `jobId` returned in <1s, phases as Pub/Sub-triggered functions ≤300s each, UI streams partial results.
- **Ship 3 (week 5–6) is the living-synth layer**, layered on the existing model:
  - **Live attach** on option-create (when user opted out of foreground "join similar?")
  - **Edit invalidation** on option-update with a cheap cosine-drift pre-check
  - **Cluster-aware vote rollup**: extend the evaluation trigger to walk `array-contains integratedOptions`, recompute the cluster's `evaluation` aggregate (using direct-wins dedup) and fire the polarization-index update for the cluster too
  - **Cost guards**: per-parent debounce on auto-spawn, gray-band candidates routed to `_liveSynthCandidates/` for admin review instead of autonomous LLM
- **Demographic flow:** zero data-model change. Demographics are looked up per-evaluator at compute time. Wiring the polarization trigger to the parent cluster is the entire change.

## Vote-counting model (decided: direct-wins, one vote per evaluator)

For any cluster `Y` with `integratedOptions: [X1, X2, …]`:

For each evaluator `E`:
- If `E` cast a **direct vote on Y** → that's `E`'s contribution to `Y`.
- Else → `E`'s contribution = `avg(E's votes across members of Y that E has voted on)`.
- `E` counts **exactly once** in `Y.numberOfEvaluators`.
- Member consensuses are unchanged by this rollup; member votes stay on member docs.

`Y.consensus = avg(contribution_E for E in evaluators_of_any_member_or_Y)`.

**Implementation:** add a `directVoteWins: boolean` option to `computeClusterEvaluationFromRawEvals` (default `false` to preserve existing condensation-pipeline semantics; pass `true` from the live-synth path).

---

## Ship 1 — Clear the 540s ceiling for 1k–10k (week 1–2)

Fully synchronous, single function. Replaces the dominant bottleneck without async machinery. Keeps the same output shape (`integratedOptions` clusters) so downstream code doesn't change.

### Files to change

| Path | Purpose |
|---|---|
| `functions/src/services/vector-search-service.ts` | Drop the per-doc `logger.info` at line 141 (~45k INFO emissions/run today); replace with one aggregated `logger.debug`. |
| `functions/src/synthesis/scoring.ts` *(new)* | Bayesian-shrunk score + filter helper. |
| `functions/src/synthesis/bulkCluster.ts` *(new)* | `bulkClusterByEmbedding(items, opts)` using UMAP + HDBSCAN. |
| `functions/src/synthesis/twoTierJudge.ts` *(new)* | Cosine bands + member↔centroid (medoid) judging, wraps existing `judgeSemanticEquivalenceCached`. |
| `functions/src/fn_synthesizeIdeas.ts` | Replace Phase 3 (`buildCandidateEdges`) with `bulkClusterByEmbedding`; replace Phase 4 with `twoTierJudge`. Bump `memory: '1GiB' → '2GiB'`. Output is unchanged: cluster statements with `integratedOptions`. |
| `functions/src/condensation/aggregation.ts` | Add `directVoteWins?: boolean` option to `computeClusterEvaluationFromRawEvals`. When true, if any of the user's evaluations target the cluster's own statementId, that one wins; otherwise average member votes. Default false → existing callers unaffected. |
| `functions/package.json` | Add `hdbscan-js` (~30 KB, MIT). Spike-test against existing `density-clustering` first. |

### Algorithmic decisions

- **Bayesian pre-filter:** `score = (v·avg + m·prior) / (v + m)` with `m = 5`, `prior = global mean`. Keep options where `score ≥ prior + 0.5·σ`. Today's `minAverage`/`minConsensus`/`minEvaluators` knobs stay as override floors.
- **Bulk clustering:** load all working-set embeddings via existing `embeddingCache.getBatchEmbeddings`, UMAP→5d, HDBSCAN with `minClusterSize = max(3, N′/200)`. Memory at 10k items: ~200 MB peak. Comfortable on 2 GiB.
- **Two-tier judge:** `≥0.94` auto-accept, `<0.82` auto-reject, `[0.82, 0.94)` → LLM. Within candidate clusters, judge **member↔medoid**. ≥80% agree → accept whole cluster. 50–80% → split via existing `refineComponent`. <50% → discard. Hard cap: `min(2000, N′ × 0.2)` LLM calls/run; over-cap clusters get `verifiedBy: 'cosine-only'`.
- **Logging surgery:** existing `logger.info` at `vector-search-service.ts:141` fires per result returned by `findNearest` (~60 per anchor). At 764 anchors that's ~45k structured log lines per run. Replace with one `logger.debug('vectorSearch.candidates', { parentId, candidatesScanned, candidatesPassed, topSimilarity })` after the loop. Conservative wall-clock saving: 30–60s per run.

### Reused primitives

`embeddingCache.getBatchEmbeddings`, `verdictCache` + `judgeSemanticEquivalenceCached`, `refineComponent`, `generateSynthesizedProposal`, `meanVector` from `topic-cluster/cluster.ts`, `executeBatchUpdates`, **`computeClusterEvaluationFromRawEvals`** (extended with `directVoteWins`), **`fetchEvaluationsForIds`**.

---

## Ship 2 — Async job model (week 3–4)

Callable becomes non-blocking; phases run as separate Pub/Sub-triggered functions ≤300s each. (Same as before.)

### Job state machine

```
synthesisJobs/{jobId}:
  questionId, status, currentPhase, phasesCompleted[],
  progress { current, total, message },
  workingSetIds[], clusterAssignments{...},
  verifiedClusters[], proposals[],
  cancelRequested, lastHeartbeat, startedAt, completedAt?
```

Phases (each = one Cloud Function, Pub/Sub trigger, `timeoutSeconds: 300`):
- `PHASE_LOADING` → load + Bayesian-filter
- `PHASE_CLUSTERING` → bulk UMAP+HDBSCAN
- `PHASE_VERIFYING` → two-tier judge, **chunked at 50 clusters/message** for parallelism
- `PHASE_PROPOSING` → Anthropic proposals, **chunked at 10 clusters/message**
- `PHASE_DONE` → `status = 'ready-for-review'`

### Files to change

- `fn_synthesizeIdeas.ts` (807 lines) splits into `fn_synthesisJobStart.ts` + four phase functions.
- New Pub/Sub topics: `synthesis-phase-{loading,clustering,verifying,proposing}`.
- New scheduled `fn_synthesisHeartbeatSweep.ts` — every 5 min, marks jobs stale if `Date.now() - lastHeartbeat > 600s`, re-publishes the last incomplete phase.
- Frontend: admin UI subscribes to `synthesisJobs/{jobId}` + `synthesisJobs/{jobId}/clusters` for streaming partial results.

### Reliability

- **Idempotency:** chunk outputs written under deterministic `chunkId`; phases check `phasesCompleted` before running.
- **Cancel:** admin sets `cancelRequested: true`; checked at message handler entry + chunk boundaries.
- **Partial failure:** after 5 Pub/Sub retries, chunk marked failed; rest of run proceeds.
- **Heartbeat:** active phase writes `lastHeartbeat = Date.now()` every 30s.

---

## Ship 3 — Living-synth layer (week 5–6) ⭐

Three triggers added to the existing model. No new statement type, no new fields. Reuses `integratedOptions`, `computeClusterEvaluationFromRawEvals`, `updateUserDemographicEvaluation`.

### Trigger 1: `fn_onOptionCreateLive` (Firestore onCreate `statements/{id}` for `statementType == 'option'`)

Runs **only if** `metadata.optedOutOfMerge === true` (set by the foreground "join similar?" UI when user dismisses).

1. Generate or fetch the option's embedding (existing `embeddingService`).
2. `findNearest(limit=10, threshold=0.85)` over `statements where parentId == option.parentId AND statementType in ['option','question']` (clusters live as same-type statements with `integratedOptions` populated).
3. Action by tier:
   - **Top hit ≥ 0.92 AND it's a cluster** (`integratedOptions.length > 0`) → **attach**: append `option.id` to cluster's `integratedOptions`. Trigger 3 will recompute the cluster's evaluation aggregate next vote.
   - **Top hit ≥ 0.92 AND it's a regular option** → **spawn cluster**: call `generateSynthesizedProposal([option, sibling], questionContext)`, write a new statement with `integratedOptions: [option.id, sibling.id]`. Initialize its evaluation aggregate via `computeClusterEvaluationFromRawEvals(fetchEvaluationsForIds([option.id, sibling.id]), { directVoteWins: true })`.
   - **Top hit ∈ [0.85, 0.92)** → log to `_liveSynthCandidates/` for admin review. No autonomous LLM call.
   - **<0.85** → no action.
4. Cost guard: 60s per-parent debounce on cluster spawns. Skip if a cluster was created under this parent in the last 60s.

### Trigger 2: `fn_onOptionUpdateLive` (Firestore onUpdate `statements/{id}` where `statement` text changed AND option is in any cluster)

1. Quick check: regenerate embedding (or fetch via `textHash` invalidation in `embeddingCache`); compute cosine vs. old embedding. If `cosine_drift < 0.05` → skip (meaning preserved, no LLM call).
2. Else: cheap LLM diff via `verdictCache` keyed by `(oldHash, newHash)` — "are these still semantically equivalent?".
3. If **diverged** → unlink: remove option from each containing cluster's `integratedOptions`. If a cluster's `integratedOptions.length` drops to 1, auto-dissolve it (delete the cluster doc; the lone remaining option reverts to a standalone; direct cluster-votes archived to `_orphanedClusterVotes/`).
4. If still equivalent → optionally re-fire Trigger 1 to see if the edited option now matches a *different* cluster better.

### Trigger 3: extend the existing evaluation triggers (`evaluation/onCreateEvaluation.ts:95`, `evaluation/onUpdateEvaluation.ts:78`)

This is the **collaboration-index integration.** Today these triggers call `updateUserDemographicEvaluation(statement, userEvalData)` for the directly-evaluated statement only. Extension:

1. Existing call stays — runs polarization index for the evaluated statement.
2. **NEW:** look up clusters containing the evaluated statement: `db.collection('statements').where('integratedOptions', 'array-contains', statement.statementId).get()`.
3. For each containing cluster `Y`:
   - Schedule a debounced recompute of `Y.evaluation` (using `computeClusterEvaluationFromRawEvals` with `directVoteWins: true`).
   - Schedule a debounced call to `updateUserDemographicEvaluation(Y, userEvalDataForY)` where `userEvalDataForY.evaluation` is the user's *effective vote* on Y per the rollup rule (existing direct vote on Y, or average of their member votes).
4. **Direct votes on a cluster** are handled by the same trigger entering the "no containing cluster" branch (because the cluster doesn't appear in any other cluster's `integratedOptions`); the existing `updateUserDemographicEvaluation(cluster, ...)` call already runs and gets the correct effective vote (the direct one) automatically since `directVoteWins: true` would prefer it.

### Debounced flusher: `fn_clusterRecomputeFlush.ts` (scheduled, every 10s)

Avoids write hot-spots on viral clusters. Each trigger 3 schedules work by writing `pendingRecompute: { clusterId, requestedAt }` to a small `_clusterRecomputeQueue/` collection. The flusher picks up all pending requests, coalesces by `clusterId`, runs `computeClusterEvaluationFromRawEvals + updateUserDemographicEvaluation` once per cluster.

### Bootstrap → live handoff

When the feature ships on a question that already has hundreds of options:
1. Admin runs initial synthesis (Ships 1+2 async job). Output: cluster statements with `integratedOptions` populated.
2. The condensation/synthesis aggregator already writes the initial `evaluation` aggregate per cluster.
3. Once bootstrap completes, the live triggers maintain the graph for free per write.

The 540s batch path is reserved for: initial bootstrap, admin-requested re-cluster, and one-off pipeline reruns.

### Demographic / Collaboration-Index flow (the user's specific ask)

**No data-model change required.** `updateUserDemographicEvaluation` already:
- Looks up the evaluator's demographic answers via `demographicAnchorId` or by walking the statement's ancestors.
- Computes per-group MAD.
- Writes to `polarizationIndex/{Y.statementId}` for any statement Y it's called on.

The only addition is **Step 2 of Trigger 3**: when an evaluation lands on a member, also call the trigger for the parent cluster Y with the user's *effective vote on Y*. That gives Y a `polarizationIndex/{Y.id}` doc populated with member-rolled-up votes alongside any direct votes — fully demographic-aware. The existing collaboration-index UI consumes Y's polarization index without modification.

### Scaling math

| N input | Bootstrap (Ships 1+2) | Per-write cost (Ship 3) | Continuous LLM cost/day |
|---|---|---|---|
| 1k | <60s | ~50ms (1 vector search) + maybe 1 LLM call | ≤1k LLM calls/day |
| 10k | ~3 min | ~50ms + maybe 1 LLM call | ≤1k LLM calls/day |
| 100k | <8 min | ~100ms + maybe 1 LLM call | ≤1k LLM calls/day |

Per-write cost is constant w.r.t. corpus size.

### Files to add/change in Ship 3

| Path | Purpose |
|---|---|
| `functions/src/synthesis/liveSynth/onOptionCreateLive.ts` *(new)* | Trigger 1 logic. |
| `functions/src/synthesis/liveSynth/onOptionUpdateLive.ts` *(new)* | Trigger 2 logic — edit invalidation. |
| `functions/src/evaluation/onCreateEvaluation.ts` | Add cluster-walk after existing `updateUserDemographicEvaluation` call (line 95). |
| `functions/src/evaluation/onUpdateEvaluation.ts` | Same extension (line 78). |
| `functions/src/synthesis/liveSynth/clusterAwareEvalRecompute.ts` *(new)* | Helper that resolves containing clusters and queues debounced recompute requests. |
| `functions/src/synthesis/liveSynth/scheduledFlush.ts` *(new)* | 10s scheduled flusher: dequeues, coalesces, runs `computeClusterEvaluationFromRawEvals` + `updateUserDemographicEvaluation` per cluster. |
| `functions/src/condensation/aggregation.ts` | Add `directVoteWins?: boolean` option to `computeClusterEvaluationFromRawEvals`. |
| `functions/src/index.ts` | Register the two new Firestore triggers. |
| Frontend | Render cluster statements (`integratedOptions.length > 0`) with member expander; "synthesized from your idea" toast on attach; collaboration-index UI works unchanged. |

**No changes to** `Statement` type definition. **No changes to** `polarizationIndex` collection schema. **No new statement types.**

---

## Failure & recovery plan

This system touches the live evaluation pipeline. We need every ship behind safety rails so a regression can be killed in seconds, not after a 4-hour incident.

### Feature flags (mandatory before any deploy)

Every new code path lives behind a Firebase Remote Config flag, **default OFF**. Reading the flag is sub-millisecond and cached per-instance.

| Flag | Default | Controls |
|---|---|---|
| `bulkClusterEnabled` | `false` | Ship 1 — bulk UMAP+HDBSCAN path. When `false`, `fn_synthesizeIdeas` falls back to today's `buildCandidateEdges`. |
| `twoTierJudgeEnabled` | `false` | Ship 1 — cosine-banded LLM verification. When `false`, falls back to all-pairs LLM judge. |
| `bayesianPrefilterEnabled` | `false` | Ship 1 — pre-filter. When `false`, uses today's hard-floor knobs only. |
| `asyncJobModeEnabled` | `false` | Ship 2 — async job decomposition. When `false`, callable runs synchronously end-to-end. |
| `liveSynthEnabled` | `false` | Ship 3 — **panic switch** for the three Firestore triggers. When `false`, triggers exit immediately at the top of their handler. Bootstrap path still works. |
| `clusterAwarePolarization` | `false` | Ship 3 — the cluster-walk extension in `evaluation/onCreate*.ts`. When `false`, polarization compute behaves exactly as today. |

A single env-var override `EMERGENCY_DISABLE_SYNTHESIS=true` flips ALL flags off without a deploy. Operator can flip Remote Config from the Firebase Console in <30s.

### Audit log (every transformative action)

A new `_synthAuditLog/{eventId}` collection records every live-synth mutation. Single document per event, never modified after write:

```
{ eventId, actor: 'liveSynth' | 'bootstrap' | 'admin', action: 'attach' | 'spawn' | 'unlink' | 'dissolve' | 'evalRecompute',
  clusterId, optionId?, prevState, newState, reason, triggerSource, timestamp }
```

Lets us reverse any specific bad action without a global rollback. 90-day TTL via Firestore.

### Pre-deploy checklist

Before merging each ship:
- [ ] All new code paths default-OFF in Remote Config.
- [ ] `npm run build && npm run lint && npm run typecheck` clean.
- [ ] New unit tests for the changed function pass.
- [ ] One canary question exists in the test environment with a known-good baseline (cluster count, group MAD values for a few clusters); compare new run output against baseline before flipping the flag in prod.
- [ ] Cloud Monitoring alert configured: function error rate > 5%, p95 latency > 2× baseline, OpenAI calls/hour > 2× baseline → page oncall.

### Per-ship rollback procedure

#### Ship 1 — bulk clustering produces bad output

**Symptom:** clusters look wrong (too many singletons, one giant blob, missing obvious matches), or wall-clock regressed.

**Action:**
1. Flip `bulkClusterEnabled = false` (or `twoTierJudgeEnabled = false` if the cluster shape is fine but verification looks wrong) in Remote Config. Effective in <60s.
2. Pipeline reverts to today's behavior — no data corruption, just slower.
3. Investigate offline using the canary question.
4. **If a synthesis run already ran with the bad code and wrote bad clusters:** use the existing `reverseIntegration.ts` primitive (already in repo) to dissolve those clusters and restore originals.

#### Ship 2 — async job stuck or corrupted mid-run

**Symptom:** a `synthesisJobs/{jobId}` doc has `status: 'in-progress'` for >30 min with no `lastHeartbeat` updates.

**Action:**
1. Heartbeat sweep should auto-recover within 5 min. If not:
2. Admin sets `cancelRequested: true` on the job doc. Phase functions exit at next chunk boundary.
3. After cancel, set `status: 'failed'`, write the error to `error` field. Job doc is read-only after that — provenance preserved.
4. Admin starts a new job. Pub/Sub messages from the dead job have idempotency keys so they no-op safely if delivered late.
5. **If clusters were partially written:** they have `synthesizedFrom: { jobId, partial: true }`. Admin UI shows them with a warning banner; admin can either keep, delete, or trigger a full re-run.

#### Ship 3 — live-synth triggers misbehaving

This is the highest-risk surface because it touches the live evaluation flow. Three failure modes, three responses:

**Mode A: bad attaches/spawns** (cluster created when it shouldn't be, or wrong member attached).

1. Flip `liveSynthEnabled = false` in Remote Config. Triggers exit immediately at handler entry. Effective in <60s.
2. Read `_synthAuditLog/` for the bad events, in time order.
3. Run `scripts/reverseLiveSynthEvent.ts <eventId>` — uses the audit log's `prevState` to undo. For an `attach`, removes the option from `integratedOptions`. For a `spawn`, calls existing `reverseIntegration.ts` to dissolve and restore originals.
4. Investigate root cause; fix; re-enable.

**Mode B: edit-invalidation false-positive** (Trigger 2 unlinked an option that wasn't actually meaning-changed).

1. Flip `liveSynthEnabled = false`.
2. From audit log, find the `unlink` events. Each one stored `prevState.clusterId` and `prevState.previousIntegratedOptions`.
3. Run the same `scripts/reverseLiveSynthEvent.ts` — re-attaches the option to the cluster.
4. Tighten the cosine-drift threshold from 0.05 to e.g. 0.10 before re-enabling.

**Mode C: cluster-aware polarization causes a feedback loop or wrong demographic math.**

1. Flip `clusterAwarePolarization = false` independently — leaves the rest of Ship 3 working but reverts polarization to today's "directly-evaluated statement only" behavior.
2. The existing per-statement polarization indexes are unaffected and still correct.
3. Cluster polarization indexes that were written with bad math: run `scripts/recomputePolarizationFor.ts <clusterId>` (uses the existing `updateUserDemographicEvaluation` with the corrected effective-vote computation).
4. **Important:** demographic data is never mutated by this system. Worst case is incorrect aggregate writes to `polarizationIndex/{clusterId}` — recoverable by recomputation.

### Cost-runaway protection

Independent of the feature flags, hard caps in code:

- `OPENAI_HOURLY_CAP = 5000` — checked in a counter doc `_costGuard/openai/{hourBucket}`. If exceeded, `embeddingService` and `judgeSemanticEquivalenceCached` throw a typed `CostCapExceededError`, log it, and skip. UI shows `verifiedBy: 'rate-limited'` for affected clusters.
- `ANTHROPIC_HOURLY_CAP = 200` — same pattern for `generateSynthesizedProposal`.
- Cloud Monitoring alert at 80% of either cap (paged), 100% (auto-disable via `EMERGENCY_DISABLE_SYNTHESIS=true`).

### Reconciliation jobs (drift correction)

Two scheduled functions catch silent drift:

| Function | Schedule | What |
|---|---|---|
| `fn_clusterAggregateReconcile` | nightly 03:00 me-west1 | For every cluster updated in last 24h, recompute `evaluation.{...}` from scratch using `computeClusterEvaluationFromRawEvals + fetchEvaluationsForIds`. If diff > 1% in any field, log to `_synthAuditLog/` as `reconcile-drift` and overwrite. |
| `fn_polarizationReconcile` | nightly 04:00 me-west1 | Same idea for `polarizationIndex/{clusterId}`. Recomputes per-group MAD from scratch. Logs deltas. |

Reconciliation drift over 5% pages oncall — indicates the live triggers are leaking math.

### Incident triage runbook

When something looks broken in synthesis, check in this order:

1. **Cloud Monitoring dashboard** — function error rate, p95 latency, OpenAI/Anthropic call counts. Anything spiking?
2. **`synthesisJobs` collection** — any jobs stuck in-progress >30 min? Any with `partialFailure: true`?
3. **`_synthAuditLog`** — sort by timestamp desc, look for unusual action patterns (e.g. burst of `dissolve` events).
4. **`_costGuard` counters** — has either OpenAI or Anthropic cap been hit?
5. **Remote Config flag values** — confirm they match expected state.
6. **Function logs** — filter `severity>=WARNING` AND `resource.labels.function_name=~"^(synthesi|fn_onOption|fn_clusterRecompute)"`. Look for repeated errors from the same function.

If unsure: flip `EMERGENCY_DISABLE_SYNTHESIS=true`. Synthesis stops; evaluation flow remains 100% intact (only the new cluster-walk extension is disabled, and `clusterAwarePolarization=false` keeps polarization working as today).

### What CANNOT break

These have to keep working even with all flags off:

- User submits an evaluation → `evaluations/{id}` doc written, `updateUserDemographicEvaluation` called for the directly-evaluated statement (today's behavior). **Always.**
- User submits an option → `statements/{id}` doc written. **Always.**
- Existing batch synthesis (without bulk-cluster path) still works as it does today.
- Existing polarization-index UI renders correctly for non-cluster statements.

The disable path is **additive removal** — flipping flags off subtracts new behavior, never breaks existing behavior.

---

## Risks (top 6)

| Risk | Mitigation |
|---|---|
| Bayesian filter cuts a high-quality minority opinion | UI shows filter rationale; admin can override threshold per run. |
| HDBSCAN-js memory blowup at 100k | Bootstrap runs hierarchical (Level-1 macro-clusters in Ship 3 if needed); load-test peak RSS. Fallback to existing `density-clustering` with auto-eps. |
| Two-tier judge false-merges when admin hits the 2000-call cap | `verifiedBy: 'cosine-only'` flag; admin must explicitly approve those clusters. |
| UX regression sync → async | Stream partial results from ~90s; progress bar; explicit "up to 10 min" copy. |
| Live-synth LLM cost runs away | Hard rules: act only on top-hit ≥ 0.92 (high precision); 60s per-parent debounce; gray band [0.85, 0.92) goes to admin review queue, not autonomous LLM. |
| Cluster-walk on every evaluation adds 1 extra Firestore query per vote | The `array-contains integratedOptions` query is indexed; ~5–20 ms cost. Negligible vs. the polarization compute itself. |
| `directVoteWins: true` changes aggregator semantics for callers that don't pass it | Default is `false`; condensation pipeline unaffected. Only the live-synth path passes `true`. |

---

## Verification

### Ship 1

1. `cd functions && npm run build && cd .. && npm run lint`.
2. `npm run seed:wizcol -- --count=764 --admin=<your-uid>` then trigger Synthesize from admin UI.
3. Expected: <50 INFO log lines/run (was ~45k). `bulkClusterByEmbedding.complete { N, clusterCount, durationMs }` shows `durationMs < 60000` for 764 options.
4. Wall-clock: <300s on emulator for 764 options.
5. Output cluster statements should have `integratedOptions` populated and a recomputed `evaluation.{...}` aggregate — same shape as today's pipeline produces.

### Ship 2

1. Trigger synthesis → callable returns `jobId` in <1s.
2. `synthesisJobs/{jobId}` doc streams through phases; `lastHeartbeat` updates every 30s max.
3. Kill function pod mid-phase → scheduled sweep re-publishes within 5 min.
4. Cancel mid-run → no further chunks process within 30s.

### Ship 3

1. **Live attach test:** create option A under a fresh question. Create option B with text very similar to A (cosine ≥ 0.92). Verify a cluster statement is auto-created within ~5s with `integratedOptions: [A.id, B.id]` and an LLM-generated text.
2. **Vote rollup test:** vote +1 on A. Within ~10s (one flusher cycle), cluster's `evaluation.{sumEvaluations, numberOfEvaluators, ...}` reflects it. Vote -0.5 on B. Cluster aggregate uses `(1 + -0.5) / 2 = 0.25` as that user's contribution. Vote +1 directly on cluster from a third user; verify they count once.
3. **Direct-wins test:** same user votes +1 on A then +0 directly on cluster. Their effective contribution to the cluster should be 0 (direct wins), not 0.5 (average).
4. **Edit invalidation test:** edit A's text to something semantically different. Within ~5s, A is removed from cluster.integratedOptions. If only one member left, cluster is auto-dissolved.
5. **Collaboration index test (the user's specific ask):**
   - Set up demographic questions on the question's `topParentId` (e.g. region, age bracket).
   - Have evaluators in different demographic groups vote on members A and B.
   - Verify `polarizationIndex/{cluster.id}` is created and updated within one flusher cycle, with `axes[].groups[]` showing per-group MAD breakdowns.
   - Confirm the existing collaboration-index UI renders the cluster correctly (X = avg group means, Y = `1 - |meanGroupA - meanGroupB|/2`).
6. **Bootstrap → live handoff:** seed 100k options. Run bootstrap (Ships 1+2). Should complete <8 min, first preview clusters in UI by ~90s. Then create one new similar option → live trigger attaches it within 5s.
7. **Cost guard:** create 50 borderline-similar options in 60s. Verify ≤1 LLM proposal call (debounce works), the rest land in `_liveSynthCandidates/` for admin review.

---

## Critical files

- `/Users/talyaron/Documents/Freedi-app/functions/src/fn_synthesizeIdeas.ts` *(splits in Ship 2)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/services/vector-search-service.ts` *(logging surgery in Ship 1)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/services/similarity-grouping-service.ts` *(replaced by `bulkCluster.ts` in Ship 1)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/condensation/aggregation.ts` *(extend `computeClusterEvaluationFromRawEvals` with `directVoteWins` option in Ship 1)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/services/topic-cluster/cluster.ts` *(reused — proven UMAP+DBSCAN primitive)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/services/embedding-cache-service.ts` *(reused for bulk vector loading + per-trigger embedding)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/services/verdict-cache-service.ts` *(reused inside `twoTierJudge` and Trigger 2 LLM diff)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/synthesis/completeLinkage.ts` *(reused — `refineComponent` handles 50–80% cluster splits)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/fn_polarizationIndex.ts` *(unchanged; called by extended evaluation triggers)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/evaluation/onCreateEvaluation.ts` *(extend in Ship 3 to walk to containing clusters)*
- `/Users/talyaron/Documents/Freedi-app/functions/src/evaluation/onUpdateEvaluation.ts` *(same extension)*
