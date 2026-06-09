# Synthesis — Production Hardening Plan

**Context.** A live question (`hwEoIYX2tYHJ`, wizcol-app, 252 real options) was
run through synthesis multiple times over a month with no cleanup discipline.
The result was visible chaos: **95 leftover synthesis-output docs** from 3–4
separate runs accumulated in the options collection alongside the 252 real
options. Root problems, in order of severity:

1. **No run identity / no cleanup between runs.** Outputs from 2026-04-21,
   2026-05-03, and the live-synth spawns of 2026-05-17/18 all coexist. The bulk
   re-runner only deletes docs tagged `derivedByPipeline`, so older/legacy
   outputs are invisible to cleanup and pile up.
2. **Derived docs are not reliably tagged.** 78 of the 95 leftover docs carry
   **no `derivedByPipeline`** field, so they are programmatically
   indistinguishable from real user options. Cleanup, analytics, and the UI all
   mis-classify them (they even count as "raw options").
3. **Orphaned hidden options.** 26 real user options were hidden with no
   `integratedInto` link — their cluster was later deleted, so they vanished
   from the UI with no recovery path. Hiding is not reversible-by-construction.
4. **Stale membership / double-counting.** Cluster docs reference members that
   are still visible as standalone options, so users voted on both → distorted
   aggregates.
5. **Parameters not tuned for large, diverse corpora.** The 2026-05-03 bulk run
   simultaneously **over-merged** (a 40-member bucket) and **over-fragmented**
   (40 single-member "synths"), the classic mis-`eps`/threshold signature on
   N≈250 real input — the corpus-realism failure mode the validation campaign
   documented, here unmitigated.
6. **Duplicate synths.** The live spawn path produced two identical synths for
   the same near-identical pair (fired twice).

This plan makes synthesis **identifiable, reversible, cleanable, and safe to
re-run** before it is enabled on any live question again.

---

## Fix 1 — Run identity + mandatory tagging (highest priority)

Every doc the pipeline creates MUST carry, at write time:

- `derivedByPipeline: 'synthesis' | 'topic-cluster'` (already exists — make it
  non-optional in the write path; no code path may create a cluster without it).
- `synthesisRunId: string` — a UUID minted per bulk run / per live trigger
  batch. Lets us delete *exactly* one run's output and trace provenance.
- `synthesisMechanism: 'bulk' | 'live-spawn' | 'live-attach'` — which path made
  it (the current `liveSynthOrigin` is inconsistent / often absent).

**Files:** `functions/src/synthesis/bulkCluster.ts` and the live triggers
(`fn_onOptionCreateLive` / `fn_onOptionUpdateLive`), plus the bulk writer in
`scripts/bulkRebuild.ts`. Add the fields where the cluster doc object is built
(see the `db.collection('statements').doc(clusterId).set({...})` block in
`bulkRebuild.ts`).

## Fix 2 — Cleanup must find legacy/untagged outputs

The "delete prior derived docs before re-running" step must match on the same
inclusive heuristic the repair tool uses — a doc is synthesis output iff it has
**any** of: non-empty `integratedOptions`, `isCluster === true`,
`derivedByPipeline`, or `synthesisMechanism`/`liveSynthOrigin`. Tagging (Fix 1)
makes this exact going forward; the heuristic covers the legacy backlog.

**Reuse:** the classifier in
`functions/scripts/cleanupProdSynthesisArtifacts.ts` (`isDerived`) — promote it
to a shared helper so the runner and the repair tool agree.

## Fix 3 — Reversible-by-construction membership (no orphans)

- An option may be hidden **only** together with a valid `integratedInto`
  pointing at an existing cluster — enforce as an invariant at the write site.
- When a cluster is deleted/dissolved, **un-hide its members** in the same batch
  (the live path already auto-dissolves singletons; extend it to restore member
  visibility). Prefer an overlay (`integratedInto` + `hide`) that is always
  undone on dissolve over destructive edits.

## Fix 4 — Idempotent / deduped synths

- Before the live spawn path creates a synth for a pair, check for an existing
  synth covering the same member set (or overlapping ≥ threshold) and attach
  instead of spawning. Prevents the duplicate-pair synths seen here.
- Bulk runs are naturally idempotent once Fix 1+2 land (delete-by-run then
  rewrite).

## Fix 5 — Parameter discipline for large corpora

- Do **not** ship a single default `eps`/threshold. The validation campaign
  found the recovery window is narrow and corpus-dependent; on N≈250 the
  2026-05-03 settings produced both 40-member buckets and 40 singletons.
- Before enabling on a question, run the **shadow audit** (below) across an
  `eps` sweep and pick by measured purity/coverage, recording the choice — never
  silently tuned. Reuse `scripts/verifyFromEmbeddings.ts` for the deterministic
  clustering sweep offline.
- Carry forward the quorum-tolerant linkage fix (`1ee58ecd5`) which is already
  in the judge.

## Fix 6 — Shadow mode before canary (process, not code)

Add a `--shadow` mode to the bulk runner that writes proposed groupings to a
**separate review collection** (mirroring the existing `_liveSynthCandidates/`
pattern) instead of the live options collection — never hiding members, never
surfacing synths. This is the safe "test on real data" path: run on a real
question, human-audit the proposals, then promote only if the numbers hold.

---

## Sequencing

1. **Repair** the affected question(s) with
   `scripts/cleanupProdSynthesisArtifacts.ts` (dry-run → review → execute).
2. Land **Fix 1–4** (tagging, cleanup, no-orphan invariant, dedup) — these are
   correctness/safety and unblock controllable re-runs.
3. Land **Fix 6** (shadow mode) and **Fix 5** (parameter sweep discipline).
4. Re-run the **shadow audit** on a sample of real questions; only then consider
   re-enabling live synthesis behind the existing env flags + panic switch.

## Verification

- Unit: cluster writers always set `derivedByPipeline` + `synthesisRunId`
  (assert in `bulkCluster`/trigger tests).
- Invariant test: hiding an option without `integratedInto` is rejected;
  deleting a cluster un-hides its members.
- Dedup test: spawning a synth for an already-covered pair attaches instead.
- E2E: shadow run on a real question writes only to the review collection;
  options collection unchanged (assert counts before/after).
- Repair tool: dry-run counts match `inspectProdSynthesis.ts`; post-execute the
  options tab shows only real options + intended synths.
