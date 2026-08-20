# Plan — fix the live clustering & synthesis defects the accuracy benchmark found

**Status:** ✅ **executed 2026-08-19.** English went **0.067 → 0.910** at shipped
thresholds, with the synthesis layer reproducing the corpus ground truth exactly
(50 syntheses, P = R = F1 = ARI = 1.000, zero false merges, 100/100 coverage).
Nothing deployed. Full results and findings in
`scientific-research/2026-08-18-live-synth-accuracy/RESULTS.md`.

**Written:** 2026-08-19. Self-contained — everything needed to start from a cold context.

---

## Outcome against the plan

| Step | Planned | What happened |
| --- | --- | --- |
| 1 — cohesion-gate topic attach, let clustered options pair | fixes D1 | ✅ Done, and it **regressed the score to 0.207** before it helped — see "what the plan got wrong" below. `8d1aadffc` |
| 2 — scope the spawn debounce | fixes D2 | ✅ Done, keyed per unordered pair. `8d1aadffc`. Note the debounce has **never fired in five runs** at shipped settings. |
| 3 — revisit set-aside statements | residual recall | ❌ **Withdrawn.** The raw data showed review-queued was not a sink: 35-36 of the 37 were rescued when their twin arrived, and it accounted for ~0 of the 19 missed pairs. Replaced by *never dropping a failed spawn*, which the same breakdown pointed at. |
| 4 — nest syntheses under themes | fixes D4, lifts the ceiling | ✅ Done. `a75a1ff84`, then rebuilt around an LLM judge in `7462ecee3`. |
| 5 — non-English to `text-embedding-3-large` | fixes D3 | ⏸ **Measured, not switched.** Hebrew twin visibility within `NEIGHBOR_LIMIT` goes 79/100 → **99/100**, nearest-neighbour 56 → **89**. Still needs a migration decision — the two models' vectors are not comparable. |
| 6 — confirm across seeds {42, 7, 1234} | generalise | ⏳ In progress. Everything above is **seed 42 only**. |

### What the plan got wrong, and what it could not have known

- **Step 1 was correct and made things worse.** Cohesion-gating the topic attach
  worked exactly as designed and dropped the score to 0.207, because it exposed a
  defect the plan never names: **pass ordering**. Topic attach ran before synth
  spawn, and a theme that already holds your twin always looks cohesive to you —
  its centroid contains your twin. In 17 of 23 topic attaches the member whose
  cosine justified the attach *was the statement's own twin*. Fixing the order was
  worth more than every threshold change combined (0.207 → 0.711).
- **Step 4's ceiling estimate was too pessimistic** — the plan put the cap at
  ≈0.73 with perfect syntheses. Actual, with nesting plus LLM theming plus
  consolidation: **0.910**.
- **The plan assumed the theme layer was a tuning problem.** It is not. Measured on
  the 50 synthesis centroids, same-theme pairs sit at median cosine 0.743 and
  different-theme at 0.670; the best single pairwise cut reaches F1 0.480, a better
  embedding model 0.535, and global clustering to the true k=10 scores 0.432 —
  *below* what greedy attach already achieved. Theme membership is a judgement, not
  a distance. That is what took topic F1 from 0.388 to 0.775.
- **Two measurement bugs each inverted a conclusion.** The reJudge pump was a
  hand-written copy of the code under test and silently stopped matching it; and
  the settle detector mistook emulator silence for completion, scoring three
  ground-truth pairs as failures that the pipeline had merged seconds after the
  export. Both failed *in the direction of looking plausible*. See RESULTS.md
  Finding 8.

### What is left

> **Update 2026-08-20.** Items 4 and 7 are done. Item 6 is NOT — its fix was
> built, measured on a full-corpus run, and **reverted for regressing**
> (0.910 -> 0.865); what survives is a much sharper account of why, in item 6
> below. Item 2 (Hebrew) had its central hazard removed and is now blocked only
> on a rollout decision, not on code.
>
> Best measured state remains the seed sweep: **0.884-0.910, mean ~0.900**, at
> shipped defaults.

