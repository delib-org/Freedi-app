# Accuracy score

```

=== Live-synth accuracy — live-synth-accuracy-en-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.791  (good)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   48/50 pairs joined = 0.960   (48/50 joined cleanly, i.e. the pair and nothing else = 0.960)
  CLUSTER 0.520   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.784  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    arts-and-culture          2/10  in  5 representing group(s); biggest group touching it: 8/20  score 0.200
    public-safety             4/10  in  7 representing group(s); biggest group touching it: 4/4  score 0.400
    public-transportation     2/10  in  5 representing group(s); biggest group touching it: 10/28  score 0.200
    street-maintenance        2/10  in  5 representing group(s); biggest group touching it: 8/28  score 0.200
    waste-management         10/10  in  6 representing group(s); biggest group touching it: 10/16  score 1.000
    local-economy             8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    housing-affordability    10/10  in  6 representing group(s); biggest group touching it: 10/12  score 1.000
    energy-and-climate        2/10  in  3 representing group(s); biggest group touching it: 6/16  score 0.200
    digital-connectivity     10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-recreation      2/10  in  5 representing group(s); biggest group touching it: 8/20  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=0.960  F1=0.980   ARI=0.979
  pair recovery 48/50 ground-truth pairs merged (96.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        48 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.391  R=0.724  F1=0.508   ARI=0.442
  topics        8 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

```

## Raw

```json
{
  "run": "live-synth-accuracy-en-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.7908703668383241,
  "grade": "good",
  "direct": {
    "composite": 0.784,
    "synthRate": 0.96,
    "synthCleanRate": 0.96,
    "pairsJoined": 48,
    "pairsJoinedClean": 48,
    "pairsTotal": 50,
    "clusterScore": 0.52,
    "themes": [
      {
        "theme": "arts-and-culture",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 20,
        "score": 0.2
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
        "theme": "public-transportation",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 10,
        "largestGroupSize": 28,
        "score": 0.2
      },
      {
        "theme": "street-maintenance",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 28,
        "score": 0.2
      },
      {
        "theme": "waste-management",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 16,
        "score": 1
      },
      {
        "theme": "local-economy",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "housing-affordability",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
        "score": 1
      },
      {
        "theme": "energy-and-climate",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 3,
        "largestGroupHits": 6,
        "largestGroupSize": 16,
        "score": 0.2
      },
      {
        "theme": "digital-connectivity",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "parks-and-recreation",
        "statements": 10,
        "gathered": 2,
        "representingGroups": 5,
        "largestGroupHits": 8,
        "largestGroupSize": 20,
        "score": 0.2
      }
    ]
  },
  "synth": {
    "tp": 48,
    "fp": 0,
    "fn": 2,
    "precision": 1,
    "recall": 0.96,
    "f1": 0.9795918367346939,
    "predictedCount": 48,
    "truthCount": 50,
    "ari": 0.9793878825733916,
    "pairRecovery": "48/50",
    "pairRecoveryRate": 0.96,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 48,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 96,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 326,
    "fp": 508,
    "fn": 124,
    "precision": 0.3908872901678657,
    "recall": 0.7244444444444444,
    "f1": 0.5077881619937695,
    "predictedCount": 834,
    "truthCount": 450,
    "ari": 0.4418754014129736,
    "producedCount": 8,
    "expectedCount": 10
  },
  "coverage": {
    "covered": 100,
    "total": 100,
    "rate": 1
  },
  "parameters": {
    "language": "en",
    "corpus": "scripts/seedSynthBenchmark.accuracy100.gemini.en.json",
    "corpusSha": "4572380cd9c1",
    "seed": 42,
    "synthesisOverrides": {},
    "statementsFed": 100,
    "pumpEvery": 10,
    "rejudgeEvery": 5,
    "minWaitMs": 4000,
    "quietMs": 12000,
    "maxWaitMs": 45000,
    "settleTimeouts": 1,
    "durationMs": 3583747,
    "gitSha": "230936363",
    "models": {
      "embedding": "text-embedding-3-small",
      "heavy": "gpt-5.6-terra",
      "fast": "gpt-5.6-luna"
    }
  }
}
```
