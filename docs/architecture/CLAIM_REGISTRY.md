# Claim Registry — Canonical Labeling for Clustering & Semantic Recall

**Status:** In development (branch `feat/claim-registry`)
**Plan:** `plans/claim-registry-plan.md`
**Owner systems:** `functions/src/synthesis/` (pipeline), `functions/src/services/claim-registry-service.ts`

---

## 1. The Problems This Solves

### 1.1 The semantic recall gap (Procaccia's critique)

The synthesis pipeline finds similar statements by embedding them
(`text-embedding-3-small`, 1536-dim) and comparing cosine distance, then using an
LLM to judge candidate pairs. This works when statements are semantically close in
embedding space. But two statements can express the **same meaning with completely
different vocabulary, framing, and structure** — and then their embeddings sit far
apart.

The LLM equivalence judge (`semantic-equivalence-service.ts`) is good at deciding
same / related / different / opposite — but it **only sees pairs that cosine
retrieval already surfaced** (top-10 neighbors above `reviewLowerBound` 0.45 in the
synthesis pipeline; 0.8 in the interactive find-similar flow). If cosine never
surfaces the pair, the judge is never asked. The miss is silent.

> **The failure is a recall problem in candidate generation, not a judgment
> problem.** No amount of threshold tuning fixes it: lowering thresholds below
> ~0.45 explodes the candidate set into noise and multiplies LLM verification cost.

### 1.2 The cold-start problem (live clustering quality)

Real-time synth/clustering (`runSinglePipeline.ts`) is weak early in a question's
life, for three compounding reasons:

1. **Greedy, order-sensitive decisions.** The pipeline decides attach/spawn per
   arriving option, irreversibly, based on whatever exists at that moment. Early
   mistakes anchor everything after (rich-get-richer).
2. **Cosine thresholds are density-calibrated.** `attachThreshold` 0.85,
   `synthLowerBound` 0.78, etc. are tuned for similarity distributions of *mature*
   questions. With 5 statements the geometry is too sparse for the bands to mean
   anything.
3. **Early cluster representatives are noise.** A medoid or centroid of 2 members
   barely represents anything, yet it anchors every subsequent attach decision.

Today quality only arrives after an expensive bulk re-cluster
(`fn_globalCluster.ts` / UMAP+DBSCAN bulk flush) that runs rarely. Product
requirement: **clustering must be visible and good from statement #1, and keep
updating.**

### 1.3 The product opportunity: "simple terms" explanations

Every cluster's canonical claim doubles as a **plain-language explanation of that
solution for the public**, available from the moment statements arrive.

---

## 2. Core Design

### 2.1 Canonicalization as classification, not generation

The naive fix — have an LLM generate a "simple meaning" sentence per statement and
compare those — fails because generation is unstable: two same-meaning statements
can receive two different canonical sentences across calls, recreating the problem
one level up.

Instead, the registry makes canonicalization a **classification task against a
shared, growing codebook**:

- Every cluster (synth or topic-cluster) carries a **`canonicalClaim`** — 5–15
  words stating its core idea — plus a **`publicExplanation`** (1–2 plain-language
  sentences for citizens).
- When a new option arrives and the cosine fast path does **not** produce a
  confident attach, we make **one `gpt-4o-mini` call** that sees the complete list
  of canonical claims for the question and answers: *"Which existing claim does
  this statement express — or is it new?"*

Because claims are short, the LLM reads **all** of them — classification recall is
independent of embedding geometry. Claims only grow when the LLM says "genuinely
new," so canonical forms converge instead of drifting.

Key stability principle: **classification into a fixed set converges; free-form
generation does not.**

### 2.2 Why this fixes cold start too

The LLM meaning-judgment is **calibration-free**: comparing statement #2 against
claim #1 works exactly as well with 2 statements as with 2,000 — unlike cosine
bands, which need statistical mass. So the registry is the natural *primary*
mechanism for young questions:

- **Claim-per-statement at the start:** early statements immediately spawn
  *provisional* claims (with public explanations) — users see labeled clustering
  from statement #1.
- **Young-question mode:** below `youngQuestionThreshold` (~25 statements), route
  every arrival through registry classification; treat cosine as advisory. Above
  it, cosine fast-path first, registry as arbiter.

### 2.3 Continuous consolidation (claim-level re-clustering)

Bulk re-clustering is expensive because it operates on N statements — O(N²) cosine
plus up to 2,000 LLM judge calls (`twoTierJudge.ts`). The registry gives
re-clustering a compact substrate: a question with 500 statements might have ~30
claims of 5–15 words. **One LLM call can read the whole codebook** and propose
"merge these two, split that one."

Membership transfers **transitively**: if statement A expresses claim X, and X
merges into Y because X ≡ Y, then A expresses Y — no per-statement re-judging.
Splits are the only case needing member re-classification, and only against the
2–3 daughter claims.

This turns the rare expensive re-cluster into a cheap **continuous consolidation
pass** (every ~10–20 new statements, or on cohesion drop). Early-phase quality
converges to bulk quality without waiting.

