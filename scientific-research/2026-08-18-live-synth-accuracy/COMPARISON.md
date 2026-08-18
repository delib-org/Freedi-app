# EN / HE comparison — live-synth accuracy

| metric | en (seed 42) | he (seed 42) | Δ |
| --- | --- | --- | --- |
| ACCURACY (composite) | 0.592 | 0.369 | -0.223 |
| grade | fair | poor |  |
| synth F1 | 0.765 | 0.380 | -0.385 |
| synth precision | 1.000 | 0.293 | -0.707 |
| synth recall | 0.620 | 0.540 | -0.080 |
| synth ARI | 0.764 | 0.372 | -0.392 |
| pair recovery rate | 0.620 | 0.540 | -0.080 |
| false merges (pairs) | 0.000 | 65.000 | +65.000 |
| synths produced | 31.000 | 19.000 | -12.000 |
| topic F1 | 0.331 | 0.352 | +0.021 |
| topic precision | 0.738 | 0.663 | -0.076 |
| topic recall | 0.213 | 0.240 | +0.027 |
| topics produced | 6.000 | 3.000 | -3.000 |
| coverage rate | 0.970 | 0.750 | -0.220 |

## Runs

- **en** — `runs/en-seed42-cluster078-debounce1500`, corpus `scripts/seedSynthBenchmark.accuracy100.en.json` (sha 8fdcaccc66dd), settings: {"clusterThreshold":0.78}, git 1e5444e7a
- **he** — `runs/he-seed42-large-cluster084`, corpus `scripts/seedSynthBenchmark.accuracy100.he.json` (sha 9a5191bece66), settings: {"clusterThreshold":0.84,"synthLowerBound":0.84}, git e8e992c8a

> Both corpora encode the same ground truth (10 topics x 5 synth-groups x 2
> paraphrases), and the Hebrew statements are sentence-by-sentence translations of
> the English, so a gap in these numbers is a language effect rather than a
> difference in task difficulty. Check each corpus's separability first
> (`npx tsx scripts/preflightCorpusCosines.ts <corpus>`): when a language's
> ground-truth partners are not nearest neighbours, the ceiling is set by the
> embedding model and no threshold change can lift the score.
