# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed1234 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.882  (good)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   50/50 pairs joined = 1.000   (50/50 joined cleanly, i.e. the pair and nothing else = 1.000)
  CLUSTER 0.740   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.896  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    public-safety             8/10  in  7 representing group(s); biggest group touching it: 8/10  score 0.800
    culture                   8/10  in  7 representing group(s); biggest group touching it: 8/8  score 0.800
    jobs-and-economy          8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    transport                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    housing                   6/10  in  7 representing group(s); biggest group touching it: 6/6  score 0.600
    environment-and-waste     6/10  in  7 representing group(s); biggest group touching it: 6/6  score 0.600
    digital-services          6/10  in  7 representing group(s); biggest group touching it: 6/8  score 0.600
    parks-and-green-space     6/10  in  7 representing group(s); biggest group touching it: 6/6  score 0.600
    education                 6/10  in  6 representing group(s); biggest group touching it: 6/6  score 0.600

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=1.000  F1=1.000   ARI=1.000
  pair recovery 50/50 ground-truth pairs merged (100.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        50 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.891  R=0.582  F1=0.704   ARI=0.681
  topics        17 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed1234",
  "language": "en",
  "statements": 100,
  "composite": 0.8817204301075268,
  "grade": "good",
  "direct": {
    "composite": 0.8959999999999999,
    "synthRate": 1,
    "synthCleanRate": 1,
    "pairsJoined": 50,
    "pairsJoinedClean": 50,
    "pairsTotal": 50,
    "clusterScore": 0.7399999999999999,
    "themes": [
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
        "theme": "public-safety",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 7,
        "largestGroupHits": 8,
        "largestGroupSize": 10,
        "score": 0.8
      },
      {
        "theme": "culture",
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
        "theme": "transport",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "housing",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 7,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 7,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 7,
        "largestGroupHits": 6,
        "largestGroupSize": 8,
        "score": 0.6
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 7,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
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
    "tp": 262,
    "fp": 32,
    "fn": 188,
    "precision": 0.891156462585034,
    "recall": 0.5822222222222222,
    "f1": 0.7043010752688171,
    "predictedCount": 294,
    "truthCount": 450,
    "ari": 0.6814112690889943,
    "producedCount": 17,
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
    "seed": 1234,
    "synthesisOverrides": {},
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 12000,
    "maxWaitMs": 45000,
    "settleTimeouts": 3,
    "durationMs": 3571793,
    "gitSha": "742305037",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
