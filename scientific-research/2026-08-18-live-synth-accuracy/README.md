# Live clustering & synthesis accuracy benchmark (EN / HE)

A repeatable measurement of how well the **live** synthesis pipeline reconstructs a
known structure from statements arriving one at a time, in English and Hebrew, so
the mechanism can be tuned against a number instead of an impression.

## The test

One civic question — *"What should our city do to improve residents' quality of
life?"* — answered by **100 statements** arranged as:

```
10 topics  ×  5 synth-groups  ×  2 near-paraphrases  =  100 statements
```

Ground truth: **50 syntheses** (each paraphrase pair should merge into one) grouped
into **10 topic clusters** (the 5 synths of a theme belong together).

The Hebrew corpus is a sentence-by-sentence translation with an identical structure
and identical English labels, so the two runs are directly comparable and language
is the only intended variable.

Statements are fed into the Firestore emulator **one at a time in seeded-shuffled
order**, so the real `liveSynthOnOptionCreate` → `runSinglePipeline` path does the
work. Shuffling matters: the older seeder fed all paraphrases of a synth
consecutively, which makes attach decisions much easier than reality.

## Headline metric

```
ACCURACY = 0.6 · F1_synth + 0.4 · F1_topic
```

Both terms are **pairwise** F1 over all C(100,2) statement pairs — predicted
positive when two statements share a produced cluster. Pairwise degrades smoothly,
so an improvement loop can see progress; the sibling 2026-06-14 study's bijection
checks are pass/fail and saturate at 0 on a corpus this size. Coverage folds into
recall (an unclustered statement produces no positive pairs) and over-merging folds
into precision, so the single number cannot be gamed by merging everything.

Bands: ≥0.90 excellent · 0.75–0.90 good · 0.55–0.75 fair · <0.55 poor.

Reported alongside it: pair-recovery rate (of the 50 pairs), false-merge count and
rate, fragmentation, coverage, and ARI at both levels.

## Files

| file | role |
| --- | --- |
| `../../scripts/seedSynthBenchmark.accuracy100.en.json` | frozen English corpus |
| `../../scripts/seedSynthBenchmark.accuracy100.he.json` | frozen Hebrew corpus |
| `../../scripts/preflightCorpusCosines.ts` | corpus geometry / separability report (no emulator) |
| `../../scripts/runAccuracyBenchmark.ts` | the emulator harness |
| `score100.mjs` | scorer → `scores.md` in a run folder |
| `selftest.mjs` | verifies the scorer against fixtures with known scores |
| `compare.mjs` | EN vs HE table → `COMPARISON.md` |
| `runs/` | one folder per run: `statements.json`, `results.json`, `scores.md` |

## Running it

```bash
# 0. once — OPENAI_API_KEY and SYNTHESIS_LIVE_SYNTH_ENABLED=true in env/.env.dev
#    (functions/.env is GENERATED; editing it directly does not survive)
npm run env:dev

# 1. verify the scorer before trusting any number
node scientific-research/2026-08-18-live-synth-accuracy/selftest.mjs

# 2. corpus geometry — no emulator, no Firestore needed
npx tsx scripts/preflightCorpusCosines.ts scripts/seedSynthBenchmark.accuracy100.en.json
npx tsx scripts/preflightCorpusCosines.ts scripts/seedSynthBenchmark.accuracy100.he.json

# 3. emulators (Firestore + Functions both required, or no trigger ever fires)
npm run deve
#    If another worktree already owns the standard ports, start a second suite
#    instead of taking the first one over — the functions emulator serves
#    whichever worktree launched it, so a stale one runs the wrong code:
#      python3 -c "…"  # write firebase.altports.json with free ports
#      npx firebase emulators:start --config firebase.altports.json \
#        --only firestore,functions,auth --project freedi-test

# 4. run + score
FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
  npx tsx scripts/runAccuracyBenchmark.ts scripts/seedSynthBenchmark.accuracy100.en.json --seed=42
node scientific-research/2026-08-18-live-synth-accuracy/score100.mjs runs/<folder>

# 5. compare languages
node scientific-research/2026-08-18-live-synth-accuracy/compare.mjs runs/<en> runs/<he>
```

Cost and time: roughly 60–120 LLM calls and 12–15 minutes per language per run.

## Tuning without editing code

`loadSynthesisSettingsFromStatement` merges `statementSettings.synthesis` from the
question document over the defaults, so the harness can set any threshold per run:

```bash
npx tsx scripts/runAccuracyBenchmark.ts <corpus> --set attachThreshold=0.83 --set claimRegistryEnabled=true
```

Tunable this way: `attachThreshold`, `synthLowerBound`, `clusterThreshold`,
`reviewLowerBound`, `minEvaluators`, `minConsensus`, `claimRegistryEnabled`.

Needs a code change: `SYNTH_COHESION_QUORUM` and `NEIGHBOR_LIMIT`
(`functions/src/synthesis/pipeline/runSinglePipeline.ts`),
`REJUDGE_MERGE_THRESHOLD` (`functions/src/synthesis/scheduled/fn_synthesisReJudge.ts`),
the prompts in `functions/src/services/integration-ai-service.ts`, and the
embedding model in `functions/src/services/embedding-service.ts`.

## What the pre-flight already established

Measured before any pipeline run, with production embedding context and
`text-embedding-3-small`:

| | English | Hebrew |
| --- | --- | --- |
| within-pair cosine (median) | 0.898 | 0.869 |
| cross-synth, same topic (median) | 0.705 | 0.800 |
| cross-topic (median) | 0.634 | **0.779** |
| ground-truth partner is nearest neighbour | **100/100** | **56/100** |
| partner inside `NEIGHBOR_LIMIT`=10 | 100/100 | **79/100** |
| pairwise F1 at the shipped 0.85 threshold | 0.947 | 0.183 |
| best F1 any single cosine cut could reach | 0.990 | **0.342** |

Three things follow, and they shape what "improving the mechanism" means:

1. **Hebrew is capped by the embedding model, not by the thresholds.** The best
   possible single cut scores 0.342, so no `--set` experiment can rescue it. Only
   21 of 100 Hebrew partners even land inside the neighbour window the pipeline
   looks at.

2. **It is not the question-context prefix.** Embedding bare statements
   (`--no-context`) leaves Hebrew separability at 57/100 while English stays at
   99/100. The prefix compresses the absolute scale but does not change the
   ordering, so the ranking failure is intrinsic to how the model represents
   Hebrew.

3. **`text-embedding-3-large` largely fixes it** — Hebrew separability 56→89/100,
   F1 at the current threshold 0.183→0.756; English 0.947→0.990. The shipped 0.85
   attachThreshold is already near-optimal for both under that model, so it is a
   drop-in change rather than a retune. This is the single highest-value lever
   found so far and it costs ~6× more per embedding on a component that is a
   rounding error next to the synthesis LLM calls.

A fourth, smaller finding: the `clusterThreshold` docstring in
`functions/src/synthesis/pipeline/types.ts` predicts cross-topic cosines of
0.30–0.65, but a real single-question civic corpus measures 0.505–0.786 in English
and 0.639–0.912 in Hebrew. Because every statement is embedded under the same
question prefix, 80% of English cross-topic pairs and 100% of Hebrew ones clear the
0.60 gate — so topic clustering is expected to over-merge badly at defaults.
