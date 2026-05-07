# Topic-Grouped Deliberation Results Export

**Status:** Draft for review
**Author:** Tal Yaron · Claude
**Last updated:** 2026-05-06

## Purpose

Given a deliberation question with hundreds of community proposals, produce a single derived dataset that:

1. **Groups solutions by topic** — using the existing topic-cluster pipeline so the reader sees a small number of thematic buckets, not a flat list of hundreds.
2. **Within each topic, ranks the survivors:**
   - Every **synthesized solution** (i.e. cluster with `derivedByPipeline === 'synthesis'`) — these are AI-authored proposals merged from N similar variants.
   - Every **standalone solution** (not part of any synthesis cluster) whose `consensus` (WizCol agreement) is **above 0.35**.
   - Anything below the threshold is dropped from the report (but counted in a single "filtered out" bucket so the reader knows the dataset is selective).
3. **Surfaces agreement signals** for each solution and each topic, so a reader can answer:
   - *"How strongly do participants agree on this proposal?"* (consensus, like-mindedness, confidence)
   - *"Do they agree because the issue is uncontroversial, or because a single faction dominates?"* (polarization, evaluator-cohort coverage)
   - *"Which proposals share the same supporters?"* (cross-solution evaluator overlap — coalition signal)

This document specifies the output shape, the source data, the filters, and the agreement signals to compute. It does NOT prescribe whether the export is a Firestore document, an HTTP callable response, or a static JSON file — see §6 for options.

## 1. Output shape (top-level)

```jsonc
{
  "questionId": "FcHcx95CnkN2",
  "questionTitle": "Regional ideas — what should we do?",
  "exportedAt": 1778051234000,
  "thresholds": {
    "standaloneConsensusFloor": 0.35,
    "synthesisIncludesAll": true
  },

  "summary": {
    "totalOptions": 102,             // visible options under the question (excludes hide=true)
    "totalEvaluators": 287,          // unique evaluator uids across all options
    "topicCount": 8,                 // topics produced by the topic-cluster pipeline
    "synthesizedSolutionCount": 12,  // sum across all topics
    "standaloneAboveFloorCount": 18, // sum across all topics
    "filteredOutCount": 70           // standalones below 0.35
  },

  "agreement": {
    "questionLevel": {
      "averageConsensus": 0.41,
      "averageLikeMindedness": 0.74,
      "polarization": 0.26,          // 1 - averageLikeMindedness
      "evaluatorEngagement": 4.8     // avg solutions evaluated per user
    },
    "coalitions": [
      {
        "cohortId": "A",
        "size": 142,
        "characterization": "broad pro-investment supporters",
        "topProposalIds": ["...", "...", "..."]
      },
      {
        "cohortId": "B",
        "size": 71,
        "characterization": "fiscally cautious, prefer targeted programs",
        "topProposalIds": ["...", "...", "..."]
      }
    ]
  },

  "topics": [ /* see §2 */ ],

  "filteredOut": {
    "count": 70,
    "byReason": {
      "belowConsensusFloor": 64,
      "lowEvaluators": 4,
      "hidden": 2
    }
    // Full list available on demand via separate endpoint; not embedded here
    // because dropping 70 low-signal items inline defeats the purpose.
  }
}
```

## 2. Per-topic block

```jsonc
{
  "topicId": "topic-cultural-center",
  "topicTitle": "Regional cultural infrastructure",
  "topicDescription": "Proposals about establishing or expanding shared cultural venues across the region.",
  "memberCount": 22,         // total options the topic-cluster pipeline assigned here
  "displayedCount": 5,       // synthesizedSolutions.length + standaloneSolutions.length

  "agreement": {
    "averageConsensus": 0.48,
    "averageLikeMindedness": 0.81,
    "internalDivergence": 0.09,   // SD of consensus across this topic's solutions; low = topic-internal alignment
    "evaluatorOverlap": 0.62,     // fraction of users who evaluated 2+ solutions inside this topic
    "dominantCohortId": "A"       // which top-level coalition leans toward this topic's proposals
  },

  "synthesizedSolutions": [ /* see §3 */ ],
  "standaloneSolutions":  [ /* see §4 */ ]
}
```

## 3. Synthesized solution entry

