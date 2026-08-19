# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.730  (fair)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   47/50 pairs joined = 0.940   (43/50 joined cleanly, i.e. the pair and nothing else = 0.860)
  CLUSTER 0.500   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.716  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          2/10  in  5 representing group(s); biggest group touching it: 10/20  score 0.200
    health                    6/10  in  7 representing group(s); biggest group touching it: 6/6  score 0.600
    transport                10/10  in  6 representing group(s); biggest group touching it: 10/14  score 1.000
    culture                   8/10  in  6 representing group(s); biggest group touching it: 8/12  score 0.800
    public-safety             4/10  in  6 representing group(s); biggest group touching it: 4/4  score 0.400
    jobs-and-economy          2/10  in  6 representing group(s); biggest group touching it: 2/2  score 0.200
    housing                   8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    environment-and-waste     6/10  in  5 representing group(s); biggest group touching it: 6/6  score 0.600
    education                 2/10  in  7 representing group(s); biggest group touching it: 2/2  score 0.200
    parks-and-green-space     2/10  in  7 representing group(s); biggest group touching it: 4/12  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.855  R=0.940  F1=0.895   ARI=0.894
  pair recovery 47/50 ground-truth pairs merged (94.0%)
  false merges  8 pair(s) wrongly merged, 8 of them within the same topic
  synths        45 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.494  R=0.469  F1=0.481   ARI=0.431
  topics        18 produced vs 10 expected

--- coverage ---
  94/100 statements (94.0%) ended up in some cluster; 6 left as singletons

--- worst false merges (first 8) ---
  housing/affordable-quota ↔ housing/convert-offices
     A: Require developers to include affordable units in every new building.
     B: Convert empty office buildings into apartments.
  housing/convert-offices ↔ housing/affordable-quota
     A: Turn vacant commercial buildings into residential housing.
     B: Require developers to include affordable units in every new building.
  housing/affordable-quota ↔ housing/convert-offices
     A: Mandate a share of below-market apartments in all new construction.
     B: Convert empty office buildings into apartments.
  housing/convert-offices ↔ housing/affordable-quota
     A: Turn vacant commercial buildings into residential housing.
     B: Mandate a share of below-market apartments in all new construction.
  environment-and-waste/compost-organic-waste ↔ environment-and-waste/recycling-pickup
     A: Create a dedicated food-waste stream that gets turned into compost.
     B: Collect recycling from every doorstep once a week.
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
  "composite": 0.7296172014986153,
  "grade": "fair",
  "direct": {
    "composite": 0.716,
    "synthRate": 0.94,
    "synthCleanRate": 0.86,
    "pairsJoined": 47,
    "pairsJoinedClean": 43,
    "pairsTotal": 50,
    "clusterScore": 0.5,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 20,
        "score": 0.2
      },
      {
        "theme": "health",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 7,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
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
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 12,
        "score": 0.8
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
        "gathered": 2,
        "representingGroups": 6,
        "largestGroupHits": 2,
        "largestGroupSize": 2,
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
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 7,
        "largestGroupHits": 2,
        "largestGroupSize": 2,
        "score": 0.2
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 7,
        "largestGroupHits": 4,
        "largestGroupSize": 12,
        "score": 0.2
      }
    ]
  },
  "synth": {
    "tp": 47,
    "fp": 8,
    "fn": 3,
    "precision": 0.8545454545454545,
    "recall": 0.94,
    "f1": 0.8952380952380952,
    "predictedCount": 55,
    "truthCount": 50,
    "ari": 0.8941176470588236,
    "pairRecovery": "47/50",
    "pairRecoveryRate": 0.94,
    "falseMerges": 8,
    "falseMergesWithinTopic": 8,
    "falseMergeRate": 0.14545454545454545,
    "producedCount": 45,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 94,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 211,
    "fp": 216,
    "fn": 239,
    "precision": 0.49414519906323184,
    "recall": 0.4688888888888889,
    "f1": 0.4811858608893957,
    "predictedCount": 427,
    "truthCount": 450,
    "ari": 0.4307972250653929,
    "producedCount": 18,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 94,
    "total": 100,
    "rate": 0.94
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
    "durationMs": 868963,
    "gitSha": "7462ecee3",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