1. **Seed sweep** {7, 1234} — in flight. Until it lands, 0.910 is seed 42's number.
2. **Hebrew** — the model switch is measured and the theme layer is now
   language-independent (the judge reads Hebrew), so Hebrew should benefit from
   everything above without the model change. The change is worth making anyway for
   the synth layer; it needs a migration strategy first.

   **The dangerous half is now handled (`f6e16cf30`).** The hazard was never the
   destination, it was the transition: a question holding both 3-small and
   3-large vectors ranks neighbours on a cosine with no meaning, and does so
   silently. Both read paths now honour the `embeddingModel` stamp that writes
   have carried all along — a stale vector reads as absent and gets regenerated,
   and stale neighbours are dropped from vector-search results (`findNearest`
   scores server-side, so they cannot be excluded before the fact). A missing
   stamp counts as compatible, so nothing re-embeds on deploy day. A switch now
   **degrades rather than corrupts**, and `vectorSearch.incompatibleModel` says
   by how much.

   **What is left is genuinely a decision, not code.** All three rollouts want
   the same next primitive — a per-question embedding model, so questions can
   move one at a time — and which one is right depends on how much live Hebrew
   data exists:

   | rollout | what it needs | trade |
   | --- | --- | --- |
   | **Re-embed per question** (recommended) | per-question model field + admin flow; `reEmbedQuestion` already exists and does the work | fix live questions one at a time, each verifiable before the next; no flag day |
   | New questions only | per-question model field, set at creation | safest; every Hebrew question already live keeps 56/100 twin visibility forever |
   | Global swap + backfill | flip the env var, re-embed everything | simplest to describe; with the guard above it now degrades instead of corrupting, but recall dips across every question at once |

   Cost is not a factor either way: 3-large is ~6.5× 3-small per token, which
   puts even 100k statements well under a dollar — a rounding error against the
   synthesis LLM calls, as the original plan noted.
3. **The reJudge merge gate is unproven.** Zero refusals because no duplicate
   synths arose for it to consider. Needs a corpus that produces duplicates.
4. ~~**`review-queued` is still ~34 per run** and nothing drains it.~~
   **Answered, in two opposite directions.** Not a recall problem: all 105 options
   queued across the three certified runs were subsequently placed by the pipeline
   itself, none left unplaced. But a real queue problem: because the rows were
   never closed, the queue an admin opens had a **100% false-positive rate**. A
   placement now resolves them. `c018fd495`, RESULTS.md Finding 12.
5. **Deploy** is still a separate, explicit decision — `npm run deploy:f:test`
   first, never straight to prod.
6. **Theme-count variance is STILL the one clear remaining defect.** The plan's
   diagnosis was wrong, and so was the fix — in different ways.

   *Wrong diagnosis:* raising `MAX_MERGES_PER_SWEEP` would have changed nothing.
   The pump logs show the judge being offered 1-3 groups per sweep, never
   approaching the cap of 8. That part is settled (RESULTS.md Finding 10).

   *Wrong fix:* showing the judge the proposals under each heading looked
   dominant offline on all three seeds, and **lost its live run** - seed 42
   0.910 -> 0.865, topic F1 0.775 -> 0.678. It hit the right heading count by
   over-merging into a catch-all. Reverted in `5f001e2a2`; RESULTS.md Finding 13.

   *The real lever, for whoever picks this up:* the offline replay ran the judge
   on each run's FINAL theme set (11 tidy headings) while the live sweep faces
   ~19 half-formed ones and merges 9 donors in a single pass. Any future attempt
   must be measured against THAT, not against the end state. And the target is
   accuracy, not volume - the failure mode is a heading that spans many topics,
   not one that stays too narrow.

   *Kept from the attempt:* each distinct theme set is judged once, since this
   sweep re-asks a non-deterministic model every 10 minutes forever and merges
   are irreversible. Not implicated in the regression.
7. ~~**Nobody has scored the merged TEXT.**~~ **Measured — and the news is
   good.** `textFidelity.mjs` (validated first against five known-answer fixtures
   in `textFidelity.selftest.mjs`) judges each member statement against the text
   its synthesis published. Across 300 member statements in three runs, **zero
   were lost** — no participant's ask vanished from the text that replaced it.
   What the text loses is specificity: 8–16 asks per 100 arrive generalised, and
   2 syntheses in 150 inflated scope. This is a **bound, not a verdict**: those
   runs predate the exporter carrying `description`, so it scores the title
   alone, which is the harshest possible test. `fb0c0cfb2`, RESULTS.md Finding 11.
   **Then the bound was closed:** driving the real compiled synthesis function
   over the same 50 pairs and judging the full text puts fidelity at **0.990** —
   the body does carry what the title generalised away. The defect that remained
   was **scope inflation**, 4 in 50, caused by the synthesis prompt forbidding
   invention and simultaneously ordering "who does what, on what timeline" from
   one-sentence inputs. Fixing that contradiction took scope inflation to **0/50**
   and fidelity to **1.000**, with no new refusals. `8d10ffd2f`, Finding 11b.
