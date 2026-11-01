# Theme re-file pass (2026-10-24)

**Question.** Ideas are filed under a theme once, when they arrive. The reJudge cron (`fn_synthesisReJudge`, every 10 min) splits oversized themes and merges duplicates, but never moves a misfiled idea and never re-offers an unthemed one. Would a periodic "re-file everything" pass fix what arrival order got wrong?

**Answer: half of it does.** Re-offering *unthemed* ideas is a consistent, never-negative gain. *Moving* already-themed ideas is noisy: it oscillates between passes, and on Bq it moves ideas the humans said fit almost as often as ideas they said don't.

## Method

`scripts/refile.mjs` calls the **compiled production `assignToTheme`** (`functions/lib`, the Sept-18 filing prompt, fast model, temperature 0). It does not use a restated prompt.

1. Freeze the theme list: titles, descriptions, and contents (up to 4 member titles shown, as in production).
2. Offer every atom (a synthesis or a standalone statement, themed or not) to the judge against that frozen snapshot. The atom is left out of its own theme's contents, so the judge isn't shown the answer. Calls are independent and decisions are applied together, so visiting order can't matter.
3. Apply the decisions and repeat until nothing moves, or for at most 3 passes.

Policies, all from the same judge answers:

| policy | different theme | NONE for a themed atom | unthemed atom |
|---|---|---|---|
| keep (multi-pass) | move | stays | filed if a theme fits |
| evict (pass 1) | move | becomes unthemed | filed if a theme fits |
| **file-only** (pass 1) | **stays** | stays | filed if a theme fits |

Scoring uses the official `score100.mjs` topic level (pairwise over statements). Pass 0 reproduces each run's recorded score exactly.

## Results: 8 benchmark end states (EN 3-small, HE 3-large)

| run | unthemed atoms at start | pass 0 (as run) | keep, pass 1 | keep, final | evict, pass 1 | **file-only** |
|---|---|---|---|---|---|---|
| en-seed42-themefix | 3 | 0.652 | 0.627 | 0.636 | 0.675 | **0.668** |
| en-seed42-consolidated | 1 | 0.775 | 0.718 | 0.781 | 0.700 | **0.775** |
| en-seed7-consolidated | 0 | 0.763 | 0.715 | 0.784 | 0.711 | **0.763** |
| en-seed1234-consolidated | 0 | 0.711 | 0.722 | 0.722 | 0.704 | **0.711** |
| en-seed42-filingfix | 1 | 0.770 | 0.795 | 0.795 | 0.797 | **0.783** |
| he-seed42-large-formulation | 5 | 0.658 | 0.747 | 0.752 | 0.808 | **0.710** |
| he-seed42-large-judgedattach | 3 | 0.910 | 0.912 | 0.886 | 0.893 | **0.929** |
| he-seed42-large-recall | 7 | 0.816 | 0.854 | 0.894 | 0.854 | **0.894** |
| **mean** | | **0.757** | 0.761 | **0.781** | 0.768 | **0.779** |

- **File-only is never worse than pass 0** (8/8 equal or better, mean +0.022). The gain grows with the number of unthemed atoms (HE recall +0.078, formulation +0.052). It costs one judge call per unthemed atom.
- **Moving reaches the same mean (+0.024) but isn't safe.** Individual passes drop as much as 0.06 (en-seed42-consolidated pass 1: 0.775 → 0.718), and the multi-pass path wobbles (judgedattach 0.910 → 0.912 → 0.960 → 0.886). Of the 36 themed moves across the 8 runs, 11 sent an atom back to a theme it had already left. That's ping-pong, not convergence.
- **Fragmentation is untouched.** themefix still has 16 themes against 10 true topics. Re-filing moves ideas between existing headings and can't merge two headings that cover the same topic. That loss belongs to the merge sweep.

## Bq-VQPMPiG7b (production v3 state, 114 real statements)

The state is rebuilt from `~/Downloads/comparison_Fany_Tal.xlsx`: 7 themes, 92 atoms (19 syntheses + 73 standalone), and 26 unthemed statements. Theme descriptions aren't in that file, so the judge saw titles and contents only. Fany and Tal flagged, per themed statement, whether it fits its v3 theme.

| human verdict on the statement | statements | moved by pass 1 | move rate |
|---|---|---|---|
| both say it fits | 69 | 14 | **20%** |
| one says it doesn't fit | 15 | 4 | 27% |
| both say it doesn't fit | 4 | 2 | 50% |

- The judge leans toward moving misfits, but weakly. It also moves 1 in 5 statements both humans accepted, and the "both misfit" group is only 4 statements.
- Moving doesn't settle: 16 atoms moved in pass 1, 15 in pass 2 and 5 in pass 3. Only 5 of those 36 moves went back to an earlier theme, so the judge keeps finding new homes rather than flipping between two.
- 23 of the 26 unthemed statements were filed in pass 1. Whether they landed correctly is unknown, because the humans rated only themed statements.

## Recommendation

1. **Ship "re-offer unthemed ideas" in the reJudge cron.** Run file-only against the current themes each sweep, for atoms that have no theme, with a "judged once per theme-list fingerprint" guard like the split and merge sweeps use. It's cheap (one call per unthemed atom), it never scored worse, and it closes the gap where unthemed ideas stay unthemed forever (26 on Bq).
2. **Don't ship moving themed ideas with the current filing judge.** It isn't decisive enough: it oscillates and moves human-approved statements at a 20% rate. A move would need a stronger rule first, for example two independent agreeing calls, or a direct "keep or move?" comparison of the two themes. That rule would need its own measurement.
3. The remaining theme loss is mostly **fragmentation** (too many headings, recall ~0.58–0.65 on the weakest EN runs), so the merge judge is the next lever, as already noted in the theme-layer-narrow-questions handoff.

## Limits

- These are end states of single streaming runs, with one judge answer per call (temperature 0, but a reasoning model is not guaranteed deterministic). No repeat runs. Gains of ~0.02 are inside the run-to-run band seen in the accuracy study.
- The benchmark question is broad, with 10 clean topics. Bq is narrow but has human labels only for fit/no-fit of themed statements, not a full partition (Fanny's 36-cluster labels are no longer on disk).
- Offline post-processing of a frozen end state. Running it live inside the cron, interleaved with arrivals and split/merge sweeps, is untested.

## Files

- `scripts/refile.mjs` runs the pass (`--run=<runDir>` or `--state=<json>`); per-run outputs go in `results/<run>/` (`pass0`, `pass1-keep`, `pass1-evict`, `pass2-keep`, …, scoreable with `score100.mjs`), plus `refile-log.json` and `judge-cache.jsonl`.
- `scripts/analyze.py` builds the file-only states (`pass1-fileonly`), the ping-pong counts and the Bq human-flag table, and writes `results/analysis.json`.
- `scripts/bq_state.py` builds the Bq v3 state from the comparison workbook. **It writes participant text to the scratchpad, never to git.**

```
node scripts/refile.mjs --run=../2026-08-18-live-synth-accuracy/runs/<run> --out=results/<run> --passes=3
python3 -I scripts/bq_state.py <scratch>/bq-v3-state.json <scratch>/bq-flags.json
node scripts/refile.mjs --state=<scratch>/bq-v3-state.json --out=<scratch>/bq-refile --passes=3
python3 -I scripts/analyze.py results --bq <scratch>/bq-refile <scratch>/bq-flags.json
node ../2026-08-18-live-synth-accuracy/score100.mjs results/<run>/<pass>
```
