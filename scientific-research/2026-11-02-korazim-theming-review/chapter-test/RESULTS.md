# Chapter test: results (2 November 2026)

Criteria, prompts and thresholds were committed before any model call (`PREREGISTRATION.md`). Nothing was changed afterwards. Scored by `score.py`; all numbers are in `results/chapter_metrics.json`. Raw model outputs and inputs (which quote residents) are outside the repo.

**Run.** `gpt-5.6-terra`, 2 arms x 2 questions x 5 repeats = 20 calls, all returned. Q.A: 16 themes, 111 member texts, about 4,900 prompt tokens. Q.B: 27 themes, 164 member texts, about 8,400 prompt tokens. Total spent $0.373; mean $0.019 per run (neutral $0.0190, professional $0.0184), about 6.6k input and 450 output tokens per call on average.

## Verdict

**The idea fails as preregistered.** The neutral arm (the primary one) misses 2 of 10 criteria, the professional arm 5 of 10. The method does carry signal: it beats random grouping and does not lump. But it recovers fewer than half of the pairs Sigal joined, and a different run gives a noticeably different set of chapters. Per the plan, the product default is **themes ungrouped, with admins grouping them in the DOCX**.

## Criteria

Baselines: random = shuffles with the same chapter sizes as the run (5,000 each); ungrouped = J 0, K 0; all-in-one = J 1, K 1, PPV .054 (Q.B).

| # | Criterion | Threshold | Random baseline | Neutral | | Professional | |
|---|---|---|---|---|---|---|---|
| C1a | Recall of her joins (J), pooled | >= .50 | .108 / .118 | **.457** | **FAIL** | .504 | pass |
| C1b | Beats random (permutation p < .05) | >= 80% of runs | 5% of runs expected | 8 of 10 runs | pass | 7 of 9 runs (78%) | **FAIL** |
| C2 | Precision of joins (PPV), pooled | >= .25 | .065 / .063 | .251 | pass (barely) | .248 | **FAIL** (barely) |
| C3a | False joins of pairs she kept apart (K) | <= .15 | .108 / .118 | .086 | pass | .095 | pass |
| C3b | Largest chapter | <= 40% of themes, every run | | 31% max | pass | 31% max | pass |
| C4 | Umbrellas recovered (>= 3 of 5, each in >= 60% of runs) | >= 3 | well under 1 | 4 of 5 | pass | 2 of 5 | **FAIL** |
| C5 | Stability, mean pairwise ARI between repeats | >= .70 on each question | .00 | A .656, B .743 | **FAIL** (Q.A) | A .612, B .557 | **FAIL** |
| C6 | Chapter count | ratio <= .85, >= 4 chapters | ungrouped = 1.0 | ratio .40, min 6 | pass | ratio .38, min 6 | pass |
| C7 | Cost per run | <= $0.25 | | $0.019 | pass | $0.018 | pass |
| C8 | Valid partitions | all valid | | 10 of 10 | pass | 9 of 10 (one left a theme out) | **FAIL** |

The two arms are not distinguishable from each other on these data; the professional arm's failures are mostly small margins and one invalid answer, and with 5 repeats a difference of this size is within noise.

### Other numbers

- **Agreement with her partition (ARI), reported only:** neutral .27, professional .27; random groupings with the same sizes: mean .00, 95th percentile about .13. (The structural ARI of .62 to .64 in the study was against the live list she had edited; it is not comparable.)
- **Chapters:** both arms gave 6 to 10 chapters (mean 40% of the themes) against her 11 and 19 topics at theme level. The model coarsens more than she did, so a good deal of J is out of reach by design, while K stays low. Largest chapter: 3 to 7 themes.
- **Umbrellas, neutral arm, runs recovering them:** "חזות הישוב" 4/5, "תרבות קהילתית" 5/5, "בינוי קהילה" 4/5, "שיח ציבורי" 5/5, "שיפור פני הכפר" 0/5. Professional arm (valid runs): 3/4, 2/4, 2/5, 4/5, 0/5. "שיפור פני הכפר" (gardening plus shade and paths) was never recovered.
- **Stability:** the lowest pairwise ARI was .42 (neutral, Q.A) and .26 (professional, Q.B). A report whose chapters differ between runs is a product problem even when each version is reasonable.
- **Q.A is the weak case on joins:** neutral J is .44 in four runs and .22 in one; 9 joined pairs make each run coarse.
- **Chapter names** (one run per arm and question) are listed in the hand-off report; they are the model's own and use plain words ("מרקם קהילתי וערבות", "תרבות, פנאי ואירועים") rather than the profession's, in both arms.

## Limits

- **One rater, anchored on the system's list.** Sigal edited the live themes into her topics; agreement with her is the only target. Other facilitators could group differently, and the model's alternative groupings (above) are not shown to be worse.
- **Five merge decisions.** The umbrella criterion rests on 5 groupings; pair measures use 28 joined pairs that are not independent.
- **Post hoc case study.** One community, two questions, Hebrew, an idea formed after seeing her edits.
- **No glossary.** The plan's professional glossary was not available and her terms were kept out of the prompts, so this measures grouping without one. A glossary could help or hurt.
- **Thresholds are judgement calls.** C1a missed by .04 and C2 passed by .001; a different line would change the pass/fail count for the neutral arm, but not the picture (clearly better than random, clearly not stable, recovers less than half of her joins).
- **Coarseness mismatch.** Her topics are finer than the model's chapters, and the prompt gave no target (only "at least 3, at most 12"), which was the preregistered choice. Asking for a number of chapters is a separate, labelled round.
- Theme-level scoring ignores her two split themes and single-statement moves. Chapter-name quality was not rated. Member text was cut to 160 characters.
- Cost is for the grouping call only, not the report writing.
