# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.865  (good)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   49/50 pairs joined = 0.980   (49/50 joined cleanly, i.e. the pair and nothing else = 0.980)
  CLUSTER 0.750   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.888  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services         10/10  in  6 representing group(s); biggest group touching it: 10/18  score 1.000
    health                    8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    transport                 8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    culture                   8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    public-safety             2/10  in  5 representing group(s); biggest group touching it: 8/16  score 0.200
    jobs-and-economy          8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    housing                   9/10  in  5 representing group(s); biggest group touching it: 9/9  score 0.900
    environment-and-waste    10/10  in  6 representing group(s); biggest group touching it: 10/12  score 1.000
    education                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space     2/10  in  6 representing group(s); biggest group touching it: 6/16  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.980  F1=0.990   ARI=0.990
  pair recovery 49/50 ground-truth pairs merged (98.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        49 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.625  R=0.740  F1=0.678   ARI=0.642
  topics        10 produced vs 10 expected

--- coverage ---
  99/100 statements (99.0%) ended up in some cluster; 1 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.8649465149973798,
  "grade": "good",
  "direct": {
    "composite": 0.888,
    "synthRate": 0.98,
    "synthCleanRate": 0.98,
    "pairsJoined": 49,
    "pairsJoinedClean": 49,
    "pairsTotal": 50,
    "clusterScore": 0.7500000000000001,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 18,
        "score": 1
      },
      {
        "theme": "health",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
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
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 16,
        "score": 0.2
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "housing",
        "statements": 10,
        "gathered": 9,
        "representingGroups": 5,
        "largestGroupHits": 9,
        "largestGroupSize": 9,
        "score": 0.9
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
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
        "gathered": 2,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 16,
        "score": 0.2
      }
    ]
  },
  "synth": {
    "tp": 49,
    "fp": 0,
    "fn": 1,
    "precision": 1,
    "recall": 0.98,
    "f1": 0.98989898989899,
    "predictedCount": 49,
    "truthCount": 50,
    "ari": 0.9897969700092755,
    "pairRecovery": "49/50",
    "pairRecoveryRate": 0.98,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 49,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 98,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 333,
    "fp": 200,
    "fn": 117,
    "precision": 0.624765478424015,
    "recall": 0.74,
    "f1": 0.6775178026449644,
    "predictedCount": 533,
    "truthCount": 450,
    "ari": 0.6422488970965425,
    "producedCount": 10,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 99,
    "total": 100,
    "rate": 0.99
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
    "quietMs": 12000,
    "maxWaitMs": 45000,
    "settleTimeouts": 2,
    "durationMs": 3327568,
    "gitSha": "0583ce959",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