8. **Known harness flake:** on one seed-1234 attempt the emulator was killed
   mid-run and two statements were fed into a dead emulator. The attempt was
   discarded and the retry was clean, but the cause is not understood. Treat a
   run that ends abnormally as suspect until it is.

## Reproducing the numbers

The measured constants in the pipeline are justified by the offline scripts in
`scientific-research/2026-08-18-live-synth-accuracy/analysis/` — no emulator
needed. See that folder's README for which script produced which constant.

---

## 1. Background: what this system does

Freedi's live synthesis pipeline watches statements (options) arriving under a
question and, in real time, tries to organise them:

- **Synthesis ("synth")** — two or more statements that say *the same thing* get
  merged into one combined proposal, so participants don't vote on five wordings of
  one idea.
- **Topic cluster** — statements that are *related but distinct* get bundled under a
  theme label ("transport"), so the option list is browsable.

Both are stored as ordinary `Statement` documents with `isCluster: true`,
`integratedOptions: [memberIds]`, and `derivedByPipeline: 'synthesis' | 'topic-cluster'`.
**Membership lives only on the cluster document**, never on the member.

### Entry points

All three live triggers funnel into one function:

| Export | Trigger | Handler |
| --- | --- | --- |
| `liveSynthOnOptionCreate` | `onDocumentCreated /statements/{id}` | `functions/src/synthesis/liveSynth/onOptionCreateLive.ts` |
| `liveSynthOnOptionUpdate` | `onDocumentUpdated` | `.../onOptionUpdateLive.ts` |
| `liveSynthOnOptionEvaluationChange` | `onDocumentUpdated` | `.../onOptionEvaluationChange.ts` |

→ **`runSinglePipeline`** in `functions/src/synthesis/pipeline/runSinglePipeline.ts`
(the file that matters most; ~640 lines).

### What `runSinglePipeline` does, in order

1. Guards: skip clusters, skip options already in a cluster
   (`findClustersContainingMember`), check `enabled`, check `minEvaluators`.
2. `ensureEmbedding` — embeds as `"Question: <parent text>\nAnswer: <option>"`
   (text-embedding-3-small, 1536-d). **The context prefix is mandatory** — a
   contextless vector lands in a different subspace.
3. Vector search for up to `NEIGHBOR_LIMIT = 10` neighbours above `reviewLowerBound`.
4. Build "best evidence" per candidate cluster = `max(direct cluster cosine, best member cosine)`.
5. **Pass 1 — synth attach** if best evidence ≥ `attachThreshold`, gated by a
   cohesion check (`SYNTH_COHESION_QUORUM = 0.5`).
6. **Pass 2 — topic-cluster attach** if best evidence ≥ `clusterThreshold`.
   Deliberately **not** cohesion-gated ("lenient").
7. **Pass 3 — spawn** from the top *plain* option (`topPlainOption`), band-routed by
   `routeByCosine`. Calls `generateSynthesizedProposal`; on `cannotSynthesize`
   falls back to `generateTopicLabel` and spawns a topic cluster instead.
8. **Pass 4 — review queue** (`_liveSynthCandidates`), **Pass 5 — singleton**.

### Thresholds (`functions/src/synthesis/pipeline/types.ts`)

```
attachThreshold  0.85   ≥ this → near-duplicate, attach/spawn synth
synthLowerBound  0.78   [0.78, 0.85) → spawn synth (LLM may refuse)
clusterThreshold 0.60   [0.60, 0.78) → spawn topic cluster directly
reviewLowerBound 0.45   [0.45, 0.60) → admin review
```

`loadSynthesisSettingsFromStatement` (`.../loadSynthesisSettings.ts:122`) merges a
per-question `statementSettings.synthesis` block over these, so **thresholds are
tunable per question with no code change** — the benchmark harness uses this.

### Other facts worth knowing before touching anything

- Models are OpenAI, not Gemini (`functions/src/config/gemini.ts` delegates to
  `config/openai-chat`): `gpt-5.6-terra` heavy, `gpt-5.6-luna` fast.
