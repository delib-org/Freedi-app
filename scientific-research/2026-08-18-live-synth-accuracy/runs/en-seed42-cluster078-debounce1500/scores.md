# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.592  (fair)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   31/50 pairs joined = 0.620   (31/50 joined cleanly, i.e. the pair and nothing else = 0.620)
  CLUSTER 0.435   = togetherness 0.340 x purity 0.752 (harmonic mean, averaged over the 10 themes)
  COMBINED 0.546  = 0.6·synth + 0.4·cluster

  per theme:   of its statements, how many landed in one group, and how clean was it
    digital-services          6/10 together, group size   7 -> purity 0.86  score 0.706
    health                    2/10 together, group size  10 -> purity 0.20  score 0.200
    transport                 2/10 together, group size   2 -> purity 1.00  score 0.333
    culture                   4/10 together, group size   4 -> purity 1.00  score 0.571
    public-safety             2/10 together, group size   4 -> purity 0.50  score 0.286
    jobs-and-economy          2/10 together, group size   2 -> purity 1.00  score 0.333
    housing                   8/10 together, group size  10 -> purity 0.80  score 0.800
    environment-and-waste     2/10 together, group size   2 -> purity 1.00  score 0.333
    education                 4/10 together, group size   6 -> purity 0.67  score 0.500
    parks-and-green-space     2/10 together, group size   4 -> purity 0.50  score 0.286

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.620  F1=0.765   ARI=0.764
  pair recovery 31/50 ground-truth pairs merged (62.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        31 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.738  R=0.213  F1=0.331   ARI=0.303
  topics        6 produced vs 10 expected

--- coverage ---
  97/100 statements (97.0%) ended up in some cluster; 3 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.5916730523627075,
  "grade": "fair",
  "direct": {
    "composite": 0.5459495798319328,
    "synthRate": 0.62,
    "synthCleanRate": 0.62,
    "pairsJoined": 31,
    "pairsJoinedClean": 31,
    "pairsTotal": 50,
    "clusterScore": 0.434873949579832,
    "clusterTogetherness": 0.33999999999999997,
    "clusterPurity": 0.7523809523809524,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "largestGroupHits": 6,
        "largestGroupSize": 7,
        "togetherness": 0.6,
        "purity": 0.8571428571428571,
        "score": 0.7058823529411764
      },
      {
        "theme": "health",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 10,
        "togetherness": 0.2,
        "purity": 0.2,
        "score": 0.20000000000000004
      },
      {
        "theme": "transport",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 2,
        "togetherness": 0.2,
        "purity": 1,
        "score": 0.33333333333333337
      },
      {
        "theme": "culture",
        "statements": 10,
        "largestGroupHits": 4,
        "largestGroupSize": 4,
        "togetherness": 0.4,
        "purity": 1,
        "score": 0.5714285714285715
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 4,
        "togetherness": 0.2,
        "purity": 0.5,
        "score": 0.28571428571428575
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 2,
        "togetherness": 0.2,
        "purity": 1,
        "score": 0.33333333333333337
      },
      {
        "theme": "housing",
        "statements": 10,
        "largestGroupHits": 8,
        "largestGroupSize": 10,
        "togetherness": 0.8,
        "purity": 0.8,
        "score": 0.8000000000000002
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 2,
        "togetherness": 0.2,
        "purity": 1,
        "score": 0.33333333333333337
      },
      {
        "theme": "education",
        "statements": 10,
        "largestGroupHits": 4,
        "largestGroupSize": 6,
        "togetherness": 0.4,
        "purity": 0.6666666666666666,
        "score": 0.5
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 4,
        "togetherness": 0.2,
        "purity": 0.5,
        "score": 0.28571428571428575
      }
    ]
  },
  "synth": {
    "tp": 31,
    "fp": 0,
    "fn": 19,
    "precision": 1,
    "recall": 0.62,
    "f1": 0.7654320987654321,
    "predictedCount": 31,
    "truthCount": 50,
    "ari": 0.7636043735076034,
    "pairRecovery": "31/50",
    "pairRecoveryRate": 0.62,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 31,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 62,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 96,
    "fp": 34,
    "fn": 354,
    "precision": 0.7384615384615385,
    "recall": 0.21333333333333335,
    "f1": 0.3310344827586207,
    "predictedCount": 130,
    "truthCount": 450,
    "ari": 0.30261437908496736,
    "producedCount": 6,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 97,
    "total": 100,
    "rate": 0.97
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
    "durationMs": 814686,
    "gitSha": "1e5444e7a",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
