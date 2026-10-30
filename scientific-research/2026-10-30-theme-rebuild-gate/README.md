# Theme rebuild offline gate (2026-10-30)

**Question.** Does the admin "Re-theme with AI" batch rebuild (`rebuildThemes`,
`functions/src/synthesis/themeRebuild/`) produce better themes than the live
theme layer, and leave syntheses alone?

**Answer: it's much better on average, but it fails the strict gate.** Mean
topic F1 goes from 0.757 (live) to 0.864 / 0.866 over two repeats, and
syntheses don't change. In 15 of the 16 run × repeat pairs the rebuild is at
least as good as live. The exception is he-seed42-large-judgedattach in
repeat 1 (0.805 against a live 0.910). That state already had the best live
theme layer of the eight. The gate requires mean ≥ 0.80 **and** rebuild ≥ live
in every run, so the result is a **FAIL**, by one cell.

## Method

`scripts/rebuild.mjs` uses the **compiled, unmodified** production modules
(`functions/lib/.../synthesis/themeRebuild`):

1. Build atoms the same way `collectAtoms` does: every visible synthesis, plus
   every plain option that isn't in a synthesis, each converted with
   `toRebuildAtom` (title plus a description trimmed to 160 characters).
2. Run `discoverThemes` once (gpt-5.6-terra, sees all atoms), then
   `assignAtoms` (gpt-5.6-luna, batches of 40, retry, unanswered → NONE).
3. Write a `results.json` in which `topicClusters` is the rebuilt theme list
   and `synths` is copied unchanged. Atoms answered NONE ("Other ideas") are
   put in no theme. Score with the official `score100.mjs`.

The input is the same 8 saved end states the
[refile study](../2026-10-24-theme-refile-pass/README.md) used: EN on
3-small and HE on 3-large, 100 statements, 10 true topics. Each state ran
twice, because the LLM isn't deterministic.

## Results (baseline prompt, as on the branch)

| run | live topic F1 (themes) | rebuild run 1 F1 (themes, Other) | rebuild run 2 F1 (themes, Other) | synth F1 live / rebuild |
|---|---|---|---|---|
| en-seed42-themefix | 0.652 (16) | 0.846 (9, 0) | 0.808 (11, 0) | 1.000 / 1.000 |
| en-seed42-consolidated | 0.775 (11) | 0.912 (11, 1) | 0.894 (12, 1) | 1.000 / 1.000 |
| en-seed7-consolidated | 0.763 (10) | 0.882 (10, 0) | 0.941 (10, 1) | 1.000 / 1.000 |
| en-seed1234-consolidated | 0.711 (17) | 0.895 (11, 0) | 0.851 (11, 0) | 1.000 / 1.000 |
| en-seed42-filingfix | 0.770 (14) | 0.834 (12, 2) | 0.886 (11, 2) | 0.990 / 0.990 |
| he-seed42-large-formulation | 0.658 (11) | 0.854 (13, 1) | 0.722 (15, 1) | 0.857 / 0.857 |
| he-seed42-large-judgedattach | 0.910 (10) | **0.805** (15, 1) | 0.945 (11, 0) | 0.947 / 0.947 |
| he-seed42-large-recall | 0.816 (12) | 0.883 (13, 1) | 0.883 (14, 0) | 0.882 / 0.882 |
| **mean** | **0.757** | **0.864** | **0.866** | unchanged |

- **Precision is the big gain:** topic precision 0.784 live → 0.913 / 0.921.
  Recall gains too: 0.739 → 0.828 / 0.820. One look at the whole question
  makes fewer cross-topic groups than filing one idea at a time.
- **Too many themes is the failure mode, mostly in Hebrew.** HE runs got 13–15
  themes against 10 true topics, and twice hit `MAX_THEMES = 15`. The failing
  cell split single domains into 1–2 member sub-themes: solar and air
  monitoring apart from recycling, "ageing at home" apart from health, "data
  transparency" apart from digital services. It didn't restate the question
  or make a catch-all. The largest theme held ≤ 9 of ~50 atoms.
- **Variance is large.** On one state the two repeats differ by up to 0.14
  (formulation 0.854 / 0.722, judgedattach 0.805 / 0.945), more than the gap
  the per-run rule tests.
- **Other ideas** stays at 0–2 atoms per run.

## One revision tried (rejected)

Commit `cd91fc5d4` added `MIN_PROPOSALS_PER_THEME = 3` and a discovery
instruction: "each theme should cover at least 3 proposals… widen a larger
theme's rule instead… fewer, well-separated themes". It is reverted in
`35610afa9`, so the branch has the baseline prompt.

