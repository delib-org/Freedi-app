# Merge-judge fragmentation (2026-10-24)

**Question.** The theme layer ends runs with too many headings (themefix: 16 themes for 10 true topics, topic recall about 0.58). The reJudge cron runs `consolidateThemes` to merge headings that name the same topic. Why does it leave so many pairs unmerged, and can one change to it raise topic recall without losing precision? (Plan: `plans/theme-layer-lessons-2026-10-24.md` section 2.C.)

**Answer.** The cause is clear, the fix is not. The judge refuses nearly every pair, almost all of them involving a one-synthesis heading. Loosening it finds those pairs, but it also finds wrong ones at about 1 wrong to 2.3 right, and no verifier I tried separates them: the one that keeps precision also throws away 80% of the right merges. The best candidate moves mean topic recall by +0.009 and F1 by +0.005, which is inside run-to-run noise. **Per Tal's rule (no fix passes the gate, stop) no functions change is committed.** The candidate is saved as `scripts/candidate-fix.patch` for reference.

## Method

Offline, on the 8 benchmark end states in `../2026-10-24-theme-refile-pass/results/<run>/pass0/` (EN 3-small x4, HE 3-large x3 plus `en-seed42-themefix`), plus the Bq production state (7 themes, 114 statements; built outside git by `bq_state.py` because it holds participant text).

1. **Inventory (`inventory.mjs`, no AI).** For each visible theme, the true topic of every statement under it; a theme's dominant topic is the plurality. Two themes "share a true topic" when their dominant topics match.
2. **Pair causes (`pairCauses.mjs`).** For each such pair: did the shipped judge (`groupEquivalentThemes`, compiled from dev, fast model, temperature 0) put it in one group? 3 independent samples. Mechanical blockers are checked per state: `MIN_THEMES_TO_CONSOLIDATE`, `MAX_MERGES_PER_SWEEP`, the split-sibling guard, and whether the younger theme appeared after the run's last consolidate merge event.
3. **Replay (`replay.mjs`).** Offer the end state's visible themes to a judge variant, apply its groups the way `consolidateThemes` does (survivor = most members), offer the merged set again, up to 3 rounds. Score with the official `score100.mjs`. 2-3 samples per variant, calls cached by prompt hash in `results/cache-<variant>.jsonl`.
4. **Bq (`bq.mjs`).** Same, reporting the largest theme's share of themed statements (gate: at most 30%).
5. `mergeQuality.mjs` counts, for each variant, merged theme pairs that do / do not share a true topic. `summarize.mjs` builds the table below.

## Step 1: the per-pair cause table

27 pairs of themes share a true topic across the 8 end states (`results/pair-causes.json` lists each one).

| cause | pairs |
|---|---|
| judge proposed it in at least 1 of 3 samples | 3 (street lighting + community safety; student housing + housing development; lighting + emergency services) |
| judge refused it in all 3 samples | 24 |
| never seen: fewer than 3 themes | 0 (every end state has 10-17 themes) |
| never seen: 8-group cap | 0 (the judge returned at most 1 group per call) |
| never seen: split-sibling guard | 0 (no `splitFrom` in any benchmark state; splitting did not exist when they ran) |
| never seen: theme younger than the last sweep | 0 found (all 8 runs show consolidate merge events; the judged-once state itself is not recorded, so a pair whose set was never re-judged cannot be excluded) |

