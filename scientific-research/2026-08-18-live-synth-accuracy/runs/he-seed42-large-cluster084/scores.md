# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.369  (poor)    = 0.6·F1_synth + 0.4·F1_topic

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
