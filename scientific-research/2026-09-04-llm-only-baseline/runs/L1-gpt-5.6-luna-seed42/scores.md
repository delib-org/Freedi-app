# Accuracy score

```

=== Live-synth accuracy — llm-only-L1-gpt-5.6-luna-seed42 (en) ===
statements: 100   ground truth: 50 synths in 10 topics

ACCURACY  0.918  (excellent)    = 0.6·F1_synth + 0.4·F1_topic

--- direct accuracy: how many did it actually get right? ---
  SYNTH   50/50 pairs joined = 1.000   (50/50 joined cleanly, i.e. the pair and nothing else = 1.000)
  CLUSTER 0.860   = share of each theme's statements sitting in a group that represents that theme, averaged over 10 themes
  COMBINED 0.944  = 0.6·synth(clean) + 0.4·cluster

  per theme:   gathered into groups that stand for the theme / its statements
    digital-services          8/10  in  6 representing group(s); biggest group touching it: 8/10  score 0.800
    health                   10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    transport                10/10  in  6 representing group(s); biggest group touching it: 10/12  score 1.000
    culture                  10/10  in  6 representing group(s); biggest group touching it: 10/12  score 1.000
    public-safety             8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    jobs-and-economy          8/10  in  6 representing group(s); biggest group touching it: 8/8  score 0.800
    housing                  10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    environment-and-waste    10/10  in  6 representing group(s); biggest group touching it: 10/16  score 1.000
    education                10/10  in  6 representing group(s); biggest group touching it: 10/10  score 1.000
    parks-and-green-space     2/10  in  5 representing group(s); biggest group touching it: 6/16  score 0.200

--- synth level (did each paraphrase pair merge?) ---
  pairwise      P=1.000  R=1.000  F1=1.000   ARI=1.000
  pair recovery 50/50 ground-truth pairs merged (100.0%)
  false merges  0 pair(s) wrongly merged, 0 of them within the same topic
  synths        50 produced vs 50 expected

--- topic level (did the 5 synths of a theme group together?) ---
  pairwise      P=0.763  R=0.831  F1=0.796   ARI=0.774
  topics        9 produced vs 10 expected

--- coverage ---
  100/100 statements (100.0%) ended up in some cluster; 0 left as singletons

```

## Raw

```json
{
  "run": "llm-only-L1-gpt-5.6-luna-seed42",
  "language": "en",
  "statements": 100,
  "composite": 0.9182978723404256,
  "grade": "excellent",
  "direct": {
    "composite": 0.944,
    "synthRate": 1,
    "synthCleanRate": 1,
    "pairsJoined": 50,
    "pairsJoinedClean": 50,
    "pairsTotal": 50,
    "clusterScore": 0.8599999999999998,
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
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
        "score": 1
      },
      {
        "theme": "culture",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 12,
        "score": 1
      },
      {
        "theme": "public-safety",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "jobs-and-economy",
        "statements": 10,
        "gathered": 8,
        "representingGroups": 6,
        "largestGroupHits": 8,
        "largestGroupSize": 8,
        "score": 0.8
      },
      {
        "theme": "housing",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 10,
        "score": 1
      },
      {
        "theme": "environment-and-waste",
        "statements": 10,
        "gathered": 10,
        "representingGroups": 6,
        "largestGroupHits": 10,
        "largestGroupSize": 16,
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
    "fp": 0,
    "fn": 0,
    "precision": 1,
    "recall": 1,
    "f1": 1,
    "predictedCount": 50,
    "truthCount": 50,
    "ari": 1,
    "pairRecovery": "50/50",
    "pairRecoveryRate": 1,
    "falseMerges": 0,
    "falseMergesWithinTopic": 0,
    "falseMergeRate": 0,
    "producedCount": 50,
    "expectedCount": 50,
    "fragmentedGroundTruthSynths": 0,
    "statementsInAnySynth": 100,
    "statementsClaimedByMultipleSynths": 0
  },
  "topic": {
    "tp": 374,
    "fp": 116,
    "fn": 76,
    "precision": 0.763265306122449,
    "recall": 0.8311111111111111,
    "f1": 0.7957446808510639,
    "predictedCount": 490,
    "truthCount": 450,
    "ari": 0.7743589743589744,
    "producedCount": 9,
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
    "condition": "L1",
    "model": "gpt-5.6-luna"
  }
}
```
