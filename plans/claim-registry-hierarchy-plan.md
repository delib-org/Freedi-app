# Claim Registry — Hierarchy Plan

**Goal:** extend the claim registry from a flat per-question codebook to a two-level claim hierarchy (topic-level claims → specific claims), so classification stays accurate and cheap as codebooks grow past ~50–100 claims, and so the codebook itself becomes a navigable structure for synthesis and admins.

**Status (2026-07-16):**
- Phase 0 SHIPPED + verified (`f403bf05a`): B2 70.1% → B2E 87.4%; codebook any-attach 74.4% → 92.9%.
- Phase 0b SHIPPED + verified (`273b341fd`): stance-caution prompt line halved codebook false merges (19.3% → **10.3%**, p ≈ 1.3e-4 — back to pre-enrichment baseline) at −3.1pp recall; single-claim 88.6% / 3.8% false-attach. Combined 0+0b: recall gained without net precision cost.
- Phase 1 SHIPPED (`273b341fd`): hierarchy fields + `isAttachTarget` invariant wired (no-op until topics exist).
- Phase 2 SHIPPED (`09be6876e`): `classifyHierarchical` two-hop + flat fallback, wired into `runRegistryPass`, decision-log method/routedTopicIds, 7 unit tests. DORMANT in production (no topic claims exist until Phase 3). Full-scale CH benchmark verification pending OpenAI daily request quota reset (10k RPD exhausted by 2026-07-16 benchmark runs) — run `LLM_CONCURRENCY=4 npx tsx run-registry-hierarchical.ts` then `analyze.ts`; gates: within 2pp of CE2 strict, fallback < 15%, mean candidates < 40% of codebook.
- Phases 3–4 not started.

**Evidence base:** the 2026-07-16 hard-triplet benchmark (`scientific-research/20206-07-16-Claim-regestry/TEST_REPORT.md`):
- Registry classifier vs raw statements: 95.0% triplet accuracy; vs `generateClaim` canonicals: 70.1% → **the −25pp canonicalization loss is the biggest known defect** (§5.3).
- 94-claim flat codebooks cost only ~5pp of attach recall, but prompts grow to ~2k tokens (~$0.41/1k statements vs $0.11 at small codebooks) and position bias risk grows with list length (§5.5).
- Gated retrieval (A2) showed routing risk is real in principle: anything that hides the right claim from the judge caps recall. Any hierarchy hop must therefore have a fallback.

---

## Phase 0 — Claim-text enrichment (prerequisite, ships alone)

**Problem:** `classifyAgainstClaims` renders each codebook entry as the bare 5–15-word `canonicalClaim`. Compression shifts propositions; the judge faithfully misjudges against shifted text (−25pp).

**Change:** in `functions/src/services/claim-registry-service.ts`, render each codebook line as:

```
<n>. <canonicalClaim> — <publicExplanation> (e.g.: "<exemplar member brief>")
```

- Exemplar = the brief of the claim's anchor member (`claimAnchorText` exists already; fall back to first `integratedOptions` member's brief). No new storage needed for v1.
- Token cost: ~3× per line (still ~60 tokens/claim). At 100 claims ≈ 6k-token prompts — acceptable for flat mode, and Phase 2 shrinks it again.
- Apply the same enrichment to `CONSOLIDATE_SYSTEM`'s claim list (consolidation suffers the same information loss).

**Verify:** re-run benchmark conditions B2 and C (`benchmark/run-registry-single.ts --generated-claims`, `run-registry-codebook.ts` — the harness needs a small flag to include explanation/exemplar in the seeded `ClusterClaim`s). Success = B2 recovers to ≥ 90%; C's "match → any claim" ≥ 85%.

## Phase 1 — Hierarchy data model (no behavior change)

Same pattern as the existing claim fields — extra typed fields on cluster `Statement` docs, read through helpers, no shared-schema change:

- `parentClaimId: string | null` — the topic-level claim this claim sits under (null = root/uncategorized).
- `claimLevel: 'topic' | 'specific'` — topic claims are NOT attach targets; statements only ever attach to specific claims. Topic clusters (`derivedByPipeline: 'topic-cluster'`) map naturally to `'topic'`; synth clusters to `'specific'`.
- `childClaimIds: string[]` on topic claims (denormalized for one-read codebook loading).
- Extend `ClusterClaim`, `readClaimFields`, `claimFieldsForSpawn` in `claim-registry-service.ts`; extend `loadClaims` to return the tree (flat array + parent pointers — keep the array shape so all existing call sites keep working).
- Backfill: none needed — all existing claims get `claimLevel: 'specific'`, `parentClaimId: null`. The hierarchy grows organically (Phase 3).

