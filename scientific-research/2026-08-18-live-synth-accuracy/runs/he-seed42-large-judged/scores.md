# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.878  (good)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   43/50 pairs joined = 0.860   (41/50 joined cleanly, i.e. the pair and nothing else = 0.820)
  CLUSTER 0.880   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.844  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          8/10  in  6 representing group(s); biggest group touching it: 8/10  score 0.800
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    transport                10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    culture                  10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    public-safety            10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    jobs-and-economy          6/10  in  5 representing group(s); biggest group touching it: 6/6  score 0.600
    housing                   7/10  in  4 representing group(s); biggest group touching it: 7/7  score 0.700
    environment-and-waste     9/10  in  5 representing group(s); biggest group touching it: 9/9  score 0.900
    education                 8/10  in  5 representing group(s); biggest group touching it: 8/8  score 0.800
    parks-and-green-space    10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.915  R=0.860  F1=0.887   ARI=0.885
  pair recovery 43/50 ground-truth pairs merged (86.0%)
  false merges  4 pair(s) wrongly merged, 4 of them within the same topic
  synths        42 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.957  R=0.789  F1=0.865   ARI=0.853
  topics        11 produced vs 10 expected

--- coverage ---
  92/100 statements (92.0%) ended up in some cluster; 8 left as singletons

--- worst false merges (first 8) ---
  transport/night-service ↔ transport/bus-frequency
     A: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
     B: להגדיל את מספר האוטובוסים בשעות השיא כדי לקצר את זמן ההמתנה.
  transport/night-service ↔ transport/bus-frequency
     A: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
     B: להפעיל אוטובוסים בתדירות גבוהה יותר בשעות העומס כדי שאנשים לא יחכו זמן רב.
  transport/bus-frequency ↔ transport/night-service
     A: להגדיל את מספר האוטובוסים בשעות השיא כדי לקצר את זמן ההמתנה.
     B: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
  transport/bus-frequency ↔ transport/night-service
     A: להפעיל אוטובוסים בתדירות גבוהה יותר בשעות העומס כדי שאנשים לא יחכו זמן רב.
     B: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.

```

## Raw

```json
{
  "run": "live-synth-accuracy-he-seed42",
  "language": "he",
  "statements": 100,
  "composite": 0.8778783731180231,
  "grade": "good",
  "direct": {
    "composite": 0.8440000000000001,
    "synthRate": 0.86,
    "synthCleanRate": 0.82,
    "pairsJoined": 43,
    "pairsJoinedClean": 41,
    "pairsTotal": 50,
    "clusterScore": 0.8800000000000001,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
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
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "housing",
        "statements": 10,
        "gathered": 7,
        "representingGroups": 4,
        "largestGroupHits": 7,
        "largestGroupSize": 7,
        "score": 0.7
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 9,
        "representingGroups": 5,
        "largestGroupHits": 9,
        "largestGroupSize": 9,
        "score": 0.9
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
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
    "tp": 43,
    "fp": 4,
    "fn": 7,
    "precision": 0.9148936170212766,
    "recall": 0.86,
    "f1": 0.8865979381443299,
    "predictedCount": 47,
    "truthCount": 50,
    "ari": 0.8854769166053212,
    "pairRecovery": "43/50",
    "pairRecoveryRate": 0.86,
    "falseMerges": 4,
    "falseMergesWithinTopic": 4,
    "falseMergeRate": 0.0851063829787234,
    "producedCount": 42,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 86,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 355,
    "fp": 16,
    "fn": 95,
    "precision": 0.9568733153638814,
    "recall": 0.7888888888888889,
    "f1": 0.8647990255785627,
    "predictedCount": 371,
    "truthCount": 450,
    "ari": 0.8526963445530221,
    "producedCount": 11,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 92,
    "total": 100,
    "rate": 0.92
  },
  "parameters": {
    "language": "he",
    "corpus": "scripts/seedSynthBenchmark.accuracy100.he.json",
    "corpusSha": "9a5191bece66",
    "seed": 42,
    "synthesisOverrides": {
      "embeddingModel": "text-embedding-3-large"
    },
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 12000,
    "maxWaitMs": 45000,
    "settleTimeouts": 11,
    "durationMs": 3758610,
    "gitSha": "e3a240562",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
