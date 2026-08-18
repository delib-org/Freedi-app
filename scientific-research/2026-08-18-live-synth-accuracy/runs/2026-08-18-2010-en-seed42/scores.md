# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.067  (poor)    = 0.6·F1_synth + 0.4·F1_topic

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.000  R=0.000  F1=0.000   ARI=0.000
  pair recovery 0/50 ground-truth pairs merged (0.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        0 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.091  R=1.000  F1=0.167   ARI=0.000
  topics        1 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.06666666666666668,
  "grade": "poor",
  "synth": {
    "tp": 0,
    "fp": 0,
    "fn": 50,
    "precision": 0,
    "recall": 0,
    "f1": 0,
    "predictedCount": 0,
    "truthCount": 50,
    "ari": 0,
    "pairRecovery": "0/50",
    "pairRecoveryRate": 0,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 0,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 0,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 450,
    "fp": 4500,
    "fn": 0,
    "precision": 0.09090909090909091,
    "recall": 1,
    "f1": 0.16666666666666669,
    "predictedCount": 4950,
    "truthCount": 450,
    "ari": 0,
    "producedCount": 1,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 100,
    "total": 100,
    "rate": 1
  },
  "parameters": {
    "language": "en",
    "corpus": "scripts/seedSynthBenchmark.accuracy100.en.json",
    "corpusSha": "8fdcaccc66dd",
    "seed": 42,
    "synthesisOverrides": {},
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 2500,
    "maxWaitMs": 20000,
    "settleTimeouts": 0,
    "durationMs": 715145,
    "gitSha": "0c58e8a46",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
