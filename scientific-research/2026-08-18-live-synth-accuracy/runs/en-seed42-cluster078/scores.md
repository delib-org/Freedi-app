# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.429  (poor)    = 0.6·F1_synth + 0.4·F1_topic

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.400  F1=0.571   ARI=0.569
  pair recovery 20/50 ground-truth pairs merged (40.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        20 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.778  R=0.124  F1=0.215   ARI=0.194
  topics        4 produced vs 10 expected

--- coverage ---
  62/100 statements (62.0%) ended up in some cluster; 38 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.4286808976464149,
  "grade": "poor",
  "synth": {
    "tp": 20,
    "fp": 0,
    "fn": 30,
    "precision": 1,
    "recall": 0.4,
    "f1": 0.5714285714285715,
    "predictedCount": 20,
    "truthCount": 50,
    "ari": 0.5689404934687954,
    "pairRecovery": "20/50",
    "pairRecoveryRate": 0.4,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 20,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 40,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 56,
    "fp": 16,
    "fn": 394,
    "precision": 0.7777777777777778,
    "recall": 0.12444444444444444,
    "f1": 0.21455938697318008,
    "predictedCount": 72,
    "truthCount": 450,
    "ari": 0.19435512683101105,
    "producedCount": 4,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 62,
    "total": 100,
    "rate": 0.62
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
    "durationMs": 777685,
    "gitSha": "e73e8f222",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