## Phase 2 — Two-hop classification with flat fallback

New function `classifyHierarchical` in `claim-registry-service.ts`; `runRegistryPass` switches to it when the question's codebook exceeds a threshold (`HIERARCHY_MIN_CLAIMS ≈ 30`; below that, flat classification is already cheap and accurate — don't add a hop).

**Hop 1 (topic routing):** classify the statement against topic-level claims only (≤ ~10 lines). Output: topic id(s) or `none`. Ask for the top TWO plausible topics, not one — cheap insurance against boundary statements.

**Hop 2 (specific):** classify against the union of the chosen topics' children (+ any root-level specifics), enriched per Phase 0. Same `expresses/opposes/none` contract, same 0.6 confidence floor, same opposes-edge recording.

**Fallback (the A2 lesson — non-negotiable):** if hop 1 says `none`, or hop 2 says `none`, run one flat classification over the full codebook before concluding "new claim". Routing must never be able to hide the right claim; it may only save tokens on the common path. Log which path decided (`RegistryDecision.method: 'registry' | 'registry-hier' | 'registry-fallback'`) — the fallback-hit rate is the live measure of routing quality, in the same self-audit spirit as the existing merge counters.

Cost check: two ~500-token hops ≈ 1k tokens vs 6k flat-enriched at 100 claims; fallback fires only on the "new claim" path, which is exactly where a second look is cheapest to justify.

## Phase 3 — Hierarchy growth via consolidation (no new authoring surface)

Topic claims are never generated top-down; they are born from the two signals consolidation already produces:

1. **Too-broad split:** when consolidation flags a claim as too broad and the (existing) review queue approves a split, the broad claim becomes a `topic` claim and the split parts its `specific` children — instead of today's flat replacement.
2. **Crowding:** when a question's specific-claim count crosses ~30 with no topics yet, add a consolidation step that proposes a topic grouping (one LLM call over the enriched codebook: "group these claims into 3–8 topics; write a 5–15-word topic claim per group"). Route the proposal through the same `_liveSynthCandidates` admin-review path as merges/splits — admins approve structure, consistent with the existing mutation protocol.
3. **Topic mutation rules:** topic claim text changes follow the existing `classifyClaimChange` protocol; a `narrow`/`different` change on a topic triggers re-routing validation of its children (which claims still belong under it) — the exact analogue of `revalidateMembers` one level up.

## Phase 4 — Hierarchy self-audit + surfacing

- **Structural audit (sampled, detached, like the model audit):** for ~5% of attaches, ask the audit model "is claim X a narrowing of its parent topic Y?" Persist (dis)agreement to the decisions collection. Broken edges accumulate evidence instead of silently misrouting.
- **Roll-up:** `counterStatementIds` and member counts aggregate to the topic level (computed at read time in synthesis — no new writes), giving synthesis per-topic pro/con structure.
- **Admin UI (SynthesisPanel):** render the codebook as a two-level tree with member counts; approve/reject topic proposals from the review queue. Read-only in v1 beyond approve/reject.

## Verification plan

1. Unit tests per phase in `functions/src/__tests__/` (routing fallback behavior, split-creates-parent, re-routing on topic narrow — mirror the existing `claim-registry-service.test.ts` / `claim-mutation-ratchet.test.ts` style, mocked `callLLM`).
2. Benchmark harness gains a `--hierarchical` mode for condition C: build per-dataset codebooks WITH a topic layer (grouping call), run two-hop vs flat on the same 875 triplets. Success gates: two-hop ≥ flat-enriched accuracy − 2pp; fallback rate < 15%; mean tokens/decision < 40% of flat-enriched.
3. Emulator end-to-end: enable registry on a seeded question with 40+ options, verify topic proposal → approval → two-hop attaches → decision log paths.

## Sequencing & effort

| Phase | Depends on | Size |
|---|---|---|
| 0 — enrichment | — | S (prompt change + benchmark re-run) |
| 1 — data model | 0 | S |
| 2 — two-hop + fallback | 1 | M |
| 3 — growth via consolidation | 2 | M |
| 4 — audit + UI | 3 | M |

Phase 0 should ship immediately (it fixes the benchmark's main finding). Phases 1–2 only pay off for questions with large codebooks; gate the rollout on the same per-question `claimRegistryEnabled` flag plus the claim-count threshold, so small questions never take the extra hop.