**Scope note (v1):** merges are applied automatically; split proposals are routed
to the existing admin review queue (`_liveSynthCandidates`) rather than auto-split.
Auto-splitting live structure is riskier than auto-merging (merge is reversible by
a later split decision; a bad split scatters members), so v1 keeps a human in that
loop.

### 2.4 Claim lifecycle

```
provisional ──(≥3 members AND survived one consolidation pass)──▶ confirmed
```

- **Provisional** claims merge freely and cheaply during consolidation.
- **Confirmed** claims are stable anchors; changing them triggers the mutation
  protocol (§3).

This encodes the reality that early structure is guesswork — instead of pretending
early spawns are as trustworthy as late ones.

---

## 3. Claim Mutation Protocol

Claims are **versioned** (`claimVersion`, integer, starts at 1). What happens when
a canonical claim's text changes depends on *how its meaning changed*. On any text
change, one LLM call classifies the change (old vs. new):

| Change type | Example | Member re-check? |
|---|---|---|
| **Reword** (same meaning) | Better "simple terms" phrasing | No — version bump only |
| **Broaden** | "bike lanes on Main St" → "more bike infrastructure" | No — members express special cases, still valid |
| **Narrow / shift** | Meaning actually moved | **Yes** — batched member re-validation |
| **Merge** (X ≡ Y) | Consolidation decision | No — membership transfers transitively |
| **Split** | Claim was too broad | Partial — re-classify members against daughter claims only |

**Batched re-validation is one LLM call per cluster**, not one per member: members
are represented by their embedding briefs (5–15 words each, `embeddingBrief` from
`brief-service.ts`, falling back to statement title), so the prompt is
"here is the new claim; here are the member briefs; which still express it?"

**Detached statements auto-reprocess:** members that no longer fit re-enter the
pipeline as if newly arrived — they match another claim or spawn a provisional one.
No admin queue on this path (product decision: fully automatic, self-healing,
consistent with live-from-start).

The statement→claim relationship records `claimVersion` at attach time plus attach
method (`cosine` | `registry`) and confidence, so we always know which members were
validated against which wording.

**Opposite-meaning guard:** the classification prompt distinguishes *expresses* vs
*opposes* a claim (same four-way taxonomy as `semantic-equivalence-service.ts`:
same / related / different / opposite). A statement that opposes a claim is never
attached to it.

---

## 4. Opt-In Behavior (default OFF)

Not all questions need clustering. The registry is **per-question opt-in**:

- New setting `claimRegistryEnabled: boolean` on the question's synthesis settings
  block (`Statement.statementSettings.synthesis`), **default `false`** for all
  question types (including Mass-Consensus, whose base synthesis `enabled` defaults
  to true).
- Admin turns it ON in the Synthesis panel → triggers a **first run**:
  1. **Claim backfill:** clusters under the question that lack `canonicalClaim`
     get one generated (batched LLM call from cluster title/description/members).
  2. **Catch-up enqueue:** all unclustered options are enqueued through the
     existing synthesis queue (same mechanics as `fn_synthesizeNow.ts`), so the
     pipeline — now with the registry pass active — processes the backlog.
- After the first run, live mode takes over for new arrivals.
- Toggle OFF → registry/consolidation passes stop. Existing claims and
  explanations stay stored (display gated by the same flag). Toggle ON again →
  the same first-run function performs an incremental catch-up (backfill and
  enqueue are both idempotent — deterministic queue item IDs, claims only
  generated where missing).

---

## 5. Data Model

Cluster docs are `Statement` documents (`isCluster: true`,
`integratedOptions: string[]`, `derivedByPipeline: 'synthesis' | 'topic-cluster'`).
Because `@freedi/shared-types` is consumed as a packaged tgz, registry fields
follow the same pattern as the `synthesis` settings block: extra fields on the
document, read through typed helpers rather than the shared schema.

**New fields on cluster statements:**

| Field | Type | Meaning |
|---|---|---|
| `canonicalClaim` | `string` | 5–15 word core idea; the classification anchor |
| `publicExplanation` | `string` | 1–2 plain-language sentences for citizens |
| `claimVersion` | `number` | Increments on any claim text change |
| `claimStatus` | `'provisional' \| 'confirmed'` | Lifecycle state (§2.4) |
| `claimUpdatedAt` | `number` (ms) | Timestamp of last claim change |

**New setting on `statementSettings.synthesis`:**

| Field | Type | Default |
|---|---|---|
| `claimRegistryEnabled` | `boolean` | `false` |

**Registry meta doc** (`_claimRegistry/{questionId}`): consolidation bookkeeping —
`statementsSinceConsolidation`, `lastConsolidationAt`, counters for decision
logging.

**Decision log:** every registry decision is logged structurally
(`logger.info('claimRegistry.decision', {...})`) with
`{ optionId, matchedClusterId, cosineAtMatch, method: 'registry' | 'cosine', verdict }`.
A registry match at low cosine is precisely the "same meaning, distant embedding"
case — the log measures how often it actually happens and accumulates labeled
pairs for a potential future embedding fine-tune (out of scope for now).

