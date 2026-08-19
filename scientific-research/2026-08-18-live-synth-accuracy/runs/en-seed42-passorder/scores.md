# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.691  (fair)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   50/50 pairs joined = 1.000   (45/50 joined cleanly, i.e. the pair and nothing else = 0.900)
  CLUSTER 0.500   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.740  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          6/10  in  6 representing group(s); biggest group touching it: 6/8  score 0.600
    health                    6/10  in  6 representing group(s); biggest group touching it: 6/6  score 0.600
    transport                 8/10  in  6 representing group(s); biggest group touching it: 8/10  score 0.800
    culture                   2/10  in  5 representing group(s); biggest group touching it: 6/14  score 0.200
    public-safety             4/10  in  7 representing group(s); biggest group touching it: 4/6  score 0.400
    jobs-and-economy          6/10  in  6 representing group(s); biggest group touching it: 6/6  score 0.600
    housing                   6/10  in  3 representing group(s); biggest group touching it: 10/22  score 0.600
    environment-and-waste     4/10  in  4 representing group(s); biggest group touching it: 4/10  score 0.400
    education                 6/10  in  6 representing group(s); biggest group touching it: 6/6  score 0.600
    parks-and-green-space     2/10  in  5 representing group(s); biggest group touching it: 6/14  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.758  R=1.000  F1=0.862   ARI=0.860
  pair recovery 50/50 ground-truth pairs merged (100.0%)
  false merges  16 pair(s) wrongly merged, 16 of them within the same topic
  synths        47 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.405  R=0.467  F1=0.434   ARI=0.373
  topics        12 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

--- worst false merges (first 8) ---
  housing/affordable-quota ↔ housing/convert-offices
     A: Require developers to include affordable units in every new building.
     B: Convert empty office buildings into apartments.
  housing/convert-offices ↔ housing/affordable-quota
     A: Turn vacant commercial buildings into residential housing.
     B: Require developers to include affordable units in every new building.
  housing/affordable-quota ↔ housing/student-dorms
     A: Require developers to include affordable units in every new building.
     B: Build subsidized dormitories for students near the campuses.
  housing/student-dorms ↔ housing/affordable-quota
     A: Construct low-cost student housing close to the colleges.
     B: Require developers to include affordable units in every new building.
  housing/affordable-quota ↔ housing/convert-offices
     A: Mandate a share of below-market apartments in all new construction.
     B: Convert empty office buildings into apartments.
  housing/convert-offices ↔ housing/affordable-quota
     A: Turn vacant commercial buildings into residential housing.
     B: Mandate a share of below-market apartments in all new construction.
  housing/student-dorms ↔ housing/affordable-quota
     A: Build subsidized dormitories for students near the campuses.
     B: Mandate a share of below-market apartments in all new construction.
  housing/student-dorms ↔ housing/affordable-quota
     A: Construct low-cost student housing close to the colleges.
     B: Mandate a share of below-market apartments in all new construction.

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.6907950983186093,
  "grade": "fair",
  "direct": {
    "composite": 0.74,
    "synthRate": 1,
    "synthCleanRate": 0.9,
    "pairsJoined": 50,
    "pairsJoinedClean": 45,
    "pairsTotal": 50,
    "clusterScore": 0.5,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 8,
        "score": 0.6
      },
      {
        "theme": "health",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "transport",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 10,
        "score": 0.8
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 14,
        "score": 0.2
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 4,
        "representingGroups": 7,
        "largestGroupHits": 4,
        "largestGroupSize": 6,
        "score": 0.4
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "housing",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 3,
        "largestGroupHits": 10,
        "largestGroupSize": 22,
        "score": 0.6
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 4,
        "representingGroups": 4,
        "largestGroupHits": 4,
        "largestGroupSize": 10,
        "score": 0.4
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 14,
        "score": 0.2
      }
    ]
  },
  "synth": {
    "tp": 50,
    "fp": 16,
    "fn": 0,
    "precision": 0.7575757575757576,
    "recall": 1,
    "f1": 0.8620689655172413,
    "predictedCount": 66,
    "truthCount": 50,
    "ari": 0.8604651162790697,
    "pairRecovery": "50/50",
    "pairRecoveryRate": 1,
    "falseMerges": 16,
    "falseMergesWithinTopic": 16,
    "falseMergeRate": 0.24242424242424243,
    "producedCount": 47,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 100,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 210,
    "fp": 308,
    "fn": 240,
    "precision": 0.40540540540540543,
    "recall": 0.4666666666666667,
    "f1": 0.4338842975206612,
    "predictedCount": 518,
    "truthCount": 450,
    "ari": 0.3728672492717437,
    "producedCount": 12,
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
    "quietMs": 2500,
    "maxWaitMs": 20000,
    "settleTimeouts": 0,
    "durationMs": 867954,
    "gitSha": "24272a6f3",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