```jsonc
{
  "solutionId": "4AdFOfj0BNxgmwiYXUqv",
  "kind": "synthesis",
  "derivedByPipeline": "synthesis",
  "title": "Establish a regional cultural collaboration center serving Tzfat, Hatzor, and Rosh Pina",
  "description": "Build a shared multi-purpose cultural venue serving the three towns, with rotating exhibits, performances, and an artist-residency program.",
  "paragraphs": [
    "Set up a steering board with representation from each municipality...",
    "Identify a building (e.g. underused community center in Hatzor)...",
    "Funding plan: 60% regional budget, 30% national arts grants, 10% private donations..."
  ],

  "provenance": {
    "sourceCount": 10,
    "sourceIds": ["...", "...", "..."],
    "sourceTitles": ["...", "..."]   // short list of original phrasings; full list elsewhere
  },

  "evaluation": {
    "numberOfEvaluators": 87,
    "averageEvaluation": 0.65,
    "consensus": 0.51,            // WizCol C_p = μ - t·SEM
    "agreementIndex": 0.74,       // 1 - t·SEM
    "likeMindedness": 0.81,       // 1 - SEM*
    "confidenceIndex": 0.62,      // sample-size relative to target population
    "proRatio": 0.78,             // pro_evaluators / total_evaluators
    "polarization": 0.19          // 1 - likeMindedness
  },

  "agreementProfile": {
    "stronglyAgreeCount": 48,    // evaluation >= 0.6
    "weaklyAgreeCount": 22,
    "neutralCount": 11,
    "weaklyDisagreeCount": 4,
    "stronglyDisagreeCount": 2,
    "agreementShape": "consensus" // "consensus" | "split" | "skewed-positive" | "polarized" — derived from histogram
  },

  "regenerationStatus": {
    "lastRegeneratedAt": 1778045000000,
    "lastRegeneratedBy": "...",
    "cannotSynthesize": false
  }
}
```

## 4. Standalone solution entry

```jsonc
{
  "solutionId": "...",
  "kind": "standalone",
  "title": "Build accessible community plazas in each town",
  "description": "...",
  "creatorId": "...",   // anonymized in exports

  "evaluation": {
    "numberOfEvaluators": 41,
    "averageEvaluation": 0.43,
    "consensus": 0.38,         // above the 0.35 floor → kept
    "likeMindedness": 0.71,
    "polarization": 0.29
  },

  "agreementProfile": { /* same shape as §3 */ },

  "kept": {
    "reason": "consensus 0.38 above floor 0.35",
    "rank": 4   // rank within topic by consensus
  }
}
```

## 5. Agreement signals — definitions

This section defines exactly how we compute each agreement field, so the meaning is unambiguous in downstream UIs and reports.

### 5.1 Per-solution

All values are derived from the existing `StatementEvaluation` aggregations the platform already maintains via incremental updates on each evaluation event. **No new database queries are required for these fields.**

| Field | Formula | Range | Reading |
|---|---|---|---|
| `consensus` | `μ - t_{α,n+k-1} · SEM*` (WizCol) | [-1, 1] | High = participants agree positively, after penalizing small samples |
| `agreementIndex` | `1 - t · SEM*` | [0, 1] | High = participants agree, regardless of direction |
| `likeMindedness` | `1 - SEM*` | [0, 1] | High = low spread → participants are aligned (agree or disagree together) |
| `confidenceIndex` | sample-size factor vs `targetPopulation` | [0, 1] | High = enough evaluators to be representative |
| `proRatio` | `n_pro / n_total` | [0, 1] | High = mostly positive evaluations |
| `polarization` | `1 - likeMindedness` | [0, 1] | High = participants split into opposed camps |

### 5.2 Histogram-based `agreementShape`

The continuous metrics above don't distinguish *"50 people gave 0.5"* from *"25 gave +1, 25 gave -1"*. To surface the difference, we bucket evaluations into a 5-bin histogram:

- `stronglyAgree`: evaluation ≥ 0.6
- `weaklyAgree`: 0 < evaluation < 0.6
- `neutral`: evaluation == 0
- `weaklyDisagree`: -0.6 < evaluation < 0
- `stronglyDisagree`: evaluation ≤ -0.6

Then classify the shape:

| Shape | Condition |
|---|---|
| `consensus` | ≥ 70% in `stronglyAgree` ∪ `weaklyAgree`, and `polarization` < 0.25 |
| `skewed-positive` | majority positive but with a meaningful tail of disagreement (`polarization` 0.25–0.45) |
| `polarized` | both ends populated (`stronglyAgree ≥ 20%` AND `stronglyDisagree ≥ 20%`) |
| `split` | bimodal but milder than polarized (e.g. weakly-agree + weakly-disagree both ≥ 25%) |
| `low-signal` | `numberOfEvaluators < 5` — shape is unreliable |

This produces the most actionable signal for facilitators: *"is this support deep, or is the average hiding a fight?"*

This requires a per-solution evaluation read: query `evaluations` where `statementId == solutionId` and bucket. Cost is one batched read per surviving solution (typically 30–40 per question after filtering).

