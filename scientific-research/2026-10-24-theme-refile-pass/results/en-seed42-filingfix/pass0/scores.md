# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.902  (excellent)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   49/50 pairs joined = 0.980   (49/50 joined cleanly, i.e. the pair and nothing else = 0.980)
  CLUSTER 0.810   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.912  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          8/10  in  7 representing group(s); biggest group touching it: 8/10  score 0.800
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    transport                 9/10  in  5 representing group(s); biggest group touching it: 9/9  score 0.900
    culture                  10/10  in  6 representing group(s); biggest group touching it: 10/16  score 1.000
    public-safety             8/10  in  7 representing group(s); biggest group touching it: 8/8  score 0.800
    jobs-and-economy          8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    housing                  10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    environment-and-waste     6/10  in  8 representing group(s); biggest group touching it: 6/8  score 0.600
    education                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space     2/10  in  6 representing group(s); biggest group touching it: 6/16  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.980  F1=0.990   ARI=0.990
  pair recovery 49/50 ground-truth pairs merged (98.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        49 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.793  R=0.749  F1=0.770   ARI=0.748
  topics        14 produced vs 10 expected

--- coverage ---
  99/100 statements (99.0%) ended up in some cluster; 1 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.9020536796536798,
  "grade": "excellent",
  "direct": {
    "composite": 0.9119999999999999,
    "synthRate": 0.98,
    "synthCleanRate": 0.98,
    "pairsJoined": 49,
    "pairsJoinedClean": 49,
    "pairsTotal": 50,
    "clusterScore": 0.8099999999999999,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 7,
        "largestGroupHits": 8,
        "largestGroupSize": 10,
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
        "gathered": 9,
        "representingGroups": 5,
        "largestGroupHits": 9,
        "largestGroupSize": 9,
        "score": 0.9
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 16,
        "score": 1
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 7,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
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
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 8,
        "largestGroupHits": 6,
        "largestGroupSize": 8,
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
    "tp": 337,
    "fp": 88,
    "fn": 113,
    "precision": 0.7929411764705883,
    "recall": 0.7488888888888889,
    "f1": 0.7702857142857144,
    "predictedCount": 425,
    "truthCount": 450,
    "ari": 0.7480341880341881,
    "producedCount": 14,
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
    "settleTimeouts": 3,
    "durationMs": 3500611,
    "gitSha": "7eb159e0d",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