---

## 6. Where It Sits in the Pipeline

`runSinglePipeline.ts` decision tree, with the registry pass added (marked ★):

```
option arrives
  ├─ guards (is option, not cluster, not already a member, settings enabled)
  ├─ ensure embedding → vector search (top-10 ≥ reviewLowerBound)
  ├─ PASS 1  — SYNTH ATTACH        (cosine ≥ 0.85 + cohesion gate, 0 LLM)
  ├─ PASS 2  — TOPIC ATTACH        (cosine ≥ 0.60, 0 LLM)
  ├─ ★ REGISTRY PASS (claimRegistryEnabled only)
  │    · load claims for all live clusters under the question
  │    · one gpt-4o-mini call: "which claim does this express, or none?"
  │    · match → attach to that cluster (logged method:'registry') — DONE
  │    · no match → fall through
  │    · runs even when vector search returned ZERO candidates
  │      (that's exactly the recall-gap case)
  ├─ PASS 3  — SPAWN (band-routed, 1–2 LLM)
  │    · registry-enabled spawns also stamp canonicalClaim (= generated title),
  │      publicExplanation (= description), claimVersion 1, status provisional
  ├─ PASS 4  — REVIEW QUEUE        (gray band 0.45–0.60, 0 LLM)
  └─ PASS 5  — SINGLETON
       · registry-enabled singletons spawn a single-member provisional claim
         so the public sees a labeled idea from statement #1
  └─ afterwards: bump _claimRegistry counter; every ~15 statements → consolidation
```

Cost profile: the cosine fast path is unchanged (zero added LLM calls when Pass
1/2 attaches). The registry call fires only for options cosine couldn't place —
in mature questions a minority of arrivals. **≈ $1–2 per 1,000 statements** at
gpt-4o-mini pricing.

---

## 7. Key Files

| File | Role |
|---|---|
| `functions/src/services/claim-registry-service.ts` | **New.** `loadClaims`, `classifyAgainstClaims`, `classifyClaimChange`, `revalidateMembers`, claim generation |
| `functions/src/synthesis/pipeline/runSinglePipeline.ts` | Registry pass between Pass 2 and Pass 3; singleton claim spawn |
| `functions/src/synthesis/pipeline/clusterOps.ts` | Claim fields stamped at spawn |
| `functions/src/synthesis/pipeline/types.ts` | `claimRegistryEnabled` in `SynthesisSettings` + validation |
| `functions/src/synthesis/pipeline/loadSynthesisSettings.ts` | Merge/default for the new flag |
| `functions/src/synthesis/consolidation/` | **New.** Consolidation pass (merge apply, split → review queue), mutation protocol wiring |
| `functions/src/synthesis/admin/fn_claimRegistryFirstRun.ts` | **New.** Backfill + catch-up enqueue on toggle-ON |
| `src/view/pages/statement/components/settings/components/synthesisPanel/SynthesisPanel.tsx` | Admin toggle |
| `functions/src/fn_findSimilarStatements_optimized.ts` | (Phase 3) paraphrase expansion for the interactive flow |

## 8. Relationship to Existing Systems

- **`brief-service.ts` (embedding briefs):** unchanged. Briefs remain the
  embedding input; the registry reuses them as compact member representations for
  batched re-validation.
- **`semantic-equivalence-service.ts`:** unchanged. Its four-way taxonomy
  (same/related/different/opposite) is reused in the registry classification
  prompt semantics; the judge itself still serves `twoTierJudge`.
- **`twoTierJudge.ts` / bulk clustering:** unchanged. Bulk re-truth still runs;
  the consolidation pass reduces how much work it finds.
- **Interactive find-similar (`fn_findSimilarStatements_optimized.ts`):** gets
  paraphrase expansion (embed 2–3 LLM paraphrases of user input, max similarity
  per candidate) rather than a registry call — the submission flow is
  latency-sensitive.

## 9. Alternatives Considered

| Alternative | Why not |
|---|---|
| Query expansion alone | Probabilistic recall — no guarantee; kept only as a complement for the interactive flow |
| Fine-tuned embeddings (contrastive) | Fixes geometry permanently, but requires leaving OpenAI embeddings, self-hosting, re-embedding everything, and thousands of labeled Hebrew+English pairs we don't have. Possible Phase 4; the registry's decision log generates its training data as a byproduct |
| ColBERT / late interaction | Token-level matching helps shared-vocabulary cases, not different-vocabulary paraphrases (our failure mode); Firestore can't store multi-vectors; 50–100× storage |
| Hybrid BM25 + vector | Lexical search cannot, by definition, catch same-meaning-different-words; weak on Hebrew morphology |
| Knowledge graph | The registry is its minimal viable form; a full KG adds extraction, ontology, and graph infra for no additional benefit at per-question scale |

The registry wins because our corpus-per-question is small enough for exhaustive
LLM classification — the constraint that forces web-scale systems into
approximate retrieval doesn't apply here.
