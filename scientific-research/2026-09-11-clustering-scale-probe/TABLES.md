# Tables — clustering-scale probe

Labels: **PROVISIONAL** (`frozen/labels.jsonl`, sha256 eb7cd6c3ffbe…). Cells scored 240/240; missing 0. Smoke calls excluded.

## Decision outcomes — all 20 test queries (strict labels)

| N | method | cells | correct | false join | miss (abstain) | miss (not retrieved) | invalid | truncated | technical | predicted joins | join precision | false-join fraction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | A | 40 | 28 | 1 | 11 | 0 | 0 | 0 | 0 | 10 | 90.0% | 2.5% |
| 100 | B | 40 | 24 | 0 | 16 | 0 | 0 | 0 | 0 | 4 | 100.0% | 0.0% |
| 200 | A | 40 | 31 | 0 | 9 | 0 | 0 | 0 | 0 | 11 | 100.0% | 0.0% |
| 200 | B | 40 | 25 | 0 | 15 | 0 | 0 | 0 | 0 | 5 | 100.0% | 0.0% |
| 500 | A | 40 | 31 | 0 | 9 | 0 | 0 | 0 | 0 | 11 | 100.0% | 0.0% |
| 500 | B | 40 | 25 | 0 | 15 | 0 | 0 | 0 | 0 | 5 | 100.0% | 0.0% |

## Match-present queries (10)

| N | method | cells | correct | false join | miss (abstain) | miss (not retrieved) | invalid | truncated | technical | predicted joins | join precision | false-join fraction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | A | 20 | 9 | 0 | 11 | 0 | 0 | 0 | 0 | 9 | 100.0% | 0.0% |
| 100 | B | 20 | 4 | 0 | 16 | 0 | 0 | 0 | 0 | 4 | 100.0% | 0.0% |
| 200 | A | 20 | 11 | 0 | 9 | 0 | 0 | 0 | 0 | 11 | 100.0% | 0.0% |
| 200 | B | 20 | 5 | 0 | 15 | 0 | 0 | 0 | 0 | 5 | 100.0% | 0.0% |
| 500 | A | 20 | 11 | 0 | 9 | 0 | 0 | 0 | 0 | 11 | 100.0% | 0.0% |
| 500 | B | 20 | 5 | 0 | 15 | 0 | 0 | 0 | 0 | 5 | 100.0% | 0.0% |

## No-match queries (10)

| N | method | cells | correct | false join | miss (abstain) | miss (not retrieved) | invalid | truncated | technical | predicted joins | join precision | false-join fraction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | A | 20 | 19 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0.0% | 5.0% |
| 100 | B | 20 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | undefined | 0.0% |
| 200 | A | 20 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | undefined | 0.0% |
| 200 | B | 20 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | undefined | 0.0% |
| 500 | A | 20 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | undefined | 0.0% |
| 500 | B | 20 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | undefined | 0.0% |

## Sensitivity — lenient labels (borderline items count as allowable matches)

| N | method | cells | correct | false join | miss (abstain) | miss (not retrieved) | invalid | truncated | technical | predicted joins | join precision | false-join fraction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | A | 40 | 16 | 0 | 24 | 0 | 0 | 0 | 0 | 10 | 100.0% | 0.0% |
| 100 | B | 40 | 10 | 0 | 30 | 0 | 0 | 0 | 0 | 4 | 100.0% | 0.0% |
| 200 | A | 40 | 17 | 0 | 23 | 0 | 0 | 0 | 0 | 11 | 100.0% | 0.0% |
| 200 | B | 40 | 11 | 0 | 29 | 0 | 0 | 0 | 0 | 5 | 100.0% | 0.0% |
| 500 | A | 40 | 17 | 0 | 23 | 0 | 0 | 0 | 0 | 11 | 100.0% | 0.0% |
| 500 | B | 40 | 11 | 0 | 29 | 0 | 0 | 0 | 0 | 5 | 100.0% | 0.0% |

## Candidate recall of B (top-15 exact cosine, text-embedding-3-small)

| N | positive queries | ≥1 approved target retrieved | best approved rank (per query) |
|---|---|---|---|
| 100 | 10 | 10 | 1, 1, 1, 1, 1, 1, 2, 1, 2, 1 |
| 200 | 10 | 10 | 1, 1, 1, 1, 2, 1, 1, 1, 2, 1 |
| 500 | 10 | 10 | 1, 2, 1, 1, 2, 1, 1, 1, 1, 2 |

## Resources per call (means)