### 5.3 Per-topic

| Field | Formula |
|---|---|
| `averageConsensus` | mean of `consensus` across the topic's surviving solutions |
| `averageLikeMindedness` | mean of `likeMindedness` |
| `internalDivergence` | sample standard deviation of `consensus` within the topic |
| `evaluatorOverlap` | fraction of users who evaluated ≥ 2 solutions in this topic |
| `dominantCohortId` | which top-level coalition (§5.4) most prefers this topic |

### 5.4 Question-level coalitions

This is the most expensive computation and the most useful new signal. The goal is to detect *"groups of users who consistently vote alike,"* i.e. the de-facto factions in this deliberation.

Algorithm v1:

1. Build a sparse user-by-solution matrix `M` where `M[u][s]` = the user's evaluation of solution `s`, blank if they didn't vote.
2. Drop users with fewer than 5 evaluations (insufficient signal).
3. Compute pairwise user similarity using **cosine on shared evaluations only** (users who didn't co-evaluate any solutions get similarity = 0).
4. Run **k-means with k=2 or k=3** on the user vectors (project missing values to mean for clustering only). Pick k by silhouette score.
5. For each cohort: list the top 5 solutions where the cohort's average evaluation is highest, and the top 5 where it's notably *lower than the other cohort* (this characterizes the cohort by what it uniquely supports).
6. Build a one-line `characterization` from the cohort's top supported / top opposed solutions via an LLM call (Gemini). Optional in v1; can be a placeholder string until validated.

For a question with ~287 evaluators × ~30 solutions, this fits comfortably in memory. For larger questions (10,000 users × 1,000 solutions), v2 would need sparse matrix factorization or Polis-style PCA.

This is the only piece that introduces new computation beyond simple per-solution reads. **For v1 this section can be omitted** — emit `coalitions: []` and ship without it. Useful but not critical.

## 6. Source data

All inputs are already in Firestore. No backfill needed beyond what the synthesis + topic-cluster pipelines already produce.

| Source | Used for |
|---|---|
| `statements` where `parentId == questionId` AND `statementType == 'option'` AND `hide != true` | Surviving option set + their cached evaluation aggregations |
| `statements` where `isCluster == true` AND `derivedByPipeline == 'synthesis'` | Synthesis clusters (and their `integratedOptions` source IDs, paragraphs, descriptions) |
| `statements` where `derivedByPipeline == 'topic-cluster'` (via `framingClusters[topicFramingId]`) | Topic assignment per option |
| `evaluations` where `parentId == questionId` | Per-user evaluations for histogram buckets + coalitions |
| `clusterEvaluationLinks` where `clusterId in clusterIds` | Per-(cluster, user) provenance — used for de-duplicated counts in synthesized clusters |
| Parent question's `framings` (Firestore subcollection or framings collection) | Topic framing metadata: id, title, description |

## 7. Filters and thresholds

These are encoded in the export so a future reader can interpret the data:

```json
{
  "thresholds": {
    "standaloneConsensusFloor": 0.35,
    "minEvaluators": 2,
    "synthesisIncludesAll": true,
    "lowSignalEvaluatorThreshold": 5
  }
}
```

**Defaults to discuss before implementation:**

- **`standaloneConsensusFloor: 0.35`** — User-specified.
- **`synthesisIncludesAll: true`** — Every synthesized cluster is shown regardless of consensus, because the synthesis pipeline already filtered by `minEvaluators` upstream and synthesized proposals are the report's primary signal. *Confirm:* should we still drop synthesis clusters with `consensus < some_floor`?
- **`minEvaluators: 2`** — A standalone with only 1 evaluator is dropped even if consensus is technically high (it's a single user's score). Mirror the existing synthesis pipeline's `minEvaluators` setting.
- **`lowSignalEvaluatorThreshold: 5`** — Below this, `agreementShape` is reported as `"low-signal"` instead of bucketed; the histogram is still emitted for transparency.

## 8. Implementation options

Three plausible delivery mechanisms. We can support more than one over time.

### A. Admin callable: `getQuestionResultsExport({ questionId, options? })`

- Backend Cloud Function in `functions/src/fn_resultsExport.ts`.
- Region me-west1 (per project preference).
- Admin-only auth via existing `assertAdmin` helper.
- Returns the full JSON in the response (or writes to Cloud Storage and returns a signed URL if larger than 10 MB).
- Pros: live, on-demand, always reflects current state.
- Cons: re-computes histograms + coalitions every call.

### B. Background-cached export

- Store the export under `statements/{questionId}/exports/results-{timestamp}` in Firestore (or as a single doc with `lastExportedAt`).
- Refresh on schedule (every N hours) or on demand from admin UI.
- Pros: cheap reads, stable URLs for sharing.
- Cons: stale; needs invalidation logic.

### C. Local-emulator / one-off CLI

- `scripts/exportQuestionResults.ts` mirroring the `exportProdQuestion.ts` pattern.
- Runs against prod with admin SDK + service account credentials.
- Outputs JSON file locally.
- Pros: zero backend deployment, perfect for ad-hoc reports and feeding into other tools (Notion, Sheets).
- Cons: not user-facing.

**Recommendation:** ship **C first** (one-off script) so we validate the data shape and agreement signals against real questions, then promote the same logic into **A** (admin callable) once the format settles. **B** can come later if read traffic justifies caching.

## 9. Implementation steps (assuming Plan C first)

1. **Output schema lock** — Convert §1–§4 above into TypeScript interfaces in `packages/shared-types/src/models/results-export/`. Reuse `Statement`, `StatementEvaluation` where possible.
2. **Loader** — Reads question + descendants + evaluations + topic-cluster framing + synthesis clusters into in-memory maps. ~150 lines, mirrors the loader in `exportProdQuestion.ts`.
3. **Filter + assignment pass:**
   - Group surviving options by topic (via `framingClusters[topicFramingId]`).
   - For each topic, partition into synthesized + standalone.
   - Drop standalones with `consensus < 0.35` OR `numberOfEvaluators < minEvaluators`.
4. **Per-solution agreement enrichment:**
   - For each survivor, query evaluations and bucket into the 5-bin histogram.
   - Compute `agreementShape` per §5.2.
5. **Per-topic aggregation** — Compute the §5.3 summaries.
6. **Question-level summary** — Sum counts, average consensus.
7. **Coalitions (optional in v1)** — Implement §5.4 if time permits, else emit `coalitions: []`.
8. **Output** — Write JSON to `<out>.json`. Pretty-print, schema-validate.
9. **Smoke test** — Run against the local emulator's `FcHcx95CnkN2` (100 options, with synthesis clusters and standalones from real prod data) and inspect by hand.
10. **Schema doc** — Generate `docs/results-export-format.md` from the TS interfaces using TypeDoc or ts-json-schema-generator.

## 10. Open questions

These need confirmation before implementation. **Please answer inline before I write the script.**

1. **Synthesis floor.** Should synthesized clusters also be filtered by `consensus < threshold`, or always shown regardless of consensus? (Default: always shown.)
2. **Filtered-out detail.** Should the export include the full list of filtered-out solution IDs + titles, or just the count? (Default: count only, with a separate audit endpoint.)
3. **Coalitions in v1.** Is the cohort-detection signal worth shipping in the first version, or is it OK to defer? (Default: defer; emit `coalitions: []`.)
4. **Anonymization.** When this export goes to a stakeholder outside the platform admins, do we strip evaluator identities entirely (just counts), or surface anonymized cohort labels? (Default: never expose evaluator IDs in the export — counts and cohort labels only.)
5. **Topic source.** If a question has multiple topic framings (admin can request different taxonomies), which one drives the topic grouping? (Default: the most recent `topic-cluster` framing on the question; admin can override.)
6. **Solutions assigned to multiple topics.** A topic-cluster solution may belong to more than one topic (the pipeline supports many-to-many via `framingClusters`). Show in each, or pick the highest-weight assignment? (Default: pick highest-weight; mention secondary in `alsoIn[]`.)
7. **Output format.** JSON only, or also Markdown / PDF rendering for human reading? (Default: JSON in v1, Markdown rendering as a follow-up via Pandoc or a small TS template.)
8. **Refresh model.** If this becomes a callable (Plan A), should it cache results on the question doc and only re-compute when `lastChildUpdate` advances? (Default: yes, with a `force=true` flag for admin override.)

## 11. Out of scope for this plan

- A new UI page rendering the export. The plan is data-only; rendering is a follow-up.
- Writing exports to external systems (Notion, Sheets, etc.). Once we have stable JSON, those integrations are independent.
- Modifying the synthesis or topic-cluster pipelines themselves. The export is a read-only consumer of their outputs.
- Real-time streaming. The export is a snapshot; live UI uses the existing Firestore listeners.

## 12. Definition of done

The plan is "done" when:

- A run of `npx tsx scripts/exportQuestionResults.ts --question-id <id>` produces a valid JSON conforming to §1–§4.
- The JSON has been hand-inspected on at least two real questions (one large, one small) and the agreement signals make sense to a human reader.
- The TypeScript interfaces are committed and consumed by the script.
- A short README in `scripts/` documents the flags and example output.
- An entry is added to `docs/` linking to the schema and explaining the thresholds.
