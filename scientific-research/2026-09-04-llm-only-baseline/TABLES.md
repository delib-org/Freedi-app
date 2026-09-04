## Per-run results

| run | composite | synth F1 (P / R) | pairs clean | false merges | topic F1 (P / R) | synths | topics | coverage | invalid | calls | tokens in / out | cost | wall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `L1-gpt-5.6-luna-seed1234` | **0.949** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.873 (0.810 / 0.947) | 50 | 9 | 100/100 | 0 | 1 | 1669 / 2178 | $0.0029 | 22.7s |
| `L1-gpt-5.6-luna-seed42` | **0.918** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.796 (0.763 / 0.831) | 50 | 9 | 100/100 | 2 unfiled syn | 1 | 1669 / 2221 | $0.0030 | 24.0s |
| `L1-gpt-5.6-luna-seed7` | **0.931** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.826 (0.789 / 0.867) | 50 | 10 | 100/100 | 1 unfiled syn | 1 | 1669 / 2092 | $0.0028 | 22.3s |
| `L1-gpt-5.6-terra-seed1234` | **0.918** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.796 (0.736 / 0.867) | 50 | 9 | 100/100 | 0 | 1 | 1669 / 2148 | $0.0291 | 18.8s |
| `L1-gpt-5.6-terra-seed42` | **0.955** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.887 (0.841 / 0.938) | 50 | 10 | 100/100 | 0 | 1 | 1669 / 2291 | $0.0308 | 19.8s |
| `L1-gpt-5.6-terra-seed7` | **0.937** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.843 (0.771 / 0.929) | 50 | 9 | 100/100 | 0 | 1 | 1669 / 1828 | $0.0253 | 18.5s |
| `L2-gpt-5.6-luna-seed1234` | **0.984** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.960 (0.956 / 0.964) | 50 | 10 | 100/100 | 0 | 101 | 90899 / 9007 | $0.0290 | 187.0s |
| `L2-gpt-5.6-luna-seed42` | **0.972** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.930 (0.914 / 0.947) | 50 | 10 | 100/100 | 0 | 101 | 91662 / 8885 | $0.0290 | 189.1s |
| `L2-gpt-5.6-luna-seed7` | **0.937** | 1.000 (1.000 / 1.000) | 50/50 | 0 | 0.844 (0.785 / 0.911) | 50 | 9 | 100/100 | 0 | 101 | 91545 / 9320 | $0.0295 | 193.8s |

## Summary — mean (range) over seeds

| condition × model | seeds | composite mean (range) | synth F1 mean (range) | pairs clean | false merges | topic F1 mean (range) | topics | calls / run | tokens / run (in+out) | cost / run | wall / run |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L1-gpt-5.6-luna | 1234, 42, 7 | **0.933 (0.918–0.949)** | 1.000 (1.000–1.000) | 50/50/50 of 50 | 0/0/0 | 0.832 (0.796–0.873) | 9/9/10 | 1.0 | 3833 | $0.0029 | 23.0s |
| L1-gpt-5.6-terra | 1234, 42, 7 | **0.937 (0.918–0.955)** | 1.000 (1.000–1.000) | 50/50/50 of 50 | 0/0/0 | 0.842 (0.796–0.887) | 9/10/9 | 1.0 | 3758 | $0.0284 | 19.0s |
| L2-gpt-5.6-luna | 1234, 42, 7 | **0.965 (0.937–0.984)** | 1.000 (1.000–1.000) | 50/50/50 of 50 | 0/0/0 | 0.911 (0.844–0.960) | 10/10/9 | 101.0 | 100439 | $0.0292 | 190.0s |

## L3 — order consistency (synthesis partitions across seeds)

| condition × model | ARI seed pairs (42↔7, 42↔1234, 7↔1234) | mean ARI | GT pairs merged in ALL 3 seeds | merged in ≥1 seed | merged in 0 seeds |
|---|---|---|---|---|---|
| L1-gpt-5.6-luna | 42↔7: 1.000, 42↔1234: 1.000, 7↔1234: 1.000 | **1.000** | 50/50 | 50/50 | 0 |
| L1-gpt-5.6-terra | 42↔7: 1.000, 42↔1234: 1.000, 7↔1234: 1.000 | **1.000** | 50/50 | 50/50 | 0 |
| L2-gpt-5.6-luna | 42↔7: 1.000, 42↔1234: 1.000, 7↔1234: 1.000 | **1.000** | 50/50 | 50/50 | 0 |

## L2 — decision statistics

| run | join decisions | new decisions | joins refused (conf < 0.6) | invalid outputs | syntheses incl. singletons | multi-member syntheses | mean prompt tokens / step | max prompt tokens / step | total tokens | of which reasoning |
|---|---|---|---|---|---|---|---|---|---|---|
| `L2-gpt-5.6-luna-seed1234` | 50 | 50 | 0 | 0 | 50 | 50 | 893 | 1599 | 99906 | 3265 |
| `L2-gpt-5.6-luna-seed42` | 50 | 50 | 0 | 0 | 50 | 50 | 901 | 1599 | 100547 | 3182 |
| `L2-gpt-5.6-luna-seed7` | 50 | 50 | 0 | 0 | 50 | 50 | 900 | 1599 | 100865 | 3545 |

## Topic layer — statements of each theme gathered into a group that represents it (of 10)

| run | culture | digital-services | education | environment-and-waste | health | housing | jobs-and-economy | parks-and-green-space | public-safety | transport | cluster score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `L1-gpt-5.6-luna-seed1234` | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 2 | 10 | 10 | 0.920 |
| `L1-gpt-5.6-luna-seed42` | 10 | 8 | 10 | 10 | 10 | 10 | 8 | 2 | 8 | 10 | 0.860 |
| `L1-gpt-5.6-luna-seed7` | 8 | 10 | 10 | 10 | 10 | 10 | 10 | 2 | 10 | 8 | 0.880 |
| `L1-gpt-5.6-terra-seed1234` | 8 | 10 | 10 | 10 | 10 | 10 | 10 | 2 | 8 | 10 | 0.880 |
| `L1-gpt-5.6-terra-seed42` | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 2 | 10 | 10 | 0.920 |
| `L1-gpt-5.6-terra-seed7` | 8 | 10 | 10 | 10 | 10 | 10 | 10 | 2 | 10 | 10 | 0.900 |
| `L2-gpt-5.6-luna-seed1234` | 8 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 0.980 |
| `L2-gpt-5.6-luna-seed42` | 10 | 10 | 10 | 10 | 10 | 10 | 10 | 6 | 10 | 10 | 0.960 |
| `L2-gpt-5.6-luna-seed7` | 8 | 10 | 10 | 10 | 10 | 10 | 10 | 2 | 10 | 10 | 0.900 |