| N | method | calls | attempts | prompt tokens | cache-write | cached read | completion (max) | reasoning | billed $/call | undiscounted $/call | API ms | retrieval ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | A | 40 | 40 | 2734 | 2731 | 0 | 157 (414) | 108 | $0.00087 | $0.00073 | 2382 | 0.00 |
| 100 | B | 40 | 40 | 661 | 0 | 0 | 125 (209) | 76 | $0.00028 | $0.00028 | 1873 | 0.16 |
| 200 | A | 40 | 40 | 5150 | 5147 | 0 | 141 (370) | 93 | $0.00146 | $0.00120 | 2053 | 0.00 |
| 200 | B | 40 | 40 | 658 | 0 | 0 | 130 (275) | 81 | $0.00029 | $0.00029 | 1957 | 0.32 |
| 500 | A | 40 | 40 | 12520 | 12517 | 0 | 144 (343) | 96 | $0.00330 | $0.00268 | 2199 | 0.00 |
| 500 | B | 40 | 40 | 654 | 0 | 0 | 138 (334) | 88 | $0.00030 | $0.00030 | 1943 | 0.90 |

## Paired A vs B (same query, size, order)

| N | pairs | both correct | only A correct | only B correct | neither | false joins A / B | identical decision | median A/B cost (undiscounted) [IQR] | median A/B cost (billed) | median A/B prompt tokens |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 40 | 22 | 6 | 2 | 10 | 1 / 0 | 32 | 2.55× [2.27–2.84] | 2.99× | 4.17× |
| 200 | 40 | 25 | 6 | 0 | 9 | 0 / 0 | 34 | 4.29× [3.76–4.64] | 5.20× | 7.93× |
| 500 | 40 | 25 | 6 | 0 | 9 | 0 / 0 | 34 | 9.38× [8.26–10.17] | 11.58× | 19.03× |

## Position manipulation (method A; correct at anchor ≈5% / ≈50% of list, of n)

| N | match-present | no-match |
|---|---|---|
| 100 | 5 / 4 of 10 | 10 / 9 of 10 |
| 200 | 5 / 6 of 10 | 10 / 10 of 10 |
| 500 | 6 / 5 of 10 | 10 / 10 of 10 |

## Query-block bootstrap (2,000 resamples, stratified; 95% percentile intervals)

| N | correct A | correct B | B − A correct | B − A false-join rate | median A/B cost |
|---|---|---|---|---|---|
| 100 | 70.0% [57.5%, 82.5%] | 60.0% [50.0%, 75.0%] | -10.0% [-25.0%, 5.0%] | -2.5% [-7.5%, 0.0%] | 2.55 [2.39, 2.76]× |
| 200 | 77.5% [65.0%, 90.0%] | 62.5% [52.5%, 72.6%] | -15.0% [-25.0%, -5.0%] | 0.0% [0.0%, 0.0%] | 4.29 [4.09, 4.45]× |
| 500 | 77.5% [62.5%, 92.5%] | 62.5% [50.0%, 75.0%] | -15.0% [-27.5%, -2.5%] | 0.0% [0.0%, 0.0%] | 9.38 [8.87, 9.79]× |

## Per-query outcomes (strict)

| query | status | 100 o0 A/B | 100 o1 A/B | 200 o0 A/B | 200 o1 A/B | 500 o0 A/B | 500 o1 A/B |
|---|---|---|---|---|---|---|---|
| ptgpf | match | ✓/✓ | MA/✓ | ✓/MA | ✓/✓ | ✓/MA | ✓/✓ |
| paak8 | match | ✓/MA | ✓/MA | ✓/✓ | ✓/MA | ✓/✓ | ✓/✓ |
| pnyg7 | match | MA/MA | ✓/MA | ✓/MA | ✓/MA | ✓/MA | ✓/MA |
| pc3m2 | match | MA/MA | MA/MA | MA/MA | MA/MA | MA/MA | MA/MA |
| pyr2u | match | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| pymzr | match | MA/MA | MA/MA | MA/MA | ✓/✓ | MA/MA | MA/MA |
| peqy9 | match | MA/MA | MA/MA | MA/MA | MA/MA | MA/MA | MA/MA |
| pktbx | match | ✓/MA | ✓/MA | ✓/MA | MA/MA | ✓/MA | ✓/MA |
| ptwgu | match | MA/MA | MA/MA | MA/MA | ✓/MA | ✓/MA | MA/MA |
| p6xjr | match | ✓/MA | MA/MA | MA/MA | MA/MA | MA/MA | MA/MA |
| p8jmp | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| pppcy | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| p68um | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| ptcr8 | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| pu3fh | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| pqeyn | none | ✓/✓ | FJ/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| pns2r | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| pxn3z | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| pugud | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |
| pudtd | none | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ |

✓ correct · FJ false join · MA abstained although a match was shown · MR match not retrieved · INV invalid output · TR truncated · TE technical failure

## Pre-registered triage criterion at N = 500

```json
{
  "labelStatus": "PROVISIONAL",
  "cost": {
    "medianRatio": 9.38036057518287,
    "threshold": 2,
    "pass": true
  },
  "falseJoins": {
    "A": 0,
    "B": 0,
    "allowedExcess": 1,
    "pass": true
  },
  "incorrect": {
    "A": 9,
    "B": 15,
    "allowedExcess": 2,
    "pass": false
  },
  "recall": {
    "perSize": [
      "10/10",
      "10/10",
      "10/10"
    ],
    "threshold": "9/10 at every size",
    "pass": true
  },
  "allPass": false
}
```
