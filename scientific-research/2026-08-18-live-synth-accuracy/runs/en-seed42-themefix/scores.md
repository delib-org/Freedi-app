# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.861  (good)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   50/50 pairs joined = 1.000   (50/50 joined cleanly, i.e. the pair and nothing else = 1.000)
  CLUSTER 0.700   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.880  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          6/10  in  7 representing group(s); biggest group touching it: 6/8  score 0.600
    health                    8/10  in  7 representing group(s); biggest group touching it: 8/8  score 0.800
    transport                10/10  in  6 representing group(s); biggest group touching it: 10/12  score 1.000
    culture                   6/10  in  7 representing group(s); biggest group touching it: 6/6  score 0.600
    public-safety             4/10  in  7 representing group(s); biggest group touching it: 4/4  score 0.400
    jobs-and-economy          2/10  in  6 representing group(s); biggest group touching it: 4/14  score 0.200
    housing                  10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    environment-and-waste     6/10  in  7 representing group(s); biggest group touching it: 6/6  score 0.600
    education                 8/10  in  6 representing group(s); biggest group touching it: 8/14  score 0.800
    parks-and-green-space    10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=1.000  F1=1.000   ARI=1.000
  pair recovery 50/50 ground-truth pairs merged (100.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        50 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.740  R=0.582  F1=0.652   ARI=0.621
  topics        16 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 
wrote scientific-research/2026-08-18-live-synth-accuracy/runs/en-seed42-themefix/scores.md
nguage": "en",
  "statements": 100,
  "composite": 0.8606965174129353,
  "grade": "good",
  "direct": {
    "composite": 0.8799999999999999,
    "synthRate": 1,
    "synthCleanRate": 1,
    "pairsJoined": 50,
    "pairsJoinedClean": 50,
    "pairsTotal": 50,
    "clusterScore": 0.7,
    "themes": [
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
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
        "score": 1
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 7,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 4,
        "representingGroups": 7,
        "largestGroupHits": 4,
        "largestGroupSize": 4,
        "score": 0.4
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 6,
        "largestGroupHits": 4,
        "largestGroupSize": 14,
        "score": 0.2
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
        "representingGroups": 7,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 14,
        "score": 0.8
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
    "fp": 92,
    "fn": 188,
    "precision": 0.7401129943502824,
    "recall": 0.5822222222222222,
    "f1": 0.6517412935323382,
    "predictedCount": 354,
    "truthCount": 450,
    "ari": 0.6214355948869223,
    "producedCount": 16,
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
    "settleTimeouts": 24,
    "durationMs": 3883943,
    "gitSha": "b4918f07e",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
