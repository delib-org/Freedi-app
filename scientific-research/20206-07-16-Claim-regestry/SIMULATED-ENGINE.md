# Simulated Engine — Tiered ELJ (working document)

**Date:** 2026-07-24 · **Authors:** Tal + Claude · **Status:** design to explore by simulation

This document is self-contained so a fresh session can pick it up with no other context.

---

## 1. Vocabulary

| term | meaning |
|---|---|
| **ELJ** | Embedding + LLM Judge: cosine similarity *fetches* candidates, an LLM judge *decides* meaning. Embedding never decides on its own. |
| **judge** | One LLM call (gpt-4o-mini). Input: question + list of candidate texts + new statement. Output: `expresses` / `opposes` / `none` + confidence. Attach only on `expresses` with confidence ≥ 0.6. `opposes` → counter-edge, never a merge. |
| **synth** | Tight group of statements with the same meaning (high-similarity tier). |
| **cluster** | Looser group around the same idea/topic (lower tier). |
| **anchor / match / distractor** | Benchmark triplet: existing statement / same-meaning-different-words / same-words-opposite-meaning. |

---

## 2. The engine Tal proposed (to be simulated)

```
new statement arrives
│
├─ 1) EMBED the statement
│
├─ 2) SYNTH TIER — cutoff 0.85
│     fetch all statements with cosine ≥ 0.85
│     → JUDGE them: which truly have the same meaning?
│     → if same-meaning statements found:
│           · attach to an existing close synth, or
│           · create a NEW synth containing them + the new statement
│
└─ 3) CLUSTER TIER — cutoff 0.60 (if synth tier found nothing)
      fetch all statements with cosine ≥ 0.60
      → JUDGE them the same way
      → attach the new statement to a CLUSTER
```

**The core idea:** keep the two-tier structure of the current pipeline (synth at 0.85, cluster at 0.60), but insert the judge at **both** tiers. Cosine proposes, judge disposes — at every level. No attach ever happens on cosine alone.

### How this differs from production today

| | production today | this engine |
|---|---|---|
| cosine ≥ 0.85 | attach immediately, **no judge** | judge first, then synth-attach |
| cosine ≥ 0.60 | attach immediately, **no judge** | judge first, then cluster-attach |
| below 0.60 | registry pass (judge vs full codebook), off by default | *open question — see §4.Q1* |
| judge compares against | claim summaries (codebook) | the similar **statements themselves** |

Note the last row: this engine judges against **raw neighbor statements**, not claim summaries. The benchmark showed judging raw text is far more accurate than judging summaries (95.0% vs 70.1%) — so this design may sidestep the summary-loss problem entirely at the synth tier.

---

## 3. Known numbers to hold the simulation against (from the July 2026 benchmark)

All cosines in production format: `"Question: …\nAnswer: …"`, model `text-embedding-3-small`.

### Judge accuracy (n = 875 adversarial triplets)
- Judge reading raw statement text: **95.0%** triplet accuracy; accepts 96.8% of matches, wrongly accepts only 2.1% of distractors, names 95.9% of distractors as *opposing*.
- Judge reading 5–15-word claim summaries: 70.1% (→ 88.6% after enrichment fix). Summaries, not the judge, are the weak link.
- Hebrew paraphrases vs English anchors: judge = **125/125 (100%)**.
- Cost: ≈ $0.11 per 1,000 statements (small lists), $0.41 (≈94-entry lists).

### Cosine distributions (the critical geometry facts)
| population | min | median | max |
|---|---|---|---|
| true matches (same meaning, n=880) | 0.734 | 0.871 | 0.962 |
| **distractors (opposite meaning)** | 0.743 | **0.969** | 0.999 |
| English adversarial rewrites (same meaning, n=147) | 0.738 | 0.860 | 0.965 |
| Hebrew paraphrases (same meaning, n=125) | 0.574 | 0.702 | **0.822** |

Consequences:
- **99.1% of opposite-meaning distractors score ≥ 0.85** → the synth tier's fetch will be FULL of opposites. The judge must carry the entire load there. (Benchmark says it can: 2.1% false-accept.)
- Only **71%** of true matches score ≥ 0.85 → many same-meaning statements skip the synth tier and land at the cluster tier. Expected, fine.
- **0%** of Hebrew matches reach 0.85; **95%** reach 0.60; 6/125 fall below 0.60.
- Translating to English inside the brief step (before embedding only — judge keeps original text) could lift cross-language cosines; unmeasured, needs native-Hebrew test data.