- Synthesis prompts are inline template literals in
  `functions/src/services/integration-ai-service.ts`
  (`generateSynthesizedProposal` ~line 426, `generateTopicLabel` ~line 573).
- The convergence layer is `onSchedule` and **does not fire in the emulator**:
  `processSynthesisQueue` (1 min), `fn_synthesisBulkFlush` (2 min),
  `fn_synthesisReJudge` (10 min, cross-synth merge at cosine ≥ 0.82),
  `fn_clusterRecomputeFlush` (1 min).
- `SYNTHESIS_LIVE_SYNTH_ENABLED` must be true or every trigger returns immediately
  (`functions/src/synthesis/featureFlags.ts`).
- Live synth defaults **ON** only for Mass-Consensus questions
  (`MC_DEFAULT_SYNTHESIS_SETTINGS`), OFF elsewhere.

---

## 2. Background: the benchmark

Built 2026-08-18. One civic question, **100 statements = 10 themes × 5 twin-groups ×
2 near-paraphrases**. Ground truth: 50 syntheses inside 10 themes. English plus a
sentence-by-sentence Hebrew translation with identical structure and identical
English labels, so the two are directly comparable.

Statements are fed into the Firestore emulator **one at a time in seeded-shuffled
order** so the real triggers do the work.

| Path | Role |
| --- | --- |
| `scripts/seedSynthBenchmark.accuracy100.{en,he}.json` | frozen corpora |
| `scripts/preflightCorpusCosines.ts` | cosine geometry + separability; **no emulator needed** |
| `scripts/runAccuracyBenchmark.ts` | the emulator harness |
| `scientific-research/2026-08-18-live-synth-accuracy/score100.mjs` | scorer |
| `.../selftest.mjs` | verifies the scorer against fixtures with known answers |
| `.../compare.mjs` | EN vs HE table |
| `.../README.md`, `.../RESULTS.md` | methodology and the full findings write-up |
| `.../runs/` | 7 completed runs with raw data |

### The two scores

**Synth** — of the 50 twin pairs, how many were joined (and how many *cleanly*,
meaning the synthesis holds that pair and nothing else).

**Cluster** — what fraction of a theme's 10 statements ended up together in **one**
group that actually *represents* that theme, meaning the group is majority-this-theme
(> 50%). Averaged over the 10 themes.

> Two rules matter and both were chosen deliberately:
>
> - **A group must be valid, not merely containing.** Scored on togetherness alone
>   ("did the 10 end up together?"), the catastrophic run that put all 100 statements
>   in ONE cluster scores a perfect **1.000** for every theme, since that cluster does
>   contain all 10 of each. The majority rule makes it score **0.000** — a 100-member
>   blob represents nothing.
> - **Credit goes to the largest single representing group, not the union.** A theme
>   whose 5 twin pairs merged perfectly but were never assembled under one heading
>   scores 0.2, not 1.0. Taking the union would score it 1.0 and hide exactly the
>   missing synth-to-theme nesting (defect D4) that this benchmark exists to expose.
>
> The synth half likewise uses the **clean** join rate: a twin pair buried inside a
> 6-member blob was not "joined correctly".

Headline = `0.6 × synth + 0.4 × cluster`. The scorer also reports pairwise
precision/recall/F1 and ARI as a secondary view.

### Running it

```bash
# 0. once — env/.env.dev needs OPENAI_API_KEY and SYNTHESIS_LIVE_SYNTH_ENABLED=true
#    (functions/.env is GENERATED — editing it directly does not survive)
npm run env:dev

# 1. always verify the scorer before trusting a number
node scientific-research/2026-08-18-live-synth-accuracy/selftest.mjs

# 2. corpus geometry — no emulator, ~30s, cached
npx tsx scripts/preflightCorpusCosines.ts scripts/seedSynthBenchmark.accuracy100.en.json
#    flags: --no-context, --model=NAME, --dimensions=N, --json

# 3. emulators — BOTH firestore and functions, or no trigger fires
cd functions && npm run build && cd ..
npm run deve

# 4. run (~13 min per language) and score
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/runAccuracyBenchmark.ts scripts/seedSynthBenchmark.accuracy100.en.json --seed=42
node scientific-research/2026-08-18-live-synth-accuracy/score100.mjs <run-folder>
```

Harness flags: `--seed`, `--set key=value` (repeatable, per-question synthesis
settings), `--limit=N` (smoke test), `--min-wait-ms`, `--max-wait-ms`, `--out=DIR`.

