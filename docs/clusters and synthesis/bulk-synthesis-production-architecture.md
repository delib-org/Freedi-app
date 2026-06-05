# Bulk Synthesis on Production — Architecture Design

**Status:** Design (no code yet) · **Date:** 2026-06-05
**Authors:** Tal Yaron · Claude (system-architect agent)
**Companion docs:** `clustering-and-synthesis-paper.md`, `synthesis-production-hardening-plan.md`

---

## Implementation status (2026-06-05)

**Landed (functions/, tested — 200 synthesis tests pass, tsc + lint clean):**
- **Pillar 1 — candidate geometry.** `src/synthesis/candidateClusters.ts`
  (`buildCandidateClusters` = `buildCandidateEdges` ANN cosine ≥ τ + `UnionFind`
  components). Swapped into all three bulk paths: `asyncJob/phases.ts`
  `runClusteringPhase`, `fn_synthesizeIdeas.ts` (sync callable),
  `fn_synthesisBulkFlush.ts` (scheduled sweep). Threshold via
  `SYNTHESIS_CANDIDATE_THRESHOLD` (default 0.92), logged per run.
- **Pillar 2 (partial) — idempotent clean-rebuild.** `src/synthesis/derivedDocs.ts`
  (`isDerived` inclusive classifier + `dissolveQuestionSynthesis`, reusing
  `reverseIntegration` for proper clusters and restoring orphans). Wired into the
  async loading phase so every async bulk run cleans before rebuilding.
- **Pillar 2 (partial) — dedup.** `spawnClusterFromPair` skips when a visible
  cluster already contains either member (fixes the duplicate-synth bug).

**Pending:**
- `synthesisRunId`/`synthesisMechanism` tagging (needs the shared-types/delib-npm
  change + rebuild) and non-optional `derivedByPipeline`.
- Wire `dissolveQuestionSynthesis` into the synchronous execute path
  (`fn_synthesizeIdeas` execute) — only the async job self-cleans today.
- Shadow mode (`_bulkSynthProposals/{runId}`).
- Hard-enforce the no-orphan invariant at the hide write site (currently upheld
  by `performIntegration` co-setting hide+`integratedInto` and by dissolve
  restoring orphans).

---

## 1. Problem

Running the **bulk** synthesis path on a real production question (`hwEoIYX2tYHJ`,
wizcol-app, 252 Hebrew options) produced visible chaos: giant over-merged
buckets, 1-member "synths", empty topic headers, duplicate synths, and 26 user
options hidden with no recovery link. Diagnosis showed **two independent causes**:

1. **Wrong candidate geometry.** The bulk path forms candidate clusters with
   `bulkClusterByEmbedding` (in-memory **UMAP→DBSCAN**, `functions/src/synthesis/bulkCluster.ts`).
   UMAP projects the 1536-d embeddings to ~5-D and pulls everything onto a
   connected manifold, so DBSCAN returns **a few big blobs with zero singletons
   at every `eps`** (measured: eps 1.0→1 cluster; 0.45→7 clusters/0 noise;
   0.1→3 clusters of 133/60/59/0 noise). Real deliberation is the opposite
   shape: mostly distinct ideas with a few paraphrase clusters.

2. **No operational hygiene.** No run identity; cleanup only finds
   `derivedByPipeline`-tagged docs (78 legacy untagged outputs accumulated);
   options hidden without `integratedInto` orphaned; stale membership caused
   double-counting; duplicate synths from the live spawn firing twice.

## 2. Empirical ground truth (drives the design)

Raw-cosine connected components on the same 252 options (bypassing UMAP):

| cosine threshold | options in clusters | singletons | note |
|---|---|---|---|
| ≥0.95 | 9 | 243 | very confident dupes only |
| **≥0.92** | **22 (5 clusters)** | **230** | the live path's attach gate — clean |
| ≥0.90 | 47 | 205 | a 29-member chained blob appears |
| ≥0.88 | 101 | 151 | 74-member blob |
| ≥0.85 | 180 | 72 | 172-member runaway chain |

Feeding the **cosine-≥0.92 candidates to the existing `twoTierJudge`** returned
**3 genuine synths + 245 options left standalone** (15 LLM calls, ~22s); it
correctly **dropped** a 13-member blob of short generic texts and **split**
"inside" vs "outside polling stations." **The judge is correct; the candidate
generator is the defect.** Conclusion: the bulk path must generate candidates
the way the *live* path already does — by ANN cosine threshold, not UMAP.

