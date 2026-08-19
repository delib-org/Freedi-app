# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.369  (poor)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   27/50 pairs joined = 0.540   (14/50 joined cleanly, i.e. the pair and nothing else = 0.280)
  CLUSTER 0.498   = togetherness 0.410 x purity 0.764 (harmonic mean, averaged over the 10 themes)
  COMBINED 0.523  = 0.6·synth + 0.4·cluster

  per theme:   of its statements, how many landed in one group, and how clean was it
    digital-services          2/10 together, group size   2 -> purity 1.00  score 0.333
    health                   10/10 together, group size  10 -> purity 1.00  score 1.000
    transport                 6/10 together, group size   6 -> purity 1.00  score 0.750
    culture                   2/10 together, group size   2 -> purity 1.00  score 0.333
    public-safety             4/10 together, group size   4 -> purity 1.00  score 0.571
    jobs-and-economy          2/10 together, group size   6 -> purity 0.33  score 0.250
    housing                   4/10 together, group size   4 -> purity 1.00  score 0.571
    environment-and-waste     2/10 together, group size  11 -> purity 0.18  score 0.190
    education                 4/10 together, group size   6 -> purity 0.67  score 0.500
    parks-and-green-space     5/10 together, group size  11 -> purity 0.45  score 0.476

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.293  R=0.540  F1=0.380   ARI=0.372
  pair recovery 27/50 ground-truth pairs merged (54.0%)
  false merges  65 pair(s) wrongly merged, 61 of them within the same topic
  synths        19 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.663  R=0.240  F1=0.352   ARI=0.319
  topics        3 produced vs 10 expected

--- coverage ---
  75/100 statements (75.0%) ended up in some cluster; 25 left as singletons

--- worst false merges (first 8) ---
  transport/bus-frequency ↔ transport/night-service
     A: להגדיל את מספר האוטובוסים בשעות השיא כדי לקצר את זמן ההמתנה.
     B: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
  transport/bus-frequency ↔ transport/night-service
     A: להפעיל אוטובוסים בתדירות גבוהה יותר בשעות העומס כדי שאנשים לא יחכו זמן רב.
     B: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
  transport/night-service ↔ transport/free-fares-youth
     A: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
     B: להנהיג תחבורה ציבורית חינם לתלמידים מתחת לגיל שמונה עשרה.
  transport/free-fares-youth ↔ transport/night-service
     A: לאפשר לכל הילדים בגילי בית הספר לנסוע בתחבורה הציבורית בלי תשלום.
     B: להפעיל אוטובוסי לילה בסופי שבוע כדי שאנשים יוכלו לחזור הביתה בשעה מאוחרת.
  transport/bus-frequency ↔ transport/night-service
     A: להגדיל את מספר האוטובוסים בשעות השיא כדי לקצר את זמן ההמתנה.
     B: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
  transport/bus-frequency ↔ transport/night-service
     A: להפעיל אוטובוסים בתדירות גבוהה יותר בשעות העומס כדי שאנשים לא יחכו זמן רב.
     B: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
  transport/night-service ↔ transport/free-fares-youth
     A: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
     B: להנהיג תחבורה ציבורית חינם לתלמידים מתחת לגיל שמונה עשרה.
  transport/night-service ↔ transport/free-fares-youth
     A: להוסיף שירות תחבורה בשעות הלילה המאוחרות בסופי שבוע עבור נוסעים אחרי חצות.
     B: לאפשר לכל הילדים בגילי בית הספר לנסוע בתחבורה הציבורית בלי תשלום.

```

## Raw

```json
{
  "run": "live-synth-accuracy-he-seed42",
  "language": "he",
  "statements": 100,
  "composite": 0.3691151804792868,
  "grade": "poor",
  "direct": {
    "composite": 0.5230476190476191,
    "synthRate": 0.54,
    "synthCleanRate": 0.28,
    "pairsJoined": 27,
    "pairsJoinedClean": 14,
    "pairsTotal": 50,
    "clusterScore": 0.49761904761904774,
    "clusterTogetherness": 0.41,
    "clusterPurity": 0.7636363636363636,
    "themes": [
      {
        "theme": "digital-services",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 2,
        "togetherness": 0.2,
        "purity": 1,
        "score": 0.33333333333333337
      },
      {
        "theme": "health",
        "statements": 10,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "togetherness": 1,
        "purity": 1,
        "score": 1
      },
      {
        "theme": "transport",
        "statements": 10,
        "largestGroupHits": 6,
        "largestGroupSize": 6,
        "togetherness": 0.6,
        "purity": 1,
        "score": 0.7499999999999999
      },
      {
        "theme": "culture",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 2,
        "togetherness": 0.2,
        "purity": 1,
        "score": 0.33333333333333337
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "largestGroupHits": 4,
        "largestGroupSize": 4,
        "togetherness": 0.4,
        "purity": 1,
        "score": 0.5714285714285715
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 6,
        "togetherness": 0.2,
        "purity": 0.3333333333333333,
        "score": 0.25
      },
      {
        "theme": "housing",
        "statements": 10,
        "largestGroupHits": 4,
        "largestGroupSize": 4,
        "togetherness": 0.4,
        "purity": 1,
        "score": 0.5714285714285715
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "largestGroupHits": 2,
        "largestGroupSize": 11,
        "togetherness": 0.2,
        "purity": 0.18181818181818182,
        "score": 0.1904761904761905
      },
      {
        "theme": "education",
        "statements": 10,
        "largestGroupHits": 4,
        "largestGroupSize": 6,
        "togetherness": 0.4,
        "purity": 0.6666666666666666,
        "score": 0.5
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "largestGroupHits": 5,
        "largestGroupSize": 11,
        "togetherness": 0.5,
        "purity": 0.45454545454545453,
        "score": 0.47619047619047616
      }
    ]
  },
  "synth": {
    "tp": 27,
    "fp": 65,
    "fn": 23,
    "precision": 0.29347826086956524,
    "recall": 0.54,
    "f1": 0.3802816901408451,
    "predictedCount": 92,
    "truthCount": 50,
    "ari": 0.3720628513766758,
    "pairRecovery": "27/50",
    "pairRecoveryRate": 0.54,
    "falseMerges": 65,
    "falseMergesWithinTopic": 61,
    "falseMergeRate": 0.7065217391304348,
    "producedCount": 19,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 56,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 108,
    "fp": 55,
    "fn": 342,
    "precision": 0.6625766871165644,
    "recall": 0.24,
    "f1": 0.3523654159869494,
    "predictedCount": 163,
    "truthCount": 450,
    "ari": 0.3194639239520025,
    "producedCount": 3,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 75,
    "total": 100,
    "rate": 0.75
  },
  "parameters": {
    "language": "he",
    "corpus": "scripts/seedSynthBenchmark.accuracy100.he.json",
    "corpusSha": "9a5191bece66",
    "seed": 42,
    "synthesisOverrides": {
      "clusterThreshold": 0.84,
      "synthLowerBound": 0.84
    },
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 2500,
    "maxWaitMs": 20000,
    "settleTimeouts": 1,
    "durationMs": 848212,
    "gitSha": "e8e992c8a",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