> **Emulator gotcha, cost me an hour.** The functions emulator serves whichever
> worktree launched it. Tal's suite on the standard ports was serving the
> `agora-voting` worktree, so it ran the wrong code. Don't take it over — write an
> alt-port config and run a second suite:
> `npx firebase emulators:start --config firebase.altports.json --only firestore,functions,auth --project freedi-test`
> (ports 8181 / 5101 / 9399 were free; the file is gitignored.)

---

## 3. Results measured so far

| Run | Lang | Settings | Synth (clean) | Cluster | Score |
| --- | --- | --- | --- | --- | --- |
| `2026-08-18-2010-en-seed42` | en | shipped defaults | 0/50 = 0.00 | 0.000 | **0.000** |
| `en-seed42-cluster078` | en | `clusterThreshold=0.78` | 20/50 = 0.40 | 0.270 | **0.348** |
| `en-seed42-cluster078-debouncefix` | en | + defer debounced spawns | 20/50 = 0.40 | 0.310 | **0.364** |
| `en-seed42-cluster078-debounce1500` | en | + `SYNTHESIS_SPAWN_DEBOUNCE_MS=1500` | 31/50 = 0.62 | 0.340 | **0.508** |
| `he-seed42-defaults` | he | shipped defaults | 0/50 = 0.00 | 0.000 | **0.000** |
| `he-seed42-cluster078-debounce1500` | he | the English fixes | 0/50 = 0.00 | 0.000 | **0.000** |
| `he-seed42-large-cluster084` | he | + `text-embedding-3-large`, bands 0.84 | 14/50 = 0.28 | 0.380 | **0.320** |

Per-theme detail for the best English run shows the nesting gap directly — six of ten
themes read `2/10`, meaning the only grouping standing for that theme is a single
merged twin pair, with the theme's other four ideas never gathered around it:

```
housing                8/10   biggest representing group 8/10
digital-services       6/10   biggest representing group 6/7
culture                4/10   biggest representing group 4/4
education              4/10   biggest representing group 4/6
transport              2/10   biggest representing group 2/2
jobs-and-economy       2/10   biggest representing group 2/2
environment-and-waste  2/10   biggest representing group 2/2
health                 2/10   biggest representing group 2/10
public-safety          2/10   biggest representing group 2/4
parks-and-green-space  2/10   biggest representing group 2/4
```

### Corpus geometry (pre-flight, before any pipeline run)

|  | English | Hebrew |
| --- | --- | --- |
| within-pair cosine (median) | 0.898 | 0.869 |
| cross-theme cosine (median) | 0.634 | **0.779** |
| twin is nearest neighbour | **100/100** | **56/100** |
| twin inside `NEIGHBOR_LIMIT`=10 | 100/100 | **79/100** |
| best F1 any single cosine cut could reach | 0.990 | **0.342** |
| same, with `text-embedding-3-large` @1536 | 1.000 | 0.774 (separability 88/100) |

**The English corpus is provably clean** — every statement's twin is its nearest
neighbour, so any English failure is the mechanism's, not the dataset's.

---

## 4. The defects

### D1 — topic clusters swallow everything, and cluster membership permanently forecloses synthesis  ⚠ NOT FIXED

**Symptom.** At shipped defaults: 1 spawn, 98 attaches, **zero syntheses**, one
topic cluster holding all 100 statements. Both languages.

**Mechanism, three parts compounding:**

1. Pass 2 attaches on `bestSimilarity ≥ clusterThreshold`, where best evidence is
   `max(direct, best member)` — so **one** member matching at 0.60 pulls the option
   in. Pass 2 is explicitly not cohesion-gated.
2. Because every statement is embedded under the same question prefix, the whole
   cosine floor is lifted: **80% of English cross-theme pairs and 100% of Hebrew
   ones clear 0.60** (English cross-theme min 0.505, Hebrew 0.639). So nearly every
   arriving statement matches the existing cluster somewhere.
3. Once a statement is in *any* cluster it is excluded from
   `topPlainOption` (`runSinglePipeline.ts:531`) and skipped by the
   `findClustersContainingMember` guard — so **its twin can never spawn a synthesis
   from it.** One early topic cluster starves the synthesis layer permanently.

Part 3 is the deep one and it also explains the residual misses at
`clusterThreshold=0.78`: whenever twin A lands in a small topic cluster first, twin
B can no longer pair with it. **Topic clusters and syntheses currently compete for
the same statements instead of nesting.**

