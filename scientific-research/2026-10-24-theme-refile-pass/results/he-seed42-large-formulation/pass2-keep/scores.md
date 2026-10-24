# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.821  (good)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   42/50 pairs joined = 0.840   (39/50 joined cleanly, i.e. the pair and nothing else = 0.780)
  CLUSTER 0.840   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.804  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          6/10  in  7 representing group(s); biggest group touching it: 6/7  score 0.600
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    transport                10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    culture                  10/10  in  6 representing group(s); biggest group touching it: 10/14  score 1.000
    public-safety            10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    jobs-and-economy          9/10  in  5 representing group(s); biggest group touching it: 9/9  score 0.900
    housing                   7/10  in  4 representing group(s); biggest group touching it: 7/7  score 0.700
    environment-and-waste    10/10  in  4 representing group(s); biggest group touching it: 10/18  score 1.000
    education                10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space     2/10  in  5 representing group(s); biggest group touching it: 6/18  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.875  R=0.840  F1=0.857   ARI=0.856
  pair recovery 42/50 ground-truth pairs merged (84.0%)
  false merges  6 pair(s) wrongly merged, 4 of them within the same topic
  synths        41 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.723  R=0.813  F1=0.766   ARI=0.741
  topics        11 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

--- worst false merges (first 8) ---
  housing/public-rent-registry ↔ digital-services/open-data-portal
     A: לפרסם מסד נתונים עירוני של דמי שכירות כדי שהשוכרים יראו את מחירי השוק האמיתיים.
     B: לשחרר נתונים עירוניים ונתוני הוצאות באתר נתונים פתוחים לציבור.
  housing/public-rent-registry ↔ digital-services/open-data-portal
     A: לפרסם מסד נתונים עירוני של דמי שכירות כדי שהשוכרים יראו את מחירי השוק האמיתיים.
     B: לפרסם את תקציב העיר ואת נתוני העיר בפורטל פתוח.
  transport/night-service ↔ transport/bus-frequency
     A: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
     B: להגדיל את מספר האוטובוסים בשעות השיא כדי לקצר את זמן ההמתנה.
  transport/night-service ↔ transport/bus-frequency
     A: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
     B: להפעיל אוטובוסים בתדירות גבוהה יותר בשעות העומס כדי שאנשים לא יחכו זמן רב.
  transport/night-service ↔ transport/bus-frequency
     A: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
     B: להגדיל את מספר האוטובוסים בשעות השיא כדי לקצר את זמן ההמתנה.
  transport/night-service ↔ transport/bus-frequency
     A: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
     B: להפעיל אוטובוסים בתדירות גבוהה יותר בשעות העומס כדי שאנשים לא יחכו זמן רב.

```

## Raw

```json
{
  "run": "live-synth-accuracy-he-seed42",
  "language": "he",
  "statements": 100,
  "composite": 0.8205618649133295,
  "grade": "good",
  "direct": {
    "composite": 0.8039999999999999,
    "synthRate": 0.84,
    "synthCleanRate": 0.78,
    "pairsJoined": 42,
    "pairsJoinedClean": 39,
    "pairsTotal": 50,
    "clusterScore": 0.8399999999999999,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "gathered": 6,
        "representingGroups": 7,
        "largestGroupHits": 6,
        "largestGroupSize": 7,
        "score": 0.6
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
        "largestGroupSize": 14,
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
        "gathered": 9,
        "representingGroups": 5,
        "largestGroupHits": 9,
        "largestGroupSize": 9,
        "score": 0.9
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
        "gathered": 10,
        "representingGroups": 4,
        "largestGroupHits": 10,
        "largestGroupSize": 18,
        "score": 1
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 6,
        "largestGroupSize": 18,
        "score": 0.2
      }
    ]
  },
  "synth": {
    "tp": 42,
    "fp": 6,
    "fn": 8,
    "precision": 0.875,
    "recall": 0.84,
    "f1": 0.8571428571428572,
    "predictedCount": 48,
    "truthCount": 50,
    "ari": 0.8557151780137414,
    "pairRecovery": "42/50",
    "pairRecoveryRate": 0.84,
    "falseMerges": 6,
    "falseMergesWithinTopic": 4,
    "falseMergeRate": 0.125,
    "producedCount": 41,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 85,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 366,
    "fp": 140,
    "fn": 84,
    "precision": 0.7233201581027668,
    "recall": 0.8133333333333334,
    "f1": 0.7656903765690377,
    "predictedCount": 506,
    "truthCount": 450,
    "ari": 0.7407407407407407,
    "producedCount": 11,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 100,
    "total": 100,
    "rate": 1
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
    "settleTimeouts": 14,
    "durationMs": 3844028,
    "gitSha": "97e3b57dc",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
