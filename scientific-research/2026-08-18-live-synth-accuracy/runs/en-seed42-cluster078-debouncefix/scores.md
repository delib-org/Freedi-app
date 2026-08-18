# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.442  (poor)    = 0.6·F1_synth + 0.4·F1_topic

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.846  R=0.440  F1=0.579   ARI=0.576
  pair recovery 22/50 ground-truth pairs merged (44.0%)
  false merges  4 pair(s) wrongly merged, 4 of them within the same topic
  synths        21 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.838  R=0.138  F1=0.237   ARI=0.217
  topics        4 produced vs 10 expected

--- coverage ---
  65/100 statements (65.0%) ended up in some cluster; 35 left as singletons

--- worst false merges (first 8) ---
  environment-and-waste/compost-organic-waste ↔ environment-and-waste/recycling-pickup
     A: Create a dedicated food-waste stream that gets turned into compost.
     B: Provide weekly curbside pickup of recyclable materials.
  environment-and-waste/compost-organic-waste ↔ environment-and-waste/recycling-pickup
     A: Create a dedicated food-waste stream that gets turned into compost.
     B: Collect recycling from every doorstep once a week.
  environment-and-waste/compost-organic-waste ↔ environment-and-waste/recycling-pickup
     A: Set up separate collection of kitchen food scraps for composting.
     B: Provide weekly curbside pickup of recyclable materials.
  environment-and-waste/compost-organic-waste ↔ environment-and-waste/recycling-pickup
     A: Set up separate collection of kitchen food scraps for composting.
     B: Collect recycling from every doorstep once a week.

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.4420249096022498,
  "grade": "poor",
  "synth": {
    "tp": 22,
    "fp": 4,
    "fn": 28,
    "precision": 0.8461538461538461,
    "recall": 0.44,
    "f1": 0.5789473684210525,
    "predictedCount": 26,
    "truthCount": 50,
    "ari": 0.576017130620985,
    "pairRecovery": "22/50",
    "pairRecoveryRate": 0.44,
    "falseMerges": 4,
    "falseMergesWithinTopic": 4,
    "falseMergeRate": 0.15384615384615385,
    "producedCount": 21,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 44,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 62,
    "fp": 12,
    "fn": 388,
    "precision": 0.8378378378378378,
    "recall": 0.13777777777777778,
    "f1": 0.23664122137404578,
    "predictedCount": 74,
    "truthCount": 450,
    "ari": 0.21652421652421652,
    "producedCount": 4,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 65,
    "total": 100,
    "rate": 0.65
  },
  "parameters": {
    "language": "en",
    "corpus": "scripts/seedSynthBenchmark.accuracy100.en.json",
    "corpusSha": "8fdcaccc66dd",
    "seed": 42,
    "synthesisOverrides": {
      "clusterThreshold": 0.78
    },
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 2500,
    "maxWaitMs": 20000,
    "settleTimeouts": 0,
    "durationMs": 786767,
    "gitSha": "e73e8f222",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