**Note:** `types.ts` justifies the 0.65→0.60 change with an estimated cross-theme
range of 0.30–0.65. Real measurement on a single-question civic corpus is
0.505–0.786 (en) / 0.639–0.912 (he). The gate was tuned against a range the
production embedding contract does not produce.

**Currently only worked around** by passing `--set clusterThreshold=0.78`. That is a
benchmark setting, not shipped, and it is language-specific — it does nothing for
Hebrew, whose cross-theme median is already 0.779.

### D2 — spawn debounce is per-question, not per-cluster  ◑ PARTIALLY FIXED

**Symptom.** With D1 worked around, English still found only 20/50 pairs. Audit
accounting was exact: **45 spawn attempts = 24 spawned + 21 debounced**, and 45 is
precisely the number of pairs above `attachThreshold`. The pipeline found nearly
every pair and discarded half.

**Mechanism.** `functions/src/synthesis/pipeline/debounce.ts` locks on `parentId`
for `SPAWN_DEBOUNCE_MS` (15s). So spawning a transport pair blocks an unrelated
housing pair. Its stated purpose — stop a burst of near-identical options each
spawning a duplicate cluster — only needs to cover the gap between a spawn
committing and the new cluster becoming visible to vector search; after that Pass
1/2 attach handles duplicates on its own.

**Already fixed:** a debounced spawn used to be **silently dropped** —
`runSinglePipeline` runs once per option create and nothing re-triggered the option,
so the code comment's "falls through on the next tick" was false. `deferSpawnAfterDebounce`
now enqueues it via `enqueueItem` (deterministic id, so idempotent).

**Still broken:** deferring alone bought only +2 pairs, because
`drainSynthesisQueue` processes a batch in a tight loop — the first retry spawns,
re-arms the 15s window, and re-blocks its own batch. Shortening the window to 1.5s
via the new `SYNTHESIS_SPAWN_DEBOUNCE_MS` override took English 0.442 → 0.546 and
dropped debounces to zero, which confirms the window was the binding constraint.
**1.5s is a probe to size the headroom, not a recommendation.**

### D3 — `text-embedding-3-small` is poor at Hebrew  ◑ MEASURED, SWITCH NOT MADE

The English fixes moved Hebrew **not at all** (0.066 → 0.066). Hebrew's cross-theme
median (0.779) sits above the 0.78 gate, so the black hole survives, and no
threshold can fix it: only 56/100 Hebrew twins are nearest neighbours and 21 twins
fall outside the 10-neighbour window entirely, making them structurally invisible.

Ruled out: not the corpus (faithful translation of a 100/100 English corpus), not
the question prefix (`--no-context` leaves Hebrew at 57/100).

`text-embedding-3-large` at 1536 dimensions lifts Hebrew separability to 88/100 and
the live run to 0.369 — the only lever that moved Hebrew at all. English improves
too (pre-flight F1 0.947 → 0.990).

**Already fixed:** `OPENAI_EMBEDDING_MODEL` env override, and both
`openai.embeddings.create` calls now pin `dimensions: EMBEDDING_DIMENSIONS` —
without that a wider model silently breaks the `"dimension": 1536` vector indexes
in `firestore.indexes.json`. The misleading "good multilingual support (Hebrew,
Arabic, etc.)" comment is corrected with the measured numbers.

**Not done:** actually switching, and the migration question below.

### D4 — no synthesis → theme nesting  ⚠ NOT FIXED (caps the score)

`spawnClusterFromPair` only ever puts plain options into `integratedOptions`; a
synthesis is never placed inside a topic cluster. So five distinct transport ideas
never get assembled under "transport".

**This sets the ceiling.** With all 50 pairs merged perfectly and no nesting, the
cluster half scores ~0.20–0.33 and the headline caps at **≈0.68–0.73**. With every pair merged cleanly and no nesting, the headline reaches
0.6 x 1.00 + 0.4 x ~0.34 = **0.736** and cannot go higher.

Visible per theme in the best English run — five themes read
`2/10 together, group of 2, purity 1.00`: a perfectly clean merged pair, and nothing
ever gathered the theme's other four ideas around it.

---

## 5. The plan

Ordered by measured value per unit of risk. **Re-run the benchmark after each step**
— one lever at a time, same seed, and append a row to `RESULTS.md`.

### Step 1 — make topic attach cohesive, and let clustered options still pair  (fixes D1)

