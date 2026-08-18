# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.066  (poor)    = 0.6·F1_synth + 0.4·F1_topic

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.000  R=0.000  F1=0.000   ARI=0.000
  pair recovery 0/50 ground-truth pairs merged (0.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        0 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.091  R=0.902  F1=0.165   ARI=0.000
  topics        1 produced vs 10 expected

--- coverage ---
  95/100 statements (95.0%) ended up in some cluster; 5 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-he-seed42",
  "language": "he",
  "statements": 100,
  "composite": 0.06608341810783316,
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
    "tp": 406,
    "fp": 4059,
    "fn": 44,
    "precision": 0.09092945128779395,
    "recall": 0.9022222222222223,
    "f1": 0.1652085452695829,
    "predictedCount": 4465,
    "truthCount": 450,
    "ari": 0.00004431150991468775,
    "producedCount": 1,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 95,
    "total": 100,
    "rate": 0.95
  },
  "parameters": {
    "language": "he",
    "corpus": "scripts/seedSynthBenchmark.accuracy100.he.json",
    "corpusSha": "9a5191bece66",
    "seed": 42,
    "synthesisOverrides": {},
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 2500,
    "maxWaitMs": 20000,
    "settleTimeouts": 0,
    "durationMs": 732407,
    "gitSha": "e73e8f222",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