Shape of the refused pairs: **25 of the 27 involve a heading that holds a single synthesis (2 statements)**, a heading that exists only because the first idea to arrive had nowhere to go ("Public Wi-Fi access", "Neighborhood library access", "Air quality monitoring", "In-home support for seniors"). The other two are mid-sized headings of the same topic (open data vs service requests). Several of the refusals are defensible to a human reader (Wi-Fi vs open data are both "digital services" only in the benchmark's own taxonomy).

**Dominant cause: the judge declines.** Nothing mechanical blocks these merges. The prompt asks for headings that "name the same specific sub-area", shows only titles and descriptions (contents were tried and reverted in Finding 13), and says an empty answer is valid. For a one-idea heading that rule almost always says no. The shipped judge also makes wrong merges of its own: replayed on the end states it merged right/wrong pairs 5/4 over 3 samples, lowering mean precision from 0.785 to 0.768 (seed 7: "Libraries" folded into a parks-and-recreation catch-all, P 0.687 to 0.608).

## Step 2: variants measured

| variant | what changes |
|---|---|
| `baseline` | shipped `groupEquivalentThemes` (headings only, one call) |
| `fold` | each small heading is filed under a larger one by the production filing judge (`assignToTheme`, which sees contents and answers NONE when unsure) |
| `small` | the baseline call, plus each heading's idea count and a rule that a one-or-two-idea heading is a premature narrow heading to absorb into a broader one; two established headings never merge |
| `small-vote` | `small`, asked 3 times with the headings in different orders; a pair merges when 2 of 3 agree |
| `small-verify` | `small-vote`, then each absorbed heading is checked by a second call that sees both headings' ideas (fail-closed) |
| `shipped` | `small-verify` as TypeScript (`planThemeMerges`, `verifyThemeAbsorption`), compiled and replayed; saved in `scripts/candidate-fix.patch` with its tests |

Merged pairs, summed over samples (right = the two themes share a true topic):

| variant | right | wrong | right pairs found / possible |
|---|---|---|---|
| baseline (3 samples) | 5 | 4 | 0.06 |
| fold (2) | 11 | 5 | 0.20 |
| small (2) | 26 | 11 | 0.48 |
| small-vote (2) | 30 | 13 | 0.56 |
| small-verify (2) | 6 | 2 | 0.11 |
| shipped (3) | 5 | 2 | 0.06 |

Permissive prompts raise pair recall from 0.06 to about 0.5 and bring wrong merges with them. The contents-aware verifier removes the wrong ones and most of the right ones too.

## Results: topic precision / recall / F1 (mean over samples)

| run | recorded end state | baseline | small-vote | small-verify | shipped candidate |
|---|---|---|---|---|---|
| en-seed42-themefix | 0.740 / 0.582 / 0.652 | 0.744 / 0.594 / 0.661 | 0.722 / 0.693 / 0.706 | 0.757 / 0.636 / 0.691 | 0.753 / 0.624 / 0.682 |
| en-seed42-consolidated | 0.755 / 0.796 / 0.775 | 0.755 / 0.796 / 0.775 | 0.729 / 0.831 / 0.776 | 0.755 / 0.796 / 0.775 | 0.755 / 0.796 / 0.775 |
| en-seed7-consolidated | 0.687 / 0.858 / 0.763 | 0.608 / 0.893 / 0.720 | 0.668 / 0.893 / 0.764 | 0.668 / 0.893 / 0.764 | 0.674 / 0.881 / 0.764 |
| en-seed1234-consolidated | 0.792 / 0.644 / 0.711 | 0.794 / 0.662 / 0.722 | 0.734 / 0.787 / 0.760 | 0.801 / 0.680 / 0.736 | 0.795 / 0.656 / 0.719 |
| en-seed42-filingfix | 0.793 / 0.749 / 0.770 | 0.795 / 0.761 / 0.778 | 0.722 / 0.856 / 0.783 | 0.793 / 0.749 / 0.770 | 0.793 / 0.749 / 0.770 |
| he-seed42-large-formulation | 0.658 / 0.658 / 0.658 | 0.658 / 0.658 / 0.658 | 0.653 / 0.720 / 0.685 | 0.658 / 0.658 / 0.658 | 0.658 / 0.658 / 0.658 |
| he-seed42-large-judgedattach | 0.934 / 0.887 / 0.910 | same | same | same | same |
| he-seed42-large-recall | 0.917 / 0.736 / 0.816 | 0.857 / 0.736 / 0.790 | 0.904 / 0.798 / 0.848 | 0.917 / 0.736 / 0.816 | 0.917 / 0.736 / 0.816 |
| **mean** | **0.785 / 0.739 / 0.757** | 0.768 / 0.748 / 0.752 | 0.758 / 0.808 / 0.779 | 0.785 / 0.754 / 0.765 | **0.785 / 0.748 / 0.762** |

(`results/summary.json` has every variant, including `fold` and `small`.)

**Bq (7 themes, 88 themed statements, largest theme 27%).** The shipped judge proposes merging the largest theme with a 2-statement one in 3 of 3 samples (and a second pair in 2 of 3); applied, the largest theme becomes **33%, over the 30% gate**. `small`, `small-verify` and the shipped candidate leave Bq's 7 themes untouched (largest stays 27%); `small` folds one single-idea heading into "leadership". Bq has no true-topic labels, so recall and precision cannot be scored there.

## Verdict against the gate

| gate | shipped candidate | result |
|---|---|---|
| topic recall up | 0.739 to 0.748 (+0.009) | up, but inside noise |
| precision no worse | 0.785 to 0.785; seed 7 is 0.013 lower (it repeats the shipped judge's own wrong merge) | equal on the mean |
| no new catch-all on Bq (largest at most 30%) | 27%, unchanged | pass |
| split-sibling guard still blocks the Bq ping-pong | guard untouched; test written in the patch | pass |

The candidate clears the gate only on paper. Against the shipped judge's own replay it is better (precision 0.785 vs 0.768, F1 0.762 vs 0.752, and it avoids the Bq 33% merge), but it gets there by making fewer wrong merges, not by finding the missed ones (pair recall 0.06 either way). The variants that do find them (`small`, `small-vote`) cost 0.03 precision for +0.05 to +0.07 recall, which fails the gate. **No functions code is committed.**

## What would be worth trying next

- Fragmentation is mostly one-idea headings. A heading born from one synthesis could be held back instead of merged later: give it a theme only when the filing judge has nothing to say AND a second call confirms it is a new area, otherwise leave it unthemed for the "Other" bucket (plan section 2.A). That attacks the cause rather than the symptom, but it is a filing change and it is the lane that owns `runSinglePipeline.ts`.
- Judge the merge pairwise with the survivor's ideas, using a model stronger than the fast one, and measure on mid-run states. Finding 13 showed final-state replays cannot predict a live sweep, and this study has the same blind spot.
- The benchmark's 10 topics are broad domains ("digital-services" holds Wi-Fi, open data, a hotline). Part of the "missing" recall is a taxonomy a reasonable reader would not draw. A human label for the 27 pairs would say how much.

## Limits

- Final end states of single streaming runs, not mid-run sets (Finding 13: a replay on tidy final sets over-estimates what a live sweep can do, and under-estimates how many half-formed headings it faces).
- 2-3 judge samples per variant, temperature 0 on a reasoning model; differences under about 0.02 are noise.
- "Shares a true topic" uses the plurality topic of each theme, so impure themes (purity 0.5-0.7) distort a few pairs.
- The judged-once state of the live runs is not recorded, so "refused" means the judge refuses the final set today, not that it refused it live.
- AI spend: roughly 250 fast-model calls (gpt-5.6-luna) of 1-2k tokens, an estimated 1 to 2 USD. No keys are written anywhere in this folder.

## Files

- `scripts/common.mjs` loads end states, pairs, scoring; `inventory.mjs`; `pairCauses.mjs`; `replay.mjs`; `variants.mjs`; `bq.mjs`; `mergeQuality.mjs`; `summarize.mjs`; `show.mjs`.
- `scripts/candidate-fix.patch` the withdrawn code (`planThemeMerges`, `verifyThemeAbsorption`, idea counts in the proposal prompt, tests). Apply it to a clean checkout, `npm run build` in `functions/`, then `node scripts/replay.mjs --variant=shipped --lib=worktree` to reproduce the last column.
- `results/pair-causes.json`, `results/replay-<variant>.json`, `results/bq-<variant>.json`, `results/summary.json`, `results/cache-<variant>.jsonl` (judge answers, group ids and titles only), `results/log-*.txt`.

```
node scripts/inventory.mjs
node scripts/replay.mjs --variant=baseline --samples=3
node scripts/pairCauses.mjs
node scripts/replay.mjs --variant=small-vote --samples=2        # also: fold, small, small-verify
node scripts/bq.mjs --state=<bq-v3-state.json> --variant=baseline --samples=3
node scripts/mergeQuality.mjs baseline small-vote small-verify
node scripts/summarize.mjs
```