The single highest-value change: English 0.073 → 0.391 came from merely working this
around with a threshold.

Two edits in `functions/src/synthesis/pipeline/runSinglePipeline.ts`:

**1a. Cohesion-gate Pass 2.** Pass 1 already refuses an attach when the newcomer
matches one member but not the cluster as a whole (`assessCohesion` /
`passesCohesionGate` from `./clusterCohesion`, quorum `SYNTH_COHESION_QUORUM = 0.5`).
Apply the same gate to the topic-cluster attach, with its own constant
(`TOPIC_COHESION_QUORUM`, start at 0.5). This directly kills "one member match at
0.60 pulls in the world" while leaving genuine theme attaches intact.

**1b. Stop cluster membership from foreclosing synthesis.** Today `topPlainOption`
skips any option that is a member of a candidate cluster, and the top-of-pipeline
guard skips any option already clustered. Both were written to prevent
double-claiming, which is a real concern — but they also make the first cluster to
touch a statement its permanent owner.

Narrow both to what they actually need to prevent: a statement that belongs only to
a **topic cluster** should still be eligible to form a **synthesis** with a twin.
Concretely, allow `topPlainOption` to select an option whose only membership is a
topic cluster, and on a successful synth spawn, move that member out of the topic
cluster into the new synthesis (and, once Step 4 lands, place the synthesis into the
topic cluster).

**Risk:** double-claiming is exactly the bug `findClustersContainingMember` was
added to fix. Keep the guard for synth→synth and re-verify with the existing
`cluster-membership idempotence` tests in
`functions/src/synthesis/__tests__/runSinglePipeline.test.ts` (22 tests, all passing
today — do not let any regress).

**Verify:** English at shipped `clusterThreshold=0.60` should now avoid the mega
cluster. Target: synth ≥ 0.40 and cluster purity ≥ 0.6 *without* the 0.78 override.

### Step 2 — scope the spawn debounce to the cluster, not the question  (fixes D2)

Worth 0.442 → 0.546 in the crude version.

In `functions/src/synthesis/pipeline/debounce.ts`, key `_liveSynthDebounce` on
something narrower than `parentId` so that spawning one pair cannot block an
unrelated one. Options, cheapest first:

- Key on the **sibling pair** (`sorted(optionId, siblingId)`) — prevents the exact
  duplicate-spawn race the debounce was written for and nothing else.