| | mean topic F1 | mean P / R | themes | Other | judgedattach |
|---|---|---|---|---|---|
| baseline run 1 / 2 | 0.864 / 0.866 | 0.913 / 0.828, 0.921 / 0.820 | 9–15 | 0–2 | 0.805 / 0.945 |
| revision rev1 / rev2 | 0.814 / 0.857 | 0.768 / 0.868, 0.821 / 0.897 | 9–10 | 0 | 0.882 / 0.815 |

The revision fixed the count: 9–10 themes, close to the true 10. But it got
there by merging neighbouring domains, for example culture with parks
(18 members), so precision fell more than recall rose. It still dropped below
live on judgedattach in both repeats, so it isn't adopted. Full tables:
`results/summary-rev1-rev2.md`.

## Bq-VQPMPiG7b (narrow production question, 114 statements)

Fanny's 36-cluster labels are no longer on disk: `~/Downloads/statements_full.xlsx`
now has only id and text, so `scoreVsFanny.py` **was skipped**. What exists is
Fany's and Tal's verdict per statement, "fits / doesn't fit its v3 theme"
(`comparison_Fany_Tal.xlsx`, state built with the refile study's
`bq_state.py`). `scripts/bq_proxy.py` reports these proxies. Participant text
stays in the scratchpad and is not in git.

| | themes | unthemed / Other (statements) | largest theme share | accepted v3 pairs kept together | (flagged, accepted) pairs split |
|---|---|---|---|---|---|
| v3 live | 7 | 26 | 0.273 | 1.000 (by definition) | 0.000 (by definition) |
| rebuild run 1 | 12 | 5 | 0.147 | 0.303 | 0.820 |
| rebuild run 2 | 10 | 17 | 0.175 | 0.215 | 0.842 |

The rebuild has no catch-all theme (largest share 0.15–0.18) and splits off
82–84% of the statements the humans flagged as misfits. It also breaks up most
of v3's accepted groupings, because it uses 10–12 finer themes instead of 7
broad ones. A "fits" verdict on a broad theme doesn't say the statements must
stay together (Fanny's own partition had 36 clusters), so that column can't be
read as a loss without the full labels. The share of statements in Other
varies between repeats (5 vs 17).

## Recommendation

1. The rebuild clearly improves the theme layer on average: +0.11 F1, cleaner
   precision, syntheses unchanged. The one failing cell is a state that was
   already good, and it falls inside the run-to-run spread.
2. Next lever, not yet measured: scale the theme ceiling with question size
   instead of a fixed 15. For example
   `max = clamp(round(atoms / 4), MIN_THEMES, 15)` gives 12 for ~50 atoms.
   That targets the cap-hit runs without the forced-merge prompt. A second
   option is to run discovery twice and keep the shorter list when both are
   within bounds.
3. Reconsider the per-run rule with single samples. With ±0.07 run-to-run
   spread, "≥ live in every run" mostly measures luck on states where live is
   already above 0.90. A paired rule, such as "mean of repeats ≥ live", would
   test the same intent.

## Cost

| | USD |
|---|---|
| baseline 8 states × 2 | 0.355 |
| revision 8 states × 2 | 0.360 |
| Bq × 2 | 0.085 |
| smoke runs | 0.031 |
| **total** | **≈ 0.83** |

Token usage is counted by wrapping the shared OpenAI client's
`chat.completions.create`. Prices: terra $2 / $12, luna $0.20 / $1.20 per
1M tokens in / out. Each 100-statement rebuild costs about $0.02.

## Files

```
node scripts/rebuild.mjs --run=../2026-08-18-live-synth-accuracy/runs/<run> --out=results/<tag>/<run>
bash scripts/run_all.sh <tag-prefix> [repeat]          # all 8 states
python3 -I scripts/score_all.py <tag> [<tag> ...]      # score100 + gate, writes results/summary-*.{json,md}
python3 -I scripts/bq_state.py ...                     # ../2026-10-24-theme-refile-pass/scripts, into the scratchpad
node scripts/rebuild.mjs --state=<scratch>/state.json --out=<scratch>/bq-runN
python3 -I scripts/bq_proxy.py <state> <flags> <scratch>/bq-run1/rebuild.json ...   # stdlib only
```

`results/<tag>/<run>/live` is a copy of the saved end state.
`.../rebuild` holds the rebuilt theme layer with the same synths.
`rebuild-log.json` has the themes, sizes, Other count, token usage and cost.