## 3. Key insight — the fix is mostly already in the repo

Every primitive the redesign needs already exists and runs in production on the
**live** path; the bulk async pipeline simply doesn't call them:

| Need | Existing primitive | Location |
|---|---|---|
| ANN cosine-threshold candidate edges | `buildCandidateEdges` (threshold default 0.90, top-K=20, canonical edges, bounded concurrency) | `functions/src/services/similarity-grouping-service.ts:46` |
| Connected components from edges | `UnionFind` (tested) | `functions/src/utils/unionFind.ts` |
| Verified split (cosine bands + LLM + quorum complete-linkage) | `twoTierJudge` + `refineComponent` | `functions/src/synthesis/twoTierJudge.ts`, `completeLinkage.ts` |
| Edges→union-find→judge already wired | legacy `fn_synthesizeIdeas.ts` "Phase 5" | `functions/src/fn_synthesizeIdeas.ts:623` |

So the core change is a **one-phase swap**, not a rewrite.

## 4. Core redesign — candidate generation

In the async bulk pipeline (`functions/src/synthesis/asyncJob/phases.ts`),
`runClusteringPhase` (line 194) currently calls `bulkClusterByEmbedding(items)`
(line 237). Replace that body with:

```
candidateIds → buildCandidateEdges(candidateIds, { parentId, threshold: τ, k })
            → UnionFind over the returned edges
            → connected components of size ≥ 2 = candidate clusters
            → write candidates in the SAME shape runVerifyingPhase already consumes
```

`runVerifyingPhase` (`twoTierJudge`, line 274/330) and `runProposingPhase`
(line 380) are **unchanged** — they already consume `{clusterId, memberIds}`
candidates. Properties this gives us, validated by §2:

- **Singletons are preserved** (an option with no ≥τ neighbour is simply not in
  any component) — the ~90% distinct ideas are left alone instead of forced into
  buckets.
- **No UMAP non-determinism / seed dependence** in candidate formation.
- **Chaining is bounded** by the judge: union-find at τ can still over-link
  (the 29-blob at 0.90), but `twoTierJudge` + quorum `refineComponent` splits or
  drops it (proven in §2). Choose τ on the high side (0.92) so the judge starts
  from tight components.

**UMAP/DBSCAN is demoted to topic-level grouping only** (grouping verified
synths into themes), where coarse blobs are acceptable — or removed from the
synth path entirely. `bulkClusterByEmbedding` stays for that diagnostic/topic use.

**Scale.** `buildCandidateEdges` is ANN (Firestore vector search), bounded
concurrency (`ANN_CONCURRENCY`), ~candidates/concurrency round-trips — designed
for ≤500 and extends with chunking. This fits the async phase model (≤300s)
better than holding a full UMAP embedding matrix in memory.

## 5. Data model — identity, tagging, invariants

Add to the derived-doc schema (in `delib-npm`/`@freedi/shared-types`, since the
triggers and scripts all consume it):

- `derivedByPipeline: 'synthesis' | 'topic-cluster'` — make **non-optional** in
  every write path; no code path may create a cluster without it.
- `synthesisRunId: string` — UUID per bulk run / per live-trigger batch. Enables
  delete-exactly-one-run and provenance.
- `synthesisMechanism: 'bulk' | 'live-spawn' | 'live-attach'` — supersedes the
  inconsistent `liveSynthOrigin`.

**Three write sites** to enforce tagging: the bulk committing phase (new, §6),
`fn_onOptionCreateLive`, `fn_onOptionUpdateLive`.

**Reversibility invariant:** an option may be hidden **only** together with a
valid `integratedInto` pointing at an existing cluster. Enforce at the write
site (`performIntegration`, which already sets the `hide` + `integratedInto`
overlay). Add a single `dissolveCluster(clusterId)` that deletes/archives the
cluster **and un-hides its members in the same batch** — the only sanctioned way
to remove a cluster. No orphans by construction.

## 6. Idempotent clean-then-rebuild

Promote the inclusive classifier (prototyped in
`functions/scripts/cleanupProdSynthesisArtifacts.ts`) to a shared module
`functions/src/synthesis/derivedDocs.ts`:

