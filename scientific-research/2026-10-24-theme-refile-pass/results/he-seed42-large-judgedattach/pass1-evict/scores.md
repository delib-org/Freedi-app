# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.925  (excellent)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   45/50 pairs joined = 0.900   (45/50 joined cleanly, i.e. the pair and nothing else = 0.900)
  CLUSTER 0.930   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.912  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          8/10  in  5 representing group(s); biggest group touching it: 8/8  score 0.800
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    transport                10/10  in  6 representing group(s); biggest group touching it: 10/12  score 1.000
    culture                  10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    public-safety             7/10  in  5 representing group(s); biggest group touching it: 7/7  score 0.700
    jobs-and-economy         10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    housing                   8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    environment-and-waste    10/10  in  4 representing group(s); biggest group touching it: 10/12  score 1.000
    education                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space    10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.900  F1=0.947   ARI=0.947
  pair recovery 45/50 ground-truth pairs merged (90.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        45 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.908  R=0.878  F1=0.893   ARI=0.882
  topics        10 produced vs 10 expected

--- coverage ---
  99/100 statements (99.0%) ended up in some cluster; 1 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-he-seed42",
  "language": "he",
  "statements": 100,
  "composite": 0.9254831995242343,
  "grade": "excellent",
  "direct": {
    "composite": 0.9120000000000001,
    "synthRate": 0.9,
    "synthCleanRate": 0.9,
    "pairsJoined": 45,
    "pairsJoinedClean": 45,
    "pairsTotal": 50,
    "clusterScore": 0.93,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "health",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "transport",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
        "score": 1
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
        "gathered": 7,
        "representingGroups": 5,
        "largestGroupHits": 7,
        "largestGroupSize": 7,
        "score": 0.7
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
        "gathered": 10,
        "representingGroups": 4,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
        "score": 1
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
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
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
    "tp": 395,
    "fp": 40,
    "fn": 55,
    "precision": 0.9080459770114943,
    "recall": 0.8777777777777778,
    "f1": 0.8926553672316384,
    "predictedCount": 435,
    "truthCount": 450,
    "ari": 0.8821206993795826,
    "producedCount": 10,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 99,
    "total": 100,
    "rate": 0.99
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
