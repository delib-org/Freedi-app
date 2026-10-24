# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-he-seed42 (he) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.887  (good)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   41/50 pairs joined = 0.820   (40/50 joined cleanly, i.e. the pair and nothing else = 0.800)
  CLUSTER 0.920   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.848  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          6/10  in  7 representing group(s); biggest group touching it: 6/8  score 0.600
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    transport                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    culture                  10/10  in  5 representing group(s); biggest group touching it: 10/10  score 1.000
    public-safety            10/10  in  4 representing group(s); biggest group touching it: 10/10  score 1.000
    jobs-and-economy          8/10  in  5 representing group(s); biggest group touching it: 8/8  score 0.800
    housing                   8/10  in  5 representing group(s); biggest group touching it: 8/8  score 0.800
    environment-and-waste    10/10  in  5 representing group(s); biggest group touching it: 10/12  score 1.000
    education                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space    10/10  in  4 representing group(s); biggest group touching it: 10/10  score 1.000

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=0.953  R=0.820  F1=0.882   ARI=0.881
  pair recovery 41/50 ground-truth pairs merged (82.0%)
  false merges  2 pair(s) wrongly merged, 2 of them within the same topic
  synths        41 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.924  R=0.867  F1=0.894   ARI=0.884
  topics        12 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

--- worst false merges (first 8) ---
  parks-and-green-space/neighborhood-parks ↔ parks-and-green-space/community-gardens
     A: לוודא שפארק ירוק קטן נמצא במרחק הליכה של חמש דקות מכל בית.
     B: לתת לתושבים שטח שבו יוכלו לגדל ירקות יחד בגינות שיתופיות.
  parks-and-green-space/neighborhood-parks ↔ parks-and-green-space/community-gardens
     A: ליצור גינות כיס כך שלכל תושב יהיה שטח ירוק במרחק הליכה קצר.
     B: לתת לתושבים שטח שבו יוכלו לגדל ירקות יחד בגינות שיתופיות.

```

## Raw

```json
{
  "run": "live-synth-accuracy-he-seed42",
  "language": "he",
  "statements": 100,
  "composite": 0.8868304232021309,
  "grade": "good",
  "direct": {
    "composite": 0.848,
    "synthRate": 0.82,
    "synthCleanRate": 0.8,
    "pairsJoined": 41,
    "pairsJoinedClean": 40,
    "pairsTotal": 50,
    "clusterScore": 0.9199999999999999,
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
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 4,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "housing",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
        "score": 1
      },
      {
        "theme": "education",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "parks-and-green-space",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 4,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      }
    ]
  },
  "synth": {
    "tp": 41,
    "fp": 2,
    "fn": 9,
    "precision": 0.9534883720930233,
    "recall": 0.82,
    "f1": 0.8817204301075269,
    "predictedCount": 43,
    "truthCount": 50,
    "ari": 0.8806051967985966,
    "pairRecovery": "41/50",
    "pairRecoveryRate": 0.82,
    "falseMerges": 2,
    "falseMergesWithinTopic": 2,
    "falseMergeRate": 0.046511627906976744,
    "producedCount": 41,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 83,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 390,
    "fp": 32,
    "fn": 60,
    "precision": 0.9241706161137441,
    "recall": 0.8666666666666667,
    "f1": 0.8944954128440367,
    "predictedCount": 422,
    "truthCount": 450,
    "ari": 0.8843164151806127,
    "producedCount": 12,
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
    "settleTimeouts": 11,
    "durationMs": 3852892,
    "gitSha": "d60e3eff2",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
