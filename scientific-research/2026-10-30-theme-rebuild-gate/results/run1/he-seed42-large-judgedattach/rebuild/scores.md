# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.890  (good)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   45/50 pairs joined = 0.900   (45/50 joined cleanly, i.e. the pair and nothing else = 0.900)
  CLUSTER 0.820   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.868  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          6/10  in  6 representing group(s); biggest group touching it: 6/6  score 0.600
    health                    8/10  in  7 representing group(s); biggest group touching it: 8/8  score 0.800
    transport                 8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    culture                  10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    public-safety             8/10  in  5 representing group(s); biggest group touching it: 8/8  score 0.800
    jobs-and-economy         10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    housing                   8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    environment-and-waste     6/10  in  5 representing group(s); biggest group touching it: 6/6  score 0.600
    education                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space     8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.900  F1=0.947   ARI=0.947
  pair recovery 45/50 ground-truth pairs merged (90.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        45 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.952  R=0.698  F1=0.805   ARI=0.789
  topics        15 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-he-seed42",
  "language": "he",
  "statements": 100,
  "composite": 0.8904723346828611,
  "grade": "good",
  "direct": {
    "composite": 0.8680000000000001,
    "synthRate": 0.9,
    "synthCleanRate": 0.9,
    "pairsJoined": 45,
    "pairsJoinedClean": 45,
    "pairsTotal": 50,
    "clusterScore": 0.82,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "health",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 7,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "transport",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "housing",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      }
    ]
  },
  "synth": {
    "tp": 45,
    "fp": 0,
    "fn": 5,
    "precision": 1,
    "recall": 0.9,
    "f1": 0.9473684210526316,
    "predictedCount": 45,
    "truthCount": 50,
    "ari": 0.9468599033816425,
    "pairRecovery": "45/50",
    "pairRecoveryRate": 0.9,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 45,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 90,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 314,
    "fp": 16,
    "fn": 136,
    "precision": 0.9515151515151515,
    "recall": 0.6977777777777778,
    "f1": 0.8051282051282053,
    "predictedCount": 330,
    "truthCount": 450,
    "ari": 0.7888888888888889,
    "producedCount": 15,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 100,
    "total": 100,
    "rate": 1
  },
  "parameters": {
    "language": "he",
    "corpus": "scripts/seedSynthBenchmark.accuracy100.he.json",
    "corpusSha": "9a5191bece66",
    "seed": 42,
    "synthesisOverrides": {
      "embeddingModel": "text-embedding-3-large"
    },
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 12000,
    "maxWaitMs": 45000,
    "settleTimeouts": 19,
    "durationMs": 3981531,
    "gitSha": "f85df7f12",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
