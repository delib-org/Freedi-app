# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed7 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.905  (excellent)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   50/50 pairs joined = 1.000   (50/50 joined cleanly, i.e. the pair and nothing else = 1.000)
  CLUSTER 0.760   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.904  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    transport                10/10  in  6 representing group(s); biggest group touching it: 10/14  score 1.000
    culture                   2/10  in  6 representing group(s); biggest group touching it: 8/20  score 0.200
    housing                   8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    jobs-and-economy         10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/12  score 1.000
    digital-services         10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    public-safety             4/10  in  6 representing group(s); biggest group touching it: 4/14  score 0.400
    environment-and-waste    10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space     2/10  in  5 representing group(s); biggest group touching it: 10/20  score 0.200
    education                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=1.000  F1=1.000   ARI=1.000
  pair recovery 50/50 ground-truth pairs merged (100.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        50 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.687  R=0.858  F1=0.763   ARI=0.736
  topics        10 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed7",
  "language": "en",
  "statements": 100,
  "composite": 0.9051383399209486,
  "grade": "excellent",
  "direct": {
    "composite": 0.904,
    "synthRate": 1,
    "synthCleanRate": 1,
    "pairsJoined": 50,
    "pairsJoinedClean": 50,
    "pairsTotal": 50,
    "clusterScore": 0.76,
    "themes": [
      {
        "theme": "transport",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 14,
        "score": 1
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 20,
        "score": 0.2
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
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "health",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
        "score": 1
      },
      {
        "theme": "digital-services",
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
        "gathered": 4,
        "representingGroups": 6,
        "largestGroupHits": 4,
        "largestGroupSize": 14,
        "score": 0.4
      },
      {
        "theme": "environment-and-waste",
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
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 20,
        "score": 0.2
      },
      {
        "theme": "education",
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
    "tp": 50,
    "fp": 0,
    "fn": 0,
    "precision": 1,
    "recall": 1,
    "f1": 1,
    "predictedCount": 50,
    "truthCount": 50,
    "ari": 1,
    "pairRecovery": "50/50",
    "pairRecoveryRate": 1,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 50,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 100,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 386,
    "fp": 176,
    "fn": 64,
    "precision": 0.6868327402135231,
    "recall": 0.8577777777777778,
    "f1": 0.7628458498023715,
    "predictedCount": 562,
    "truthCount": 450,
    "ari": 0.7362110311750599,
    "producedCount": 10,
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
    "seed": 7,
    "synthesisOverrides": {},
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 12000,
    "maxWaitMs": 45000,
    "settleTimeouts": 2,
    "durationMs": 3473969,
    "gitSha": "65b721ce4",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
