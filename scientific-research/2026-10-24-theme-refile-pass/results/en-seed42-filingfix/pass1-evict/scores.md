# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.913  (excellent)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   49/50 pairs joined = 0.980   (49/50 joined cleanly, i.e. the pair and nothing else = 0.980)
  CLUSTER 0.820   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.916  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          8/10  in  7 representing group(s); biggest group touching it: 8/10  score 0.800
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    transport                10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    culture                  10/10  in  6 representing group(s); biggest group touching it: 10/12  score 1.000
    public-safety             8/10  in  7 representing group(s); biggest group touching it: 8/8  score 0.800
    jobs-and-economy          8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    housing                   8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    environment-and-waste     6/10  in  8 representing group(s); biggest group touching it: 6/6  score 0.600
    education                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space     4/10  in  6 representing group(s); biggest group touching it: 4/4  score 0.400

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.980  F1=0.990   ARI=0.990
  pair recovery 49/50 ground-truth pairs merged (98.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        49 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.899  R=0.716  F1=0.797   ARI=0.779
  topics        14 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.9127512751275129,
  "grade": "excellent",
  "direct": {
    "composite": 0.9159999999999999,
    "synthRate": 0.98,
    "synthCleanRate": 0.98,
    "pairsJoined": 49,
    "pairsJoinedClean": 49,
    "pairsTotal": 50,
    "clusterScore": 0.82,
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
        "gathered": 10,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
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
        "representingGroups": 8,
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
        "gathered": 4,
        "representingGroups": 6,
        "largestGroupHits": 4,
        "largestGroupSize": 4,
        "score": 0.4
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
    "tp": 322,
    "fp": 36,
    "fn": 128,
    "precision": 0.8994413407821229,
    "recall": 0.7155555555555555,
    "f1": 0.797029702970297,
    "predictedCount": 358,
    "truthCount": 450,
    "ari": 0.7792462065589819,
    "producedCount": 14,
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
