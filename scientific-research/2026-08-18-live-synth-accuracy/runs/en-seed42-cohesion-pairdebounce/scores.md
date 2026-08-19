# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.207  (poor)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   2/50 pairs joined = 0.040   (2/50 joined cleanly, i.e. the pair and nothing else = 0.040)
  CLUSTER 0.380   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.176  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          5/10  in  1 representing group(s); biggest group touching it: 5/8  score 0.500
    health                    6/10  in  1 representing group(s); biggest group touching it: 6/6  score 0.600
    transport                 8/10  in  2 representing group(s); biggest group touching it: 8/10  score 0.800
    culture                   0/10  in  0 representing group(s); biggest group touching it: 4/14  score 0.000
    public-safety             4/10  in  2 representing group(s); biggest group touching it: 4/4  score 0.400
    jobs-and-economy          2/10  in  1 representing group(s); biggest group touching it: 4/12  score 0.200
    housing                   2/10  in  1 representing group(s); biggest group touching it: 6/12  score 0.200
    environment-and-waste     0/10  in  0 representing group(s); biggest group touching it: 6/14  score 0.000
    education                 6/10  in  2 representing group(s); biggest group touching it: 6/10  score 0.600
    parks-and-green-space     5/10  in  1 representing group(s); biggest group touching it: 5/7  score 0.500

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.040  F1=0.077   ARI=0.076
  pair recovery 2/50 ground-truth pairs merged (4.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        2 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.457  R=0.358  F1=0.401   ARI=0.350
  topics        14 produced vs 10 expected

--- coverage ---
  98/100 statements (98.0%) ended up in some cluster; 2 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.20675234989449456,
  "grade": "poor",
  "direct": {
    "composite": 0.17600000000000002,
    "synthRate": 0.04,
    "synthCleanRate": 0.04,
    "pairsJoined": 2,
    "pairsJoinedClean": 2,
    "pairsTotal": 50,
    "clusterScore": 0.38000000000000006,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 5,
        "representingGroups": 1,
        "largestGroupHits": 5,
        "largestGroupSize": 8,
        "score": 0.5
      },
      {
        "theme": "health",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 1,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "transport",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 2,
        "largestGroupHits": 8,
        "largestGroupSize": 10,
        "score": 0.8
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 0,
        "representingGroups": 0,
        "largestGroupHits": 4,
        "largestGroupSize": 14,
        "score": 0
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 4,
        "representingGroups": 2,
        "largestGroupHits": 4,
        "largestGroupSize": 4,
        "score": 0.4
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 1,
        "largestGroupHits": 4,
        "largestGroupSize": 12,
        "score": 0.2
      },
      {
        "theme": "housing",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 1,
        "largestGroupHits": 6,
        "largestGroupSize": 12,
        "score": 0.2
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 0,
        "representingGroups": 0,
        "largestGroupHits": 6,
        "largestGroupSize": 14,
        "score": 0
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 2,
        "largestGroupHits": 6,
        "largestGroupSize": 10,
        "score": 0.6
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 5,
        "representingGroups": 1,
        "largestGroupHits": 5,
        "largestGroupSize": 7,
        "score": 0.5
      }
    ]
  },
  "synth": {
    "tp": 2,
    "fp": 0,
    "fn": 48,
    "precision": 1,
    "recall": 0.04,
    "f1": 0.07692307692307693,
    "predictedCount": 2,
    "truthCount": 50,
    "ari": 0.07620528771384137,
    "pairRecovery": "2/50",
    "pairRecoveryRate": 0.04,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 2,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 4,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 161,
    "fp": 191,
    "fn": 289,
    "precision": 0.45738636363636365,
    "recall": 0.35777777777777775,
    "f1": 0.401496259351621,
    "predictedCount": 352,
    "truthCount": 450,
    "ari": 0.34959349593495936,
    "producedCount": 14,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 98,
    "total": 100,
    "rate": 0.98
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
    "durationMs": 768891,
    "gitSha": "a75a1ff84",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
