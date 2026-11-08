# Claim Registry — Semantic Recall + Live-From-Start Clustering

> Full architecture: `docs/architecture/CLAIM_REGISTRY.md`

## Context

Two related weaknesses in the statement-similarity/clustering pipeline, plus one product benefit, all addressed by a single mechanism — a **per-question claim registry** (canonical labeling):

1. **Semantic recall gap (Procaccia's critique).** Embedding + LLM judging catches semantically close statements, but two statements can share the same meaning while sitting far apart in embedding space. The LLM judge (`semantic-equivalence-service.ts`) only sees pairs surfaced by cosine retrieval (top-10 above `reviewLowerBound` 0.45 in synthesis; 0.8 interactive), so those pairs are never judged. Silent recall failure in candidate generation.

2. **Cold-start / live clustering quality.** Real-time synth/clustering (`runSinglePipeline.ts`) works badly early: greedy order-sensitive decisions, cosine thresholds calibrated for mature-question density, medoids of 2 members are noise. Quality only arrives after expensive bulk re-clustering. Requirement: **clustering must be visible and good from statement #1, and keep updating.**

3. **Product benefit: "simple terms" explanations.** Each cluster's canonical claim doubles as a plain-language explanation of that solution, shown to the public from the moment statements arrive.

## Core Design

### Claim registry (classification, not generation)
- Every topic-cluster and synth carries a **canonicalClaim** (5–15 words, optimized for LLM classification) and a linked **publicExplanation** (1–2 plain-language sentences for citizens, regenerated on claim version bump). **Two fields.**
- New option arrives → cosine fast path unchanged (Passes 1–2, zero LLM calls). If no confident cosine attach → **one `gpt-4o-mini` classification call** against the claim codebook: "which existing claim does this express, or is it new?" Runs even when vector search returns zero candidates (that is exactly the recall-gap case).
- **Hierarchical staging** over the existing synth/topic-cluster hierarchy keeps prompts tiny.
- A registry match at low cosine = the Procaccia case — caught and **logged** (`{optionId, matchedClusterId, cosineAtMatch, method, verdict}`). The log measures the real gap and accumulates labeled pairs for a possible future embedding fine-tune (out of scope now).

### Opt-in per question (admin toggle, default OFF)
- New setting `claimRegistryEnabled` on the question's synthesis settings (`loadSynthesisSettings.ts` / `types.ts`), **default `false`** — most statements don't need clustering.
- Admin turns it ON in question settings → triggers a **first run**: claim backfill for existing clusters + catch-up enqueue of unclustered options through the existing synthesis queue (pattern of `fn_synthesizeNow.ts`).
- After the first run completes, the live pipeline takes over for new arrivals.
- Toggle OFF → registry/consolidation passes stop; existing claims/explanations remain stored. Toggle ON again → incremental catch-up (idempotent), then live mode resumes.

### Live-from-start with continuous consolidation
- **Claim-per-statement at the start**: every early statement immediately spawns a *provisional* claim with a public explanation — users see clustering from statement #1.
- **Young-question mode**: below ~25 statements, route everything through registry classification (LLM meaning-judgment is calibration-free; cosine bands are meaningless at low density).
- **Continuous consolidation pass**: every ~15 new statements (or on cohesion drop), one LLM call reads ALL claims and proposes merge/split/keep. Merges auto-apply (membership transfers transitively); split proposals go to the admin review queue in v1.
- **Claim lifecycle**: `provisional` → `confirmed` (after ≥3 members + surviving one consolidation pass).

### Claim mutation protocol (what happens when a canonical changes)
Claims are **versioned**. On any text change, one LLM call classifies the change (old vs new):

| Change | Member re-check? |
|---|---|
| Reword (same meaning) | No — version bump only |
| Broaden | No — members express special cases, still valid |
| Narrow / meaning shift | **Yes** — one batched call per cluster: new claim + member briefs (5–15 words each) → "which still express it?" |
| Merge (X ≡ Y) | No — membership transfers transitively |
| Split | Partial — re-classify members against daughter claims only |

- Detached statements **auto-reprocess**: re-enter the pipeline as new arrivals (match another claim or spawn provisional). Fully automatic, no admin queue.
- Statement→claim edge stores `claimVersion`, attach method (`cosine`/`registry`), confidence.
- publicExplanation regenerates on claim version bump.
- Opposite-meaning guard: classification prompt must distinguish *expresses* vs *opposes* (same taxonomy as `semantic-equivalence-service.ts`).

## Implementation Phases

### Phase 0 — Setting, canonical claims + measurement
- Add `claimRegistryEnabled` (default `false`) to synthesis settings + admin UI toggle in question settings.
- Add `canonicalClaim`, `publicExplanation`, `claimVersion`, `claimStatus` (provisional/confirmed) fields on cluster docs (extra-field pattern, same as the `synthesis` settings block).
- **First-run function**: admin toggles ON → backfill claims + enqueue existing statements (pattern of `fn_synthesizeNow.ts`); incremental catch-up on re-enable.
- Structured decision logging (registry vs cosine, cosineAtMatch).

### Phase 1 — Registry classification in the live pipeline
- New `functions/src/services/claim-registry-service.ts`: `loadClaims(questionId)`, `classifyAgainstClaims(text, claims)` (gpt-4o-mini, JSON mode, temp 0), `classifyClaimChange(old, new)`, `revalidateMembers(claim, briefs)`.
- Hook into `runSinglePipeline.ts` between Pass 2 and Pass 3 (and on the zero-candidate path); young-question mode (<~25 statements → registry-primary).
- Claim + explanation stamped at spawn from the already-generated synth title / topic label — no extra LLM call.

### Phase 2 — Continuous consolidation + mutation protocol
- Consolidation trigger (every N statements): claim-level merge/split proposal call; merges auto-apply via cluster ops; splits → review queue; provisional→confirmed transitions.
- Claim-change classifier + batched member re-validation + auto-reprocess of detached statements.

### Phase 3 — Interactive flow
- `fn_findSimilarStatements_optimized.ts`: paraphrase expansion (embed 2–3 LLM paraphrases of user input, max similarity per candidate).

### Phase 4 (conditional, later) — Embedding fine-tune from accumulated registry-caught pairs. Out of scope.

## Cost / Effort

- Running: ≤1 mini call per statement not attached by cosine (~$1–2 / 1,000 statements); consolidation ~1 call per ~15 statements; re-validation 1 batched call per changed cluster.
- Effort: Phase 0+1 ≈ 3–5 days; Phase 2 ≈ 3–4 days; Phase 3 ≈ 1 day. No new infra, no re-embedding, Hebrew/Arabic free via LLM.

## Verification

- Unit tests for claim-registry-service (mock LLM: staging, null match, change taxonomy, batched revalidation).
- Toggle behavior: default OFF → pipeline behaves exactly as today (zero registry calls); toggle ON over a question with existing statements → first run builds codebook; toggle OFF/ON → incremental catch-up.
- Emulator: seed a question from empty with the flag ON; verify claim-per-statement from #1, provisional merges during consolidation, and that curated far-apart paraphrase pairs (Hebrew + English) attach via `method: 'registry'` with low `cosineAtMatch`.
- Claim-change: reword → no member churn; narrow → detached members auto-reprocess into correct destinations.
- Regression: mature-question flows (Passes 1–5) unchanged when registry finds no match; no increase in wrong-attach rate.
