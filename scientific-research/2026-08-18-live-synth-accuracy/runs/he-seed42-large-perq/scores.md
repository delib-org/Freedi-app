# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.651  (fair)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   44/50 pairs joined = 0.880   (41/50 joined cleanly, i.e. the pair and nothing else = 0.820)
  CLUSTER 0.450   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.672  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          6/10  in  7 representing group(s); biggest group touching it: 6/8  score 0.600
    health                    2/10  in  5 representing group(s); biggest group touching it: 10/45  score 0.200
    transport                10/10  in  5 representing group(s); biggest group touching it: 10/17  score 1.000
    culture                   6/10  in  6 representing group(s); biggest group touching it: 6/6  score 0.600
    public-safety             4/10  in  5 representing group(s); biggest group touching it: 4/4  score 0.400
    jobs-and-economy          6/10  in  5 representing group(s); biggest group touching it: 6/6  score 0.600
    housing                   2/10  in  5 representing group(s); biggest group touching it: 6/45  score 0.200
    environment-and-waste     5/10  in  4 representing group(s); biggest group touching it: 5/5  score 0.500
    education                 2/10  in  4 representing group(s); biggest group touching it: 10/45  score 0.200
    parks-and-green-space     2/10  in  5 representing group(s); biggest group touching it: 7/45  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.880  R=0.880  F1=0.880   ARI=0.879
  pair recovery 44/50 ground-truth pairs merged (88.0%)
  false merges  6 pair(s) wrongly merged, 4 of them within the same topic
  synths        43 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.211  R=0.564  F1=0.307   ARI=0.199
  topics        9 produced vs 10 expected

--- coverage ---
  97/100 statements (97.0%) ended up in some cluster; 3 left as singletons

--- worst false merges (first 8) ---
  transport/bus-frequency ↔ transport/night-service
     A: להגדיל את מספר האוטובוסים בשעות השיא כדי לקצר את זמן ההמתנה.
     B: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
  transport/bus-frequency ↔ transport/night-service
     A: להפעיל אוטובוסים בתדירות גבוהה יותר בשעות העומס כדי שאנשים לא יחכו זמן רב.
     B: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
  transport/bus-frequency ↔ transport/night-service
     A: להגדיל את מספר האוטובוסים בשעות השיא כדי לקצר את זמן ההמתנה.
     B: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
  transport/bus-frequency ↔ transport/night-service
     A: להפעיל אוטובוסים בתדירות גבוהה יותר בשעות העומס כדי שאנשים לא יחכו זמן רב.
     B: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
  digital-services/open-data-portal ↔ housing/public-rent-registry
     A: לשחרר נתונים עירוניים ונתוני הוצאות באתר נתונים פתוחים לציבור.
     B: לפרסם מסד נתונים עירוני של דמי שכירות כדי שהשוכרים יראו את מחירי השוק האמיתיים.
  digital-services/open-data-portal ↔ housing/public-rent-registry
     A: לפרסם את תקציב העיר ואת נתוני העיר בפורטל פתוח.
     B: לפרסם מסד נתונים עירוני של דמי שכירות כדי שהשוכרים יראו את מחירי השוק האמיתיים.

```

## Raw

```json
{
  "run": "live-synth-accuracy-he-seed42",
  "language": "he",
  "statements": 100,
  "composite": 0.6508536880290205,
  "grade": "fair",
  "direct": {
    "composite": 0.6719999999999999,
    "synthRate": 0.88,
    "synthCleanRate": 0.82,
    "pairsJoined": 44,
    "pairsJoinedClean": 41,
    "pairsTotal": 50,
    "clusterScore": 0.45,
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
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 45,
        "score": 0.2
      },
      {
        "theme": "transport",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 17,
        "score": 1
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 6,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "score": 0.6
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 4,
        "representingGroups": 5,
        "largestGroupHits": 4,
        "largestGroupSize": 4,
        "score": 0.4
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
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 45,
        "score": 0.2
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 5,
        "representingGroups": 4,
        "largestGroupHits": 5,
        "largestGroupSize": 5,
        "score": 0.5
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 4,
        "largestGroupHits": 10,
        "largestGroupSize": 45,
        "score": 0.2
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 7,
        "largestGroupSize": 45,
        "score": 0.2
      }
    ]
  },
  "synth": {
    "tp": 44,
    "fp": 6,
    "fn": 6,
    "precision": 0.88,
    "recall": 0.88,
    "f1": 0.88,
    "predictedCount": 50,
    "truthCount": 50,
    "ari": 0.8787755102040816,
    "pairRecovery": "44/50",
    "pairRecoveryRate": 0.88,
    "falseMerges": 6,
    "falseMergesWithinTopic": 4,
    "falseMergeRate": 0.12,
    "producedCount": 43,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 89,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 254,
    "fp": 950,
    "fn": 196,
    "precision": 0.21096345514950166,
    "recall": 0.5644444444444444,
    "f1": 0.3071342200725514,
    "predictedCount": 1204,
    "truthCount": 450,
    "ari": 0.19913749365804162,
    "producedCount": 9,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 97,
    "total": 100,
    "rate": 0.97
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
    "settleTimeouts": 13,
    "durationMs": 3783254,
    "gitSha": "5a8d37692",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