```
isDerived(doc) = nonEmpty(integratedOptions) || isCluster===true
              || !!derivedByPipeline || !!synthesisMechanism
```

This catches **legacy untagged** docs that `derivedByPipeline`-only cleanup
misses. Add two async phases around the existing flow so a re-run is
self-cleaning and stays inside Functions limits:

```
loading → cleaning → clustering → verifying → proposing → committing
```

- **cleaning**: `dissolveCluster` every existing derived doc under the question
  (inclusive match), restoring member visibility. Idempotent.
- **committing**: write the new synths with full tagging (`synthesisRunId`,
  `derivedByPipeline`, `synthesisMechanism: 'bulk'`) and apply the hide overlay
  atomically. (Open question: continuation-chunk above ~100 clusters to stay
  <300s.)

Result: **run bulk synth twice → second run dissolves the first's output, then
rebuilds. No accumulation, ever.**

## 7. Dedup, shadow mode, rollout

- **Dedup:** before the live spawn (or bulk commit) creates a synth for a member
  set, check for an existing synth whose members overlap ≥ threshold and attach
  instead of spawning. Kills the duplicate-pair synths seen in prod.
- **Shadow mode:** a `--shadow` / flag path that writes proposed groupings to a
  **review collection** `_bulkSynthProposals/{runId}` (mirroring the live path's
  `_liveSynthCandidates/`) instead of the live options collection — never hides
  members, never surfaces synths. This is the safe "test on real data" path:
  run on a real question, human-audit, then promote.
- **Rollout:** reuse the existing env-flag model + `EMERGENCY_DISABLE_SYNTHESIS_FLAGS`
  panic switch (`functions/src/synthesis/featureFlags.ts`); add per-question
  enablement. **Record the chosen τ and judge bands per run** in the run doc —
  thresholds are corpus-dependent and must never be silently tuned.

## 8. Migration of existing mess

Legacy untagged derived docs already in prod are handled by the inclusive
classifier: run `cleanupProdSynthesisArtifacts.ts` (already built, dry-run →
review → execute; hides reversibly) per affected question, or backfill
`derivedByPipeline`/`synthesisRunId='legacy'` so future cleaning phases catch
them. The affected question `hwEoIYX2tYHJ` is already repaired (95 derived docs
hidden `archivedByCleanup=true`, 26 options restored).

## 9. Files to change

- `functions/src/synthesis/asyncJob/phases.ts` — swap `runClusteringPhase` body
  (buildCandidateEdges + UnionFind); add `runCleaningPhase`, `runCommittingPhase`.
- `functions/src/synthesis/derivedDocs.ts` (new) — shared `isDerived`,
  `dissolveCluster`, tagging helpers.
- `functions/src/fn_onOptionCreateLive.ts` / `fn_onOptionUpdateLive.ts` — tagging
  + dedup + reversibility invariant.
- `packages/shared-types` (`delib-npm`) — `synthesisRunId`, `synthesisMechanism`,
  tighten `derivedByPipeline`.
- `functions/src/synthesis/bulkCluster.ts` — relegate to topic-level only.
- `functions/scripts/bulkRebuild.ts` — use the new candidate path; add `--shadow`.

## 10. Verification

- Unit: cluster writers always set `derivedByPipeline` + `synthesisRunId`;
  hiding without `integratedInto` is rejected; `dissolveCluster` un-hides members.
- Component: `buildCandidateEdges`+UnionFind on the 252-snapshot reproduces the
  §2 cosine structure (5 components at 0.92, ~230 singletons).
- E2E idempotency: run bulk synth ×2 on the emulator snapshot → identical derived
  doc count, zero orphans, zero duplicates (assert before/after).
- Shadow: a shadow run writes only to `_bulkSynthProposals/`; options collection
  unchanged.
- Regression: the negation/tight validation corpora still pass through the new
  candidate path.

## 11. Open questions

1. **`committing` chunking** above ~100 clusters — continuation token vs single
   pass within 300s.
2. **τ=0.92 cross-language portability** — validate on Hebrew/Arabic/English via
   the shadow sweep rather than assuming the English-tuned threshold transfers.
3. Whether to keep `bulkClusterByEmbedding` for topic grouping or replace topic
   grouping too (the paper flags topic-level grouping as unproven for close
   sub-topics).