- Key on a coarse **semantic bucket** (e.g. the sibling's nearest existing cluster)
  if you want burst protection for genuinely similar options.

Keep the `SYNTHESIS_SPAWN_DEBOUNCE_MS` override. Keep `deferSpawnAfterDebounce` —
even a correctly-scoped debounce should defer rather than drop.

**Verify:** debounce count in the emulator log should fall to ~0 while duplicate
syntheses stay at 0. Target: English synth ≥ 0.85 with clean-join rate ≥ 0.95.

### Step 3 — revisit statements that were set aside  (residual recall)

37 statements ended in `review-queued` in the best English run. When a statement
arrives before its twin, queueing it is the right call at that moment; the gap is
that nothing reconsiders it once the twin shows up.

Note Steps 1b and 2 may fix most of this on their own — a review-queued option is
still a plain option and *should* already be spawnable from. **Re-measure before
building anything here.** If a gap remains, the cheap fix is: when a new option's
vector search returns a previously review-queued option above `synthLowerBound`,
enqueue that option for reprocessing too.

### Step 4 — nest syntheses under themes  (fixes D4, lifts the ceiling)

The only change that can take the score above ~0.73. This is a **design decision**,
not tuning — get agreement before building.

The shape: after a synthesis is spawned or attached, place it into the topic cluster
that matches its centroid (creating one if needed), by appending the synthesis's
`statementId` to the topic cluster's `integratedOptions`. The data model already
supports it — the scorer and the app's 3-level view both read a cluster whose
`integratedOptions` contains other cluster ids. `scripts/seedSynthBenchmark.ts` has
a `linkSynthsToTopics()` that produces this shape, but it matches by ground-truth
labels, so it is a reference for the *shape only*, never for the logic.

Decide explicitly: does a statement then live in the synthesis only, with the theme
reached transitively? (Recommended — it keeps single ownership and matches how the
scorer resolves nested membership.)

### Step 5 — move non-English questions to `text-embedding-3-large`  (fixes D3)

Hebrew 0.073 → 0.523 with no other change. The plumbing is already in place; what
remains is the rollout decision.

**The migration problem, which must be answered first:** vectors from 3-small and
3-large are **not comparable**. A question holding a mix would produce meaningless
cosines. Options:

- **New questions only**, stamping the model on the question document and reading it
  back when embedding. Safest; leaves existing questions on 3-small.
- **Re-embed per question** on switch — `regenerateEmbedding` / `generateBulkEmbeddings`
  / `reEmbedQuestion` callables already exist in `functions/src/index.ts`.
- Global swap + full backfill. Highest risk; needs a cost estimate first.

Cost: 3-large is roughly 6× per token, but embeddings are a rounding error next to
the synthesis LLM calls (~60–120 heavy calls per 100 statements).

**Then retune the Hebrew bands.** Precision was 0.293 at the 0.84 cut I picked
quickly — only 14 of 27 joined pairs were clean. Hebrew's within-pair p10 (0.814)
and cross-theme max (0.850) still overlap under 3-large; the pre-flight puts the
best single cut at F1 0.774, so most of that precision is recoverable by choosing
the band properly. Use `preflightCorpusCosines.ts` to pick it rather than guessing.

### Step 6 — confirm and generalise

- Re-run **both** languages at seeds {42, 7, 1234}; arrival order matters and a
  single seed can flatter a change.
- Regenerate `COMPARISON.md` via `compare.mjs`.
- Only then consider changing the shipped defaults in `types.ts`, and record the
  measured justification in the docstring (the current one cites a cosine range that
  does not occur in practice).
- Deploy is a separate, explicit decision — `npm run deploy:f:test` first, never
  straight to prod, and note that `deploy:f:*` aborts if the deployed project has
  functions no longer in source.

---

## 6. Targets

| Milestone | English | Hebrew |
| --- | --- | --- |
| today | 0.508 | 0.320 |
| after Steps 1–3 | ≥ 0.55, at **shipped** thresholds | — |
| after Step 5 | — | ≥ 0.45 with clean-join ≥ 0.9 |
| after Step 4 | ≥ 0.85 | ≥ 0.80 |

Steps 1–3 raise the synth half; the cluster half stays near 0.34 until Step 4 nests
syntheses under themes, which is what unlocks the 0.85 targets.

A note on reading the numbers: **precision has been 1.000 for English at every
stage** — every failure so far has been "missed a pair", never "merged the wrong
things". Watch that it stays that way; a change that lifts recall while introducing
false merges is not an improvement.

---

## 7. Things that will bite you

- `functions/.env` is **generated**. Edit `env/.env.dev`, then `npm run env:dev`.
- Scheduled functions don't fire in the emulator. The harness pumps
  `functions/scripts/drainSynthesisQueue.ts` and `runReJudgeMerge.ts` itself.
  `fn_clusterRecomputeFlush` is deliberately **not** pumped — it recomputes
  evaluation aggregates and this benchmark submits no evaluations.
- The functions emulator serves whichever worktree launched it. Verify with
  `lsof -p <pid> | grep cwd` before trusting a run.
- `createStatementObject` must be imported from
  `packages/shared-types/src/models/statement/StatementUtils` — the built package
  root does not export it (stale dist).
- ESLint doesn't cover `scripts/` (pre-existing for every file there). Typecheck
  with `npx tsc --noEmit` from `functions/` instead.
- Rebuild functions (`cd functions && npm run build`) **and restart the emulator**
  after any pipeline edit, or you will benchmark the old code.
- `npm run build` in `functions/` repacks `freedi-shared-types-1.0.2.tgz` and
  touches `package-lock.json`. Revert those before committing.

---

## 8. Commits so far (all on `dev`, none deployed)

```
28f30f645  corpora + geometry pre-flight
0c58e8a46  harness + scorer + study docs
e73e8f222  English baseline 0.067, zero syntheses
1e5444e7a  fix: stop dropping debounced spawns; make window overridable
e8e992c8a  debounce window was the recall ceiling (0.067 -> 0.592 pairwise)
cb87b2685  Hebrew needs a better embedding model, not better thresholds
8946121a9  direct countable accuracy metric alongside pairwise F1
```

Production files touched: `runSinglePipeline.ts` (`deferSpawnAfterDebounce`),
`debounce.ts` (env override), `embedding-service.ts` (model override + pinned
dimensions + corrected comment). Everything else is benchmark infrastructure.
