# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.711  (fair)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   50/50 pairs joined = 1.000   (46/50 joined cleanly, i.e. the pair and nothing else = 0.920)
  CLUSTER 0.500   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.752  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          6/10  in  6 representing group(s); biggest group touching it: 6/10  score 0.600
    health                    6/10  in  6 representing group(s); biggest group touching it: 6/6  score 0.600
    transport                 4/10  in  6 representing group(s); biggest group touching it: 4/6  score 0.400
    culture                   2/10  in  5 representing group(s); biggest group touching it: 6/16  score 0.200
    public-safety             4/10  in  6 representing group(s); biggest group touching it: 4/4  score 0.400
    jobs-and-economy          6/10  in  6 representing group(s); biggest group touching it: 6/6  score 0.600
    housing                   8/10  in  5 representing group(s); biggest group touching it: 8/14  score 0.800
    environment-and-waste     4/10  in  4 representing group(s); biggest group touching it: 4/8  score 0.400
    education                 8/10  in  6 representing group(s); biggest group touching it: 8/12  score 0.800
    parks-and-green-space     2/10  in  5 representing group(s); biggest group touching it: 6/16  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.862  R=1.000  F1=0.926   ARI=0.925
  pair recovery 50/50 ground-truth pairs merged (100.0%)
  false merges  8 pair(s) wrongly merged, 8 of them within the same topic
  synths        48 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.399  R=0.378  F1=0.388   ARI=0.329
  topics        13 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

--- worst false merges (first 8) ---
  housing/convert-offices ↔ housing/affordable-quota
     A: Convert empty office buildings into apartments.
     B: Require developers to include affordable units in every new building.
  housing/convert-offices ↔ housing/affordable-quota
     A: Turn vacant commercial buildings into residential housing.
     B: Require developers to include affordable units in every new building.
  housing/convert-offices ↔ housing/affordable-quota
     A: Convert empty office buildings into apartments.
     B: Mandate a share of below-market apartments in all new construction.
  housing/affordable-quota ↔ housing/convert-offices
     A: Mandate a share of below-market apartments in all new construction.
     B: Turn vacant commercial buildings into residential housing.
  environment-and-waste/recycling-pickup ↔ environment-and-waste/compost-organic-waste
     A: Collect recycling from every doorstep once a week.
     B: Create a dedicated food-waste stream that gets turned into compost.
  environment-and-waste/compost-organic-waste ↔ environment-and-waste/recycling-pickup
     A: Create a dedicated food-waste stream that gets turned into compost.
     B: Provide weekly curbside pickup of recyclable materials.
  environment-and-waste/compost-organic-waste ↔ environment-and-waste/recycling-pickup
     A: Set up separate collection of kitchen food scraps for composting.
     B: Collect recycling from every doorstep once a week.
  environment-and-waste/compost-organic-waste ↔ environment-and-waste/recycling-pickup
     A: Set up separate collection of kitchen food scraps for composting.
     B: Provide weekly curbside pickup of recyclable materials.

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.710806697108067,
  "grade": "fair",
  "direct": {
    "composite": 0.7520000000000001,
    "synthRate": 1,
    "synthCleanRate": 0.92,
    "pairsJoined": 50,
    "pairsJoinedClean": 46,
    "pairsTotal": 50,
    "clusterScore": 0.5000000000000001,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 10,
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
        "gathered": 4,
        "representingGroups": 6,
        "largestGroupHits": 4,
        "largestGroupSize": 6,
        "score": 0.4
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 16,
        "score": 0.2
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 4,
        "representingGroups": 6,
        "largestGroupHits": 4,
        "largestGroupSize": 4,
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
        "gathered": 8,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 14,
        "score": 0.8
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 4,
        "representingGroups": 4,
        "largestGroupHits": 4,
        "largestGroupSize": 8,
        "score": 0.4
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 12,
        "score": 0.8
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 16,
        "score": 0.2
      }
    ]
  },
  "synth": {
    "tp": 50,
    "fp": 8,
    "fn": 0,
    "precision": 0.8620689655172413,
    "recall": 1,
    "f1": 0.9259259259259259,
    "predictedCount": 58,
    "truthCount": 50,
    "ari": 0.9251134644478064,
    "pairRecovery": "50/50",
    "pairRecoveryRate": 1,
    "falseMerges": 8,
    "falseMergesWithinTopic": 8,
    "falseMergeRate": 0.13793103448275862,
    "producedCount": 48,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 100,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 170,
    "fp": 256,
    "fn": 280,
    "precision": 0.39906103286384975,
    "recall": 0.37777777777777777,
    "f1": 0.3881278538812785,
    "predictedCount": 426,
    "truthCount": 450,
    "ari": 0.3287795992714026,
    "producedCount": 13,
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
    "durationMs": 839399,
    "gitSha": "441e3dcbe",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