### Production facts that affect simulation fidelity
- Vector search is capped at **top-10 neighbors** (`NEIGHBOR_LIMIT = 10`, `runSinglePipeline.ts:75`) and floor 0.45.
- Embedding is computed over an LLM-written 5–15-word **brief**, not the raw text (`EMBEDDING_USE_BRIEF` default true). Benchmark cosines above were on raw text — real production cosines are likely LOWER. All cutoffs should be re-checked with brief-based embeddings.
- Current registry pass (when enabled) loads the **full codebook** with no cutoff; cosine only re-orders the list.
- `claimRegistryEnabled: false` by default today.

---

## 4. Open questions to explore in the simulation

**Q1 — What happens below 0.60?**
The engine as written stops at the cluster tier. But 6/125 verified Hebrew same-meaning pairs scored 0.574–0.60. Options: (a) a third tier — judge vs the claim codebook (today's registry pass) as final catch-all; (b) drop the floor to 0.45; (c) translate-for-embedding so everything relevant clears 0.60. To decide by simulation.

**Q2 — Does the 0.85 tier earn its keep?**
Since the judge runs at both tiers anyway, what does the two-tier split buy over a single fetch at 0.60 judged once? Candidate answers: shorter judge lists (cost), and the synth/cluster distinction itself (product structure). Measure both.

**Q3 — Judge list size and the top-10 cap.**
At 0.60 in a big deliberation, "all statements above cutoff" can be hundreds. Does the engine fetch statements or claim/synth representatives? Does top-10 truncation hurt? (In the triplet data the right answer is nearly always rank 1–2 — but distractors outrank matches in 863/880 cases, so top-10 by cosine is full of opposites-first.)

**Q4 — "Create a new synth" semantics.**
Step 2 says same-meaning neighbors that aren't yet in a synth get pulled INTO a new synth together with the new statement. This retroactively organizes old statements — a real difference from production (which only files the new statement). Simulate the effect on cluster quality and on churn.

**Q5 — Opposes handling per tier.**
When the judge says `opposes` at the synth tier, does the statement then fall through to the cluster tier (same topic, opposite stance → maybe same cluster, different synth)? This could naturally produce pro/con structure inside a cluster. Attractive; simulate it.

**Q6 — Cost & latency.**
Worst case two judge calls per statement (synth tier + cluster tier). Still ~$0.2–0.8 per 1,000 statements. Latency: ~1–2 s added. Confirm acceptable.

---

## 5. Simulation plan (suggested)

1. Build a small driver that replays the 875 triplets + the 150 recall-gap anchors (English + Hebrew rewrites) through the tiered engine above.
2. Reuse existing harness pieces in `scientific-research/20206-07-16-Claim-regestry/benchmark/` — it already imports the production classifier and has embeddings cached (`results/claim-embeddings-cache.jsonl`, `results/cosines.jsonl`, `results/recall-gap-E.jsonl`).
3. Score: false merges (distractor attached to anchor's synth/cluster), recall (match filed with anchor at either tier), tier usage rates, judge-list sizes, cost.
4. Compare five configurations: (a) production today (cosine-only fast paths), (b) this tiered ELJ, (c) flat ELJ (single 0.45 fetch + one judge call), (d) verdict-tiered ELJ (§6 — flat fetch over representatives, judge assigns the tier), (e) pure hierarchical LLM routing (§7 — cluster step then synth step, no cosine filter).

---

## 6. Alternative engine (configuration d): verdict-tiered ELJ

Proposed 2026-07-24 in response to weaknesses of the 0.85/0.60 design. Core move: **cosine never assigns the tier — the judge does.** Rationale: opposites score above 0.85, Hebrew matches score below it, and brief-based embeddings shift all cutoffs; meanwhile the synth/cluster distinction is semantic, which is exactly what the judge measures.

```
new statement arrives
│
├─ 1) EMBED (optionally translate→English for embedding only; judge sees original text)
│
├─ 2) FETCH once, floor 0.45, over REPRESENTATIVES:
│     · one exemplar (most central member, raw text) per existing synth
│     · plus all statements not yet in any synth
│
├─ 3) ONE judge call, four-way verdict per candidate:
│     same-meaning / same-topic / opposes / unrelated  (+ confidence)
│
└─ 4) FILE by strongest verdict:
      · same-meaning w/ synth exemplar   → join that synth (inherits its cluster)
      · same-meaning w/ loose statement  → NEW synth containing both (Q4 built in)
      · only same-topic                  → attach to that candidate's cluster, loose
      · only opposes                     → counter-edge; join opponent's CLUSTER,
                                           never its synth (Q5 built in, one call)
      · nothing                          → seed a new cluster
```

Why it should fill tiers more correctly than §2:
- **Tier assignment is semantic.** A Hebrew paraphrase at cosine 0.70 joins the synth (judge: same-meaning); under §2 it is structurally locked out of synths forever (0% of Hebrew matches reach 0.85).
- **Robust to brief-embedding drift** — only the 0.45 floor touches the embedding, and 0.45 lost nothing in any language.
- **Fixes top-K crowding structurally**: merged opposites collapse into one exemplar slot, so a pile of near-duplicate opposing statements can no longer push the true match out of the candidate list (distractors outrank matches in 863/880 cases). Candidate count scales O(synths + loose), shrinking as the corpus organizes.
- **One judge call per statement** (vs up to two in §2), and no double-judging of `opposes` pairs — each re-judge is another ~2% chance of a false merge.

**Key unvalidated assumption:** `same-meaning` vs `same-topic` is a new discrimination — the 875 triplets only test express/oppose. Risk: over-merging near-miss statements into synths. The simulation must measure this boundary (recall-gap set + hand-labeled same-topic-but-different pairs) before trusting configuration (d). Exemplar selection policy is a second knob to test.

---

## 7. Alternative engine (configuration e): pure hierarchical LLM routing

Proposed by Tal 2026-07-24. No cosine filter at all — the judge walks the hierarchy:

```
new statement arrives
│
├─ 1) CLUSTER STEP — one judge call vs all clusters
│     "is there a cluster this sits under?"
│     · yes → enter that cluster
│     · no  → create a new cluster (statement seeds it)
│
└─ 2) SYNTH STEP — one judge call vs the synths inside the chosen cluster
      · same-meaning synth found → join it
      · none → create a new synth in this cluster
```

Properties:
- **Cheap and bounded**: two short calls per statement; list sizes scale with #clusters and cluster size, not corpus size. Stays in the small-list regime where judge accuracy (95%) was actually measured. ≈ $0.2–0.5 per 1,000 statements at any scale.
- **No cosine failure modes**: no Hebrew synth lockout, no brief-embedding drift, no top-K opposites crowding. Pro/con falls out naturally — opposing statements share a topic cluster but form separate synths.
- Every statement ends in exactly one cluster and one synth (singleton synths allowed).

Failure modes to measure in simulation (in order of importance):
1. **Cluster representation = the summary trap.** The cluster step must show 2–3 raw exemplar statements per cluster, NOT a label/summary — judging summaries scored 70.1% vs 95.0% raw.
2. **Sticky, compounding routing errors.** A wrong cluster pick means the synth search happens in the wrong place → duplicate synth created elsewhere → every future similar statement has two plausible homes. No step ever looks across clusters, so structure only degrades. Needs a periodic repair pass (merge duplicate synths/clusters).
3. **Uncontrolled cluster granularity + arrival-order dependence.** "Create new cluster if none fits" is a fuzzy, unbenchmarked boundary — risk of fragmentation (hundreds of near-duplicate clusters) or mega-clusters (synth lists grow huge). First arrivals define the map; different replay order → different structure. Measure with order-shuffled replays.

Recommended amendments (keeps the approach, patches the holes):
- Use the embedding as a **ranker, not a filter**: order the cluster list by cosine and cap it, so the cluster step scales past hundreds of clusters. Ranking can't lock anything out the way the 0.85 cutoff did.
- Keep the **four-way verdict at the synth step** (same-meaning / same-topic / opposes / unrelated), so an opposing statement creates its synth *with a counter-edge* to the synth it opposes rather than sitting next to it unlinked.

### Living cluster labels (Tal, 2026-07-24)

Represent each cluster by its **10 most-centered statements** (nearest the embedding centroid). The judge routes by looking at those exemplars. When a new statement is attached, the LLM regenerates the label from the 10 exemplars + the new statement.

Why this is sound:
- **Re-grounding, not ratcheting**: the label is regenerated from raw statements every time — never rewritten from the previous label — so summary drift cannot compound through the label. This is the benchmark's "enrichment fix" (70.1% → 88.6%) applied continuously.
- **Centroid exemplars are stance-safe**: cosine can't tell pro from con, but a cluster is a *topic* — pro/con statements embedding near-identically means the centroid captures the topic exactly. Cosine's fatal weakness as a merge decision is harmless for picking topic exemplars.

Refinements:
1. **Route on exemplars, label as headline.** The cluster-step judge sees label + raw exemplar statements; raw statements decide (95% regime), label only orients. 3–5 exemplars per cluster may suffice for routing — ablate 3 vs 10 in the sim.
2. **Lazy label updates.** Only regenerate when the top-10 exemplar set actually changes (new statement enters top-10 or centroid shifts past a threshold). Most attaches change nothing → label maintenance is nearly free, not one extra LLM call per statement.
3. **Error legitimization (the real risk).** A misrouted statement that lands near the centroid becomes an exemplar; the label updates to accommodate it; the mistake is now written into the cluster's self-description, attracting more of the same. The living label cannot distinguish "cluster genuinely broadening" from "we filed something wrong" — the periodic repair pass is still required, slightly more than before.

---

## 8. Test recipe — condition E: corpus replay of configuration (e) on the 150-triplet pilot

**Status 2026-07-24:** runner written (`benchmark/run-sim-e.ts`), engine = §7 with both amendments (cosine as ranker, four-way synth verdict) + living labels. Judge model: `gpt-4o-mini` (cheap worker model), overridable with `--model`.

### What the test does (unlike conditions A–D, this is a growing corpus, not isolated triplets)

Per dataset:
1. **Phase A (seed):** all pilot anchors stream through the engine in file order, building clusters + synths from an empty store.
2. **Phase B (probe):** all matches + distractors stream through the same engine in a seeded shuffle (seed 20260724), attaching into the grown structure.

Engine per statement: cluster step (LLM vs living-label + 3 centroid exemplars per cluster, cosine-ranked, top 20) → synth step (LLM four-way vs synths in the chosen cluster, 2 member texts each) → centroid + top-10 exemplar refresh → label regenerated only when the exemplar set changed.

### Scoring (per triplet, written to `results/sim-e.jsonl`)
| field | meaning |
|---|---|
| `synthRecall` | match filed into its anchor's synth |
| `clusterRecall` | match filed into its anchor's cluster |
| `falseMerge` | distractor filed into its anchor's synth |
| `distractorSameCluster` | distractor in anchor's cluster (desired pro/con structure) |
| `counterEdgeToAnchor` | distractor's synth carries a counter-edge to anchor's synth |
| `tripletCorrect` | `synthRecall && !falseMerge` |

Per-dataset structure stats (cluster/synth counts, LLM calls by type, mean list sizes) go to `results/sim-e-datasets.jsonl`.

### Running

```bash
cd scientific-research/20206-07-16-Claim-regestry/benchmark
npx tsx run-sim-e.ts --sample results/pilot-ids.json     # the 150-triplet pilot
```

- Requires `OPENAI_API_KEY` in `functions/.env` (auto-loaded).
- Resumable **per dataset** (a partially-replayed dataset re-runs whole; only missing rows append). Embeddings cached in `results/claim-embeddings-cache.jsonl`.
- ~1,350 judge calls + label calls for the full pilot; a few dollars cents-range on gpt-4o-mini. Datasets replay in parallel, statements within a dataset sequentially (state mutates).
- Caveat: if a smoke run with `--limit` polluted `results/sim-e.jsonl`, delete it before the real run — partial datasets re-replay with a different corpus, which muddies scoring.

### Numbers to compare against (from §3)
- Judge-on-raw-text ceiling: 95.0% triplet accuracy, 2.1% distractor false-accept.
- Production cosine-only: ~0.5% triplet accuracy (embeddings can't see stance).
- Success gates for (e): tripletCorrect ≥ 90%, falseMerge ≤ 5%, and — new for corpus replay — cluster fragmentation sane (clusters ≪ statements) and `distractorSameCluster` high (pro/con lives inside topic clusters).

---

## 9. Where things stand in the conversation this came from

Agreed so far:
- Embedding cannot distinguish agree/disagree (0.5% on triplets); the judge can (95%+). So **no attach without a judge verdict** — that's the definition of ELJ.
- Cosine cutoffs are safe as *fetch floors*, dangerous as *decision thresholds*. 0.45 lost nothing in any language; 0.85 loses 29% of English matches and 100% of Hebrew.
- This document's engine is Tal's proposal to keep tiers AND judge everywhere. Next step: simulate it (see §5).
