# Results log

One row per benchmark run. Change **one** lever at a time; keep the seed fixed when
comparing, and re-check a promising result across seeds {42, 7, 1234} before
believing it, since arrival order matters.

Accuracy = `0.6·F1_synth + 0.4·F1_topic`. See `README.md` for the metric definition
and `score100.mjs` for the implementation.

| run | lang | lever | accuracy | F1 synth | F1 topic | pairs merged | synths | topics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-08-18-2010-en-seed42` | en | shipped defaults | **0.067** | 0.000 | 0.167 | 0/50 | 0 | 1 |
| `he-seed42-defaults` | he | shipped defaults | **0.066** | 0.000 | 0.165 | 0/50 | 0 | 1 |
| `en-seed42-cluster078` | en | `clusterThreshold=0.78` | **0.429** | 0.571 | 0.215 | 20/50 | 20 | 4 |
| `en-seed42-cluster078-debouncefix` | en | + defer debounced spawns to queue | **0.442** | 0.579 | 0.237 | 22/50 | 21 | 4 |
| `en-seed42-cluster078-debounce1500` | en | + `SYNTHESIS_SPAWN_DEBOUNCE_MS=1500` | **0.592** | 0.765 | 0.331 | 31/50 | 31 | 6 |
| `he-seed42-cluster078-debounce1500` | he | same fixes as the English 0.592 run | **0.066** | 0.000 | 0.166 | 0/50 | 0 | 1 |
| `he-seed42-large-cluster084` | he | + `text-embedding-3-large`, `clusterThreshold`/`synthLowerBound=0.84` | **0.369** | 0.380 | 0.352 | 27/50 | 19 | 3 |
| `en-seed42-cohesion-pairdebounce` | en | centroid topic gate + per-pair debounce, **shipped thresholds** | **0.207** | 0.077 | 0.401 | 2/50 | 2 | 14 |
| `en-seed42-passorder` | en | + synthesis outranks theming; failed spawns re-queued | 0.691† | 0.862 | 0.434 | 50/50 | 47 | 12 |
| `en-seed42-precision` | en | + member evidence required for attach; snowball brake | **0.711** | 0.926 | 0.388 | 50/50 | 48 | 13 |
| `en-seed42-llm-themes` | en | + LLM theme assignment; themes born from syntheses | **0.730** | 0.895 | 0.481 | 47/50\* | 45 | 18 |
| `en-seed42-consolidated` | en | + theme consolidation; reJudge judged on members; Pass 3b | **0.910** | **1.000** | 0.775 | **50/50** | 50 | 11 |
| `en-seed7-consolidated` | en | same build, seed 7 | **0.905** | **1.000** | 0.763 | **50/50** | 50 | 10 |
| `en-seed1234-consolidated` | en | same build, seed 1234 | **0.884** | **1.000** | 0.711 | **50/50** | 50 | 17 |
| `en-seed42-memberjudge` | en | + consolidation judged on members; judge-once; scope rule | **0.865** | 0.990 | 0.678 | 49/50 | 49 | **10** |
| `en-seed42-filingfix` | en | consolidation reverted; filing judge sees contents + unsure→NONE | **0.902** | 0.990 | 0.770 | 49/50 | 49 | 14 |
| `he-seed42-large-perq` | he | per-question pin → `text-embedding-3-large` (global still 3-small) | **0.651** | 0.880 | 0.307 | 44/50 | 43 | 9 |
| `he-seed42-large-judged` | he | + Pass 3 judged (no cosine attach); per-model bands (0.86/0.80/0.75) | **0.878** | 0.887 | 0.865 | 43/50 | 42 | 11 |
| `he-seed42-large-recall` | he | + spawn retries 3 in-band candidates; NEIGHBOR_LIMIT 15 | **0.856** | 0.882 | 0.816 | 41/50 | 41 | 12 |
| `he-seed42-large-formulation` | he | + spawn judge: formulation ≠ intervention | **0.777** | 0.857 | 0.658 | 42/50 | 41 | 11 |
| `he-seed42-large-judgedattach` | he | + Pass 1 attach requires the semantic judge's 'same' | **0.932** | **0.947** | **0.910** | 45/50 | 45 | **10** |
| `en-seed42-alljudged` | en | regression run: same all-judged build, no pin | **0.878** | 0.990 | 0.710 | 49/50 | 49 | 14 |

\* The `llm-themes` run's 47/50 is a **harness artifact, not a pipeline result** —
see Finding 8. That build's true pair recovery was 50/50.

† **`en-seed42-passorder` is NOT a clean measurement — do not cite it.** A rebuild
landed while it was feeding, and the functions emulator hot-reloaded seven times
mid-run: 19 statements were processed on the intended build and ~77 on a later
one. Its numbers are reported here only because the run exists and excluding it
silently would be worse. `en-seed42-precision` is the clean measurement of that
stage. Every other row was verified with HEAD unchanged before and after, a single
`Loaded functions definitions from source`, and `functions/lib` mtimes byte-identical
across the run.

Every run from `en-seed42-cohesion-pairdebounce` onward uses **shipped thresholds**
with no `--set` overrides, unlike the tuned runs above them.

## Where it ended up

`en-seed42-consolidated` reproduces the corpus's synthesis ground truth exactly:
**50 syntheses, every one holding precisely its two paraphrases**, P = R = F1 = ARI
= 1.000, zero false merges, 100/100 coverage. The theme layer reaches F1 0.775 with
11 headings against a true 10, and the countable cluster score moves to 0.840 after
sitting at exactly 0.500 for three consecutive rounds.

The headline arc, all at shipped thresholds: **0.067 → 0.207 → 0.711 → 0.730 →
0.910**.

Three caveats worth keeping attached to that number:

- ~~**Single seed.**~~ **Resolved — the sweep landed.** See below.
- ~~**The reJudge merge gate is unproven.**~~ **Resolved by the seed-7 run.** On
  seed 42 it reported zero refusals only because the pipeline produced no
  duplicate synths for it to consider — nothing to refuse is not the same as
  refusing nothing, and that run could not tell the two apart. Once `pumps.log`
  captured the sweep's own output (Finding 8), seed 7 showed **5 refusals across
  3 sweeps**, including *"Establish Separate Food-Scrap Collection for
  Composting"* ↔ *"Provide Weekly Curbside Recycling Pickup"* — precisely the
  false merge that cost precision in two earlier rounds — and *"Move All
  Municipal Procedures Online"* ↔ *"Open In-Person Help Desks"*. The gate works,
  and it is the reason precision holds at 1.000. Theme consolidation is visible
  in the same log: 9→7, 14→11, 11→10.
- **`attach.titleOnlyRejected` fired once in five rounds**, on a genuinely marginal
  case (title 0.852, members 0.836, gate 0.85). Correctly calibrated, but doing
  almost nothing; do not credit it with the precision recovery.

## Finding 9 — the seed sweep: the synthesis layer generalises, the theme layer varies

Arrival order decides which theme is created first and what a newcomer's
neighbourhood looks like, so a single seed can flatter a change. All three seeds,
same build (`c9ee88713`), shipped defaults, no overrides:

| seed | accuracy | synth F1 | pairs (clean) | false merges | topic F1 | cluster | themes (true 10) | coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 42 | **0.910** | 1.000 | 50/50 | 0 | 0.775 | 0.840 | 11 | 100/100 |
| 7 | **0.905** | 1.000 | 50/50 | 0 | 0.763 | 0.760 | **10** | 100/100 |
| 1234 | **0.884** | 1.000 | 50/50 | 0 | 0.711 | 0.760 | 17 | 100/100 |

**The synthesis layer is order-independent and exact.** Across three arrival
orders: 150/150 ground-truth pairs merged, every one cleanly, **zero false merges
in 450 statements**, coverage 100/100 every time. P = R = F1 = ARI = 1.000 on all
three seeds. That is not a tuned result; it is the corpus's ground truth
reproduced.

**The theme layer is order-sensitive and is where the remaining variance lives.**
Topic F1 ranges 0.711–0.775 and the heading count 10–17. The mechanism is visible
in the audit: seed 42 consolidated 9 donor themes away, seed 1234 only 4. Themes
are created in arrival order, so an unlucky order creates more of them, and
consolidation is bounded (`MAX_MERGES_PER_SWEEP = 8`) and only runs when the
reJudge sweep does. Seed 1234 finished with 17 headings for 10 topics — every
grouping correct, spread across too many names.

Headline spread 0.884–0.910, mean ≈ 0.900. Quote the range, not the best number.

## Finding 13 — the consolidation fix did NOT survive its live run, and the offline replay is why

`en-seed42-memberjudge` is the full-corpus confirmation run for Finding 10, at
shipped defaults, seed 42, same corpus, verified build (single source load, `lib`
fingerprint byte-identical before and after, HEAD `0583ce959`). It is directly
comparable to the 0.910 baseline, and it is **worse: 0.865**.

| | baseline `en-seed42-consolidated` | `en-seed42-memberjudge` |
| --- | --- | --- |
| accuracy | **0.910** | 0.865 |
| synth F1 | 1.000 | 0.990 (49/50, P still 1.000, 0 false merges) |
| **topic F1** | **0.775** | **0.678** |
| cluster (countable) | 0.840 | 0.750 |
| themes (true 10) | 11 | **10** |
| coverage | 100/100 | 99/100 |

**The theme count was hit and it did not help, because it was reached by
over-merging.** Two of the ten headings are impure:

```
16 | Street and pathway safety   | public-safety:8  parks-and-green-space:6  transport:2
18 | Municipal Service Access    | digital-services:10  culture:2  public-safety:2  health:2  jobs:2
```

The second is a catch-all — a heading general enough to absorb a piece of four
unrelated themes. Both `public-safety` and `parks-and-green-space` collapse to
0.200 as a result, which is the whole of the drop. The other eight headings are
clean.

**Why the offline replay mispredicted it.** `themeConsolidation.mjs` replayed the
judge against each run's **final** theme set — for seed 42, eleven already-tidy
headings — and measured a clean 11 → 10 with zero wrong merges. Live, the sweep
never sees that set. The pump log shows it facing **19 headings and merging 9
donors in a single pass**, on intermediate headings holding one or two
proposals each. A judge asked to tidy 11 settled headings and a judge asked to
tidy 19 half-formed ones are not doing the same task, and the offline
measurement only covered the first. **Replaying a decision on the end state does
not predict its behaviour on the states it actually encounters.** That is the
same shape as Finding 8's lesson, one level up: the harness was measuring
something adjacent to the real thing and reported a number for it.

The `MAX_MERGES_PER_SWEEP` half of Finding 10 still stands — the cap genuinely
was never the constraint, and this run reached 9 merges in a sweep against a cap
of 8, so it is now the binding constraint and is what stopped it merging further.

**Status: the consolidation change is not justified by this evidence and should
be reverted or tightened before it goes anywhere.** The judge-once fingerprint is
not implicated in the regression and is independently justified on
repeat-sampling grounds. One run, one seed — but it is the same seed as the
baseline, so it is like-for-like, and the direction is the opposite of predicted.

## Finding 14 — the scope fix holds in a live run, and the text layer is exact

The same run is the first to export proposal bodies, so it gives the text
measurement from a real pipeline rather than from driving the synthesis function
directly:

```
49 syntheses scored on title+body (bodies present 49/49)
members preserved 98/98    weakened 0    lost 0    fidelity 1.000
blunt `fabricated`: 3/49   (it was 43/50 before the scope rule)
```

**Perfect fidelity on a live run**: every one of the 98 member statements inside
the 49 syntheses is still recognisably asked for in the text that replaced it.
The three remaining `fabricated` flags are all mild siting/rationale additions
("prioritise locations where park access is lacking"), not scope widening — the
failure mode Finding 11b identified is absent. The scope rule (`8d10ffd2f`) is
confirmed in production shape, independently of the theming regression above.

## Finding 15 — Finding 13 blamed the wrong mechanism: theme impurity enters at FILING, in every run

Finding 13's *measurement* was right (the run scored 0.865) and its
*methodological* lesson stands (replaying on end-states predicts nothing). Its
**causal attribution was wrong**, and the evidence that shows it came from
rescuing the run's full audit trail out of the still-running emulator before it
was wiped (`analysis/dumpEmulatorEvidence.mjs`): the exporter had been dropping
`prevState`/`newState`, which carry each cluster's exact membership before and
after every event.

With those snapshots, `analysis/themeFiling.mjs` rebuilds the exact theme set at
any instant of the run. The reconstruction is certified before it is used: the
two consolidation sweeps see 10 and 19 visible themes (matching the pump log),
and the state at `judgedAt` reproduces the live sweep fingerprint
**byte-for-byte**.

**Neither impure heading was made by the sweep.** "Street and pathway safety"
and "Municipal Service Access" appear in none of the six merge events, as
survivor or donor — and per-member tracing shows every foreign statement walked
in through a *filing* decision:

```
02:56  "Rebuild play areas for kids with disabilities"  [parks]   → Street and pathway safety   (assignToTheme)
03:09  "Create Nearby Pocket Parks for Every Home"      [parks]   → Street and pathway safety   (nest judge)
02:47  "Public Library Branch in Every District"        [culture] → Municipal Service Access    (nest judge)
03:18  "Expand In-Home Care for Older People"           [health]  → Municipal Service Access    (nest judge)
03:20  "Streamline Business Licensing"                  [jobs]    → Municipal Service Access    (nest judge)
03:03  "Create pocket parks …"                          [parks]   → Street and pathway safety   (cosine attach)
```

The six sweep merges themselves were **clean** — Environment, Jobs, Housing,
Schools, Healthcare, Waste all merged same-topic donors. Scored over the whole
run: **58 judged filing decisions, 12 misfiles, 10 over-NONEs — 62% accuracy.**
Every misfile lands in one of two attractor headings whose broad, service-flavoured
titles ("…Access", "…safety") invite everything near them.

**And the baselines have the same disease.** Re-profiling all three certified
runs: every one carries 3–4 mixed headings with the identical signature —
foreign members in whole-synth pairs under an attractive title
(seed 42: "Nighttime safety and mobility" transport:10+safety:6; seed 7:
"Recreation and Community Life" parks:10+culture:8+housing:2; seed 1234:
"Street lighting and safety" safety:8+parks:4). **Filing is the accuracy ceiling
of the theme layer in every run**, and a ~0.05 swing between two single runs is
within its dice. The memberjudge run was not made worse by the consolidation
prompt; it drew unluckier filing dice — which means the 0.910 vs 0.865
comparison was **confounded**, and the revert, while safe, was decided on the
wrong evidence.

Two structural facts about the filing judge (`assignToTheme`) explain the bias
of the errors:

1. **It sees titles and descriptions, never contents.** A heading's title is a
   compression of whatever proposal arrived first; the judge cannot see that
   "Municipal Service Access" actually holds hotline/portal/wifi proposals when
   it files a library branch under it.
2. **Its doubt-bias is inverted for today's pipeline.** The prompt says *"Prefer
   an existing topic when one plausibly fits; a proliferation of near-duplicate
   topics is worse than a slightly broad one."* That was written before the
   consolidation sweep existed. Now a too-eager NONE self-heals — the sweep
   merges duplicate headings — while a misfile is permanent. The cheap error has
   switched sides, and the prompt still pays for the expensive one.

`themeFiling.mjs` A/Bs the 2×2 (evidence × doubt-bias) over the same 58
decisions against their exact reconstructed contexts, 3 repeats each
(`gpt-5.6-luna`, the live model). F0 is the compiled shipped function — and it
reproduces the live misfiles nearly deterministically (most at 3-of-3 repeats,
all into the same two attractors), so the failure is a stable model behaviour,
not sampling noise:

| variant | accuracy | misfiles | over-NONEs |
| --- | --- | --- | --- |
| F0 titles, prefer-file (ships, compiled) | 66.1% | 28 | 31 |
| F1 contents, prefer-file | 64.4% | **37** | 25 |
| F2 contents, unsure→NONE | 62.6% | **17** | 48 |
| F3 titles, unsure→NONE | 39.7% | 15 | **90** |
| F4 contents, conflict→NONE | 70.1% | 30 | 22 |
| F5 contents, NONE + narrowness-exception | 71.8% | 23 | 26 |

**The factors only work together.** Contents under the shipped "prefer an
existing topic" bias made misfiling WORSE (28 → 37) — the same shape as Finding
13 one layer up: evidence plus eagerness yields confident mistakes. Caution
without contents (F3) has nothing to aim with and refuses half of everything.
Together (F2) the permanent error drops 40%, and the survivors sit near the
corpus's own ambiguity line ("Streamline Business Licensing" *is* a municipal
procedure).

**Decision rule, registered before F5's numbers landed:** minimise
3·misfiles + over-NONEs (a misfile pollutes a heading permanently; an
over-NONE spawns a duplicate theme with a measured repair channel — the sweep's
merges ran 6/6 clean), with a hard cap misfiles ≤ 19 because that 3:1 weight is
an estimate and the cap keeps an uncertain weight from trading away the
irreversible error. F4 and F5 raised accuracy by re-licensing misfiles (30 and
23) and fail the cap; F2 ships. F4/F5 are kept in the bench as evidence that
per-decision *accuracy* is the wrong objective for this call.

**Ported and re-verified through the compiled artifact** (`assignToTheme` +
both `nestSynthesis.ts` call sites, contents built from the same snapshot at
zero extra reads): 18 misfiles / 46 over-NONEs / 63.2% vs the benched 17 / 48 /
62.6% — a statistical match, so the port measures as the thing that won. An
instructive harness bug on the way: the first verification pass fed the new
prompt with `contents` accidentally stripped and scored 20 / **71** — an
unplanned ablation confirming that the caution bias without the evidence
collapses into refusal, through the real compiled path.

**Limit, stated plainly: this bench scores per-decision accuracy on the
historical states of ONE run.** A changed filing policy changes which themes
exist downstream of each decision, and Finding 13 is this study's standing
warning about exactly that gap. The fix is measured, ported, and verified — and
it is not *believed* until a live full-corpus run confirms it. Also still open:
the ~8 cosine topic-attaches per run bypass this judge entirely (1 of 8
misfiled live).

## Finding 18 — Hebrew reaches 0.932, and the law that got it there: geometry proposes, judgement disposes — with no exceptions

The Hebrew arc, five certified runs, one seed, each changing one lever:

| run | lever | accuracy | synth P / false merges | topic F1 |
| --- | --- | --- | --- | --- |
| `large-perq` | pin only (Finding 17) | 0.651 | 0.880 / 6 | 0.307 |
| `large-judged` | Pass 3 judged + per-model bands | 0.878 | 0.915 / 4 | 0.865 |
| `large-recall` | spawn retry ×3 + window 15 | 0.856 | 0.953 / 2 | 0.816 |
| `large-formulation` | spawn judge: formulation ≠ intervention | 0.777 | 0.875 / 6 | 0.658 |
| **`large-judgedattach`** | **Pass 1 attach requires 'same'** | **0.932** | **1.000 / 0** | **0.910** |

**0.932 is the highest score of any run in this study, either language**
(English best: 0.910). Synth precision 1.000 with zero false merges, 45/50
pairs, ten themes for a true ten, six perfectly pure, coverage 97/100.

**The mechanism, named plainly.** Every leap in that table — and both dips —
traces to the same law. In 3-small English space, geometry was nearly
sufficient: twins sat in a band of their own, and the judge-free shortcuts
(cosine topic attach, cosine synth attach) were safe because nothing wrong
could clear their gates. Hebrew 3-large compresses the space (twins 0.73–0.97,
cross-topic up to 0.85): distinct ideas clear EVERY geometric gate — night-bus
statements attached to a peak-frequency synth at cosine 0.899–0.944. Each fix
was the same fix: find the next place geometry acted alone, put the judge in
front of it. Theme filing (Finding 15), topic attach (`large-judged`), and
finally synth attach (`large-judgedattach`) — the last judge-free placement in
the pipeline. The dips are instructive too: `large-recall` and
`large-formulation` were correct per-mechanism changes (offline A/B: EN 50/50
unchanged, HE wrong refusals 5→1) whose composite effect was swamped by the
then-unjudged attach path and theme-filing luck — single-run composites cannot
resolve a two-pair improvement under ±0.05 filing variance, which is Finding
13's lesson holding at run granularity.

**What each kept fix contributes** (all cumulative in the final run):
per-question pin + guard (Finding 17 machinery); per-model bands measured in
`heBands.mjs`; judged filing everywhere; spawn retry over 3 in-band candidates
(a refusal judges one pair, not the option); window 15 for crowded compressed
spaces; the formulation≠intervention clause (HE twins 45→49/50 offline, EN
untouched); and the semantic-judge gate on attach — verdict-cached, fail-closed,
because an unmerged duplicate self-heals via the reJudge sweep while a wrong
attach is permanent.

**Honesty about variance:** HE runs 2–4 spanned 0.777–0.878 largely on theme
filing luck, and 0.932 as a composite carries one run's filing fortune; quote
"≈0.9, spread comparable to English's" until a seed sweep says otherwise. One
attribution correction found in the post-run audit: **Pass 1 produced ZERO
attaches in run 5** — the attach judge was never exercised live in this run
(unit-tested only). The zero false merges are attributable to the ensemble:
judged spawns formed the correct synths early, so no wrong attach was ever
proposed; the attach gate stands as insurance for the runs where one is. The
three statements that hit the 45s settle cap each run remain a known harness
limitation.

**Cost note:** the judged attach adds one verdict-cached fast-model call per
attach candidate that passes the geometric gates — a handful per hundred
statements — and the English regression run below is the check that judging
what geometry used to decide does not tax the language where geometry was
sufficient.

## Finding 19 — the English regression run: synth layer identical, topic layer rolls its usual dice

`en-seed42-alljudged` runs the full all-judged build (judged Pass 3, spawn
retry ×3, window 15, formulation clause, judged Pass 1) on English at the
global 3-small model — the check that judging what geometry used to decide does
not tax the language where geometry was sufficient. Build certified.

**The synth layer is byte-for-byte the certified best:** F1 0.990, 49/50 pairs
clean, precision 1.000, zero false merges, coverage 100/100 — identical to
`en-seed42-filingfix`. The attach judge refused nothing (zero `judgeRefused`
events), the retry and window changes added no false merges, and the
formulation clause changed no English verdict (as the offline A/B predicted:
50/50 → 50/50).

**The composite reads 0.878** — below the 0.884–0.910 band — and the entire
delta is topic F1 drawing 0.710 from its known filing-variance envelope
(0.678–0.775 across certified runs; seed 1234 drew 0.711 on the untouched
build). Fourteen headings for a true ten, no new failure signature, no
polluted mega-theme. The honest statement: the all-judged build leaves English
where it was — an exact synthesis layer over a theme layer whose run-to-run
spread is now the dominant residual, in both languages.

## Finding 16 — the filing fix survives its live run: permanent misfiles halve, composite back in band

`en-seed42-filingfix` is the full-corpus confirmation for Finding 15: shipped
defaults, seed 42, HEAD `d576f27f4`, build certified (lib fingerprint
`f4e8894f…` byte-identical before and after, newest `lib` mtime predates the
run start, so no mid-run reload). Three statements hit the 45s settle cap —
noted, same shape as prior certified runs.

| | baseline | `memberjudge` | **`filingfix`** |
| --- | --- | --- | --- |
| accuracy | 0.910 | 0.865 | **0.902** |
| synth F1 | 1.000 | 0.990 | 0.990 (49/50, P=1.000, 0 false merges) |
| topic F1 | 0.775 | 0.678 | **0.770** |
| themes (true 10) | 11 | 10 | 14 |
| mixed headings / foreign statements | 3 / 12 | 2 / 20 | 3 / 10 |

**The primary metric — the one the fix targeted — moved live.** Scored by the
same certified reconstruction (fingerprint EXACT MATCH, at the second of two
back-to-back sweeps' listing instants):

```
                      memberjudge     filingfix
judged decisions           58             54
misfiles (permanent)       12              5      rate 20.7% → 9.3%
over-NONEs (reversible)    10             17
```

Per-decision *accuracy* is flat (62.1% → 59.3%) — by design. The fix does not
make the judge smarter; it moves its errors from the permanent kind to the
reversible kind. The reversible kind then actually got repaired: the sweep
merged 13 donor headings, 12 same-topic, 1 adjacent miss (community gardens
[parks] into "Urban Food Sustainability" [environment]) — and the judge-once
fingerprint was exercised live, matching the reconstruction exactly.

The composite lands at 0.902, inside the certified band (0.884–0.910) — which
is the honest claim: **on a single run the composite cannot resolve the fix's
effect; what is resolved is the error composition** (misfiles halved, end-state
foreign statements 10 vs baseline's 12, spread over 14 slightly-duplicated
headings instead of 11).

**What the residue teaches.** All 5 judged misfiles (plus 2 of 8 cosine
attaches) went to two headings: "Community and Cultural Amenities" took five
parks proposals — contents shown and contents genuinely adjacent (festivals and
community events DO neighbour playgrounds and pocket parks) — and "Municipal
service request access" took business licensing, the corpus's own ambiguity
(licensing IS a municipal procedure). The attractor mechanism is weakened, not
gone, and it survives where the adjacency is real rather than a title
illusion. The cosine topic-attach path, which bypasses the judge entirely, now
contributes ~29% of misfiles and is the next cheapest target.

## Finding 17 — the per-question model machinery works live; Hebrew's remaining gap is band calibration, and the cosine attach path is its amplifier

`he-seed42-large-perq` is the first Hebrew run on the modern pipeline, and the
validation run for the per-question embedding-model machinery (`5a8d37692`):
the question pinned to `text-embedding-3-large` via
`--set embeddingModel=...` while the global default stayed `3-small` — exactly
production shape for the decided rollout. Build certified (fingerprint
`95217308…` identical before/after, no mid-run rebuild).

**The machinery is proven.** Verified mid-run from the emulator: vectors under
the pinned question stamped `text-embedding-3-large` with the global env
untouched; pin applied by the harness through the ordinary settings block;
resolution, generation, guard and vector search all agreed. No re-embed loop,
no cross-model comparisons.

**The score: 0.651** — the best Hebrew number ever measured (0.066 at
defaults; 0.369 with 3-large + hand-tuned bands on the OLD pipeline), but far
under the English band (0.884–0.910). The decomposition says precisely where
the gap lives:

| layer | English (filingfix) | Hebrew (this run) |
| --- | --- | --- |
| synth F1 | 0.990, 0 false merges | 0.880, **6 false merges** |
| topic F1 | 0.770 | **0.307** |
| coverage | 99/100 | 97/100 |

The topic collapse has one dominant cause: **a 45-member mega-theme**
("בריאות נפשית קהילתית" — community mental health) holding statements from all
eight other topics. Its audit trail shows how it grew: **25 judge-free cosine
topic-attaches** plus 20 nest attaches once it had mass. The mechanism is the
original Finding 1 black hole reborn through band mis-calibration: the topic
band (0.60–0.78) was tuned for 3-small geometry, but Hebrew 3-large cross-topic
cosines run right through it (cross-pair median 0.702 per `heSynth.mjs`), so
the cosine gate admits cross-topic statements wholesale and the first
centrally-placed theme accretes everything the judge never sees. The 6 false
synth merges (4 within-topic near-misses like bus-frequency ↔ night-service)
are the same story one band up — attach at 0.85 means something different in
3-large Hebrew space.

Two remediation leads, in order of likely value:

1. **Route cosine topic-attaches through the filing judge** — the same
   confirm-before-attach the nest path got in Finding 15. This one change
   addresses BOTH Finding 16's English residue (~29% of misfiles) and the
   mega-theme here: 25 of its 45 members entered through the unjudged path.
2. **Re-calibrate the bands per embedding model** — the constants are
   geometry-specific and now the geometry is per-question. The bands likely
   want to live beside the pin (a per-model band set), measured the way the
   3-small bands were (`synthAttachGate.mjs` / `centroidGate.mjs` re-run on
   3-large Hebrew embeddings).

Nothing about this run indicts the migration machinery — the pin did exactly
what it was built to do. What it exposed is that "switch the model" was never
the whole Hebrew story: the thresholds around the model are calibrated to a
geometry, and moving one without the other re-opens an old failure mode.

## Finding 10 — consolidation under-merged because the judge could not see, and the cap was never the constraint

Finding 9 left theme-count variance as the one clear remaining defect, and the
plan named the cause: `MAX_MERGES_PER_SWEEP = 8` in `consolidateThemes.ts`,
with "raise the cap and run one consolidation pass at the end" as the cheap fix.
The pump logs refute that without needing an experiment:

```
seed 7    :  9 -> 7 (2 groups)   14 -> 11 (3 groups)   11 -> 10 (1 group)
seed 1234 :  8 -> 6 (2 groups)   19 -> 17 (2 groups)
```

The judge was never offered the chance to propose 8. Seed 1234's final sweep saw
**19 headings and returned 2 groups**; the cap could not have bound, and raising
it would have changed nothing. This is the fourth time in this study that a
plausible diagnosis survived until someone read the artifacts.

What actually limits the merge count is **what the judge is shown**. A heading is
a compression of whichever proposal arrived first, so seed 1234 finished holding
"Household recycling services", "Air quality monitoring", "Clean and efficient
energy" and "Community gardens and urban agriculture" as four separate topics.
As strings those share nothing; as *contents* they are plainly one area.

`analysis/themeConsolidation.mjs` replays the real judge against the final theme
sets of all three certified runs, scoring a proposed group as wrong when it spans
two ground-truth topics. Averaged over two samples:

| seed | mechanism | headings | correct merges | wrong | topics still represented |
| --- | --- | --- | --- | --- | --- |
| 42 | titles (shipped) | 11 → 10.5 | 0.0 | 0.5 | 9.5/10 |
| 42 | **members** | 11 → **10.0** | 1.0 | **0.0** | **10/10** |
| 7 | titles (shipped) | 10 → 9.0 | 0.0 | 1.0 | 9/10 |
| 7 | **members** | 10 → 9.0 | 0.0 | 1.0 | 9/10 |
| 1234 | titles (shipped) | 17 → 12.5 | 3.5 | 0.5 | 9.5/10 |
| 1234 | **members** | 17 → **10.5** | **6.0** | 0.5 | **10/10** |

Judging on members dominates on every seed and buys the recall without paying in
precision. It is the same lesson the cross-synth merge gate learned one layer
down — a generated title abstracts away exactly the detail the decision turns on.

**A second defect the same measurement exposed, which nobody was looking for.**
This sweep runs on a 10-minute schedule and asks a non-deterministic model to
*find* groups, so a settled question puts the same question to it ~144 times a
day, and a merge hides the donor heading irreversibly. Looping the judge on a
static set is therefore what production actually does, and looping measurably
degrades it: on seed 7 — whose ten headings were already exactly right — one
sample in two proposed merging parks with culture, and the looped variants
converge to 9. A spurious merge that any single call proposes rarely becomes a
near-certainty across enough calls. Each distinct theme set is now judged once,
keyed on a fingerprint of which headings exist and how much each holds.
Convergence is unaffected — a merge changes the set — and it removes an LLM call
per parent per sweep on questions where nothing has happened.

Both changes are in `a4674a4f5`. **The live benchmark has now run, and it
contradicts the prompt half of this finding — see Finding 13.** The numbers below
are an offline replay of the judge on each run's FINAL theme set, which turned
out not to predict its behaviour on the intermediate sets the live sweep
actually meets. Read this finding as the diagnosis it got right (the cap was
never the constraint) plus a fix that did not survive measurement.
A 20-statement smoke run (`runs/smoke-consolidation`) confirmed no regression in
the synth layer and that the exporter now writes proposal bodies, but did not
exercise consolidation at all — 20 statements produced 2 themes, below
`MIN_THEMES_TO_CONSOLIDATE`. The full-corpus run that did exercise it is
Finding 13, and it went the other way.

## Finding 12 — the review queue never emptied, and never held anything real

The last worry attached to `review-queued` — "~34 per run and nothing drains it"
— resolves in two opposite directions, both from the certified runs' artifacts.

**It is not a recall problem.** Reconstructing every queued option's fate: 34, 34
and 37 options were queued across the three seeds, and **all 105 were
subsequently placed by the pipeline itself**. Zero were still unplaced at export.
Queueing an option whose twin has not yet arrived is correct at that moment, and
the twin's arrival resolves it. There is nothing here to rescue.

**It is a queue problem, and worse than "nothing drains it" implied.** Because
every queued option gets placed and the row is never touched again, the queue an
admin opens has a **100% false-positive rate** — ~35 items per 100 statements,
none of which need a human. That is a queue people stop reading, and the day it
holds something real it will be ignored along with the rest. A placement now
closes the rows that mention the option (`c018fd495`), resolved rather than
deleted, since how often the gray band resolves itself is exactly the measurement
that would say whether the band is set right.

## Finding 11 — the merged text loses specificity, but loses nobody

Every number above this line grades **membership** — which statements ended up
together. That is half of being right. A synthesis also *replaces* what two
people wrote, in the list participants read and vote on, with wording an LLM
produced. Nothing had ever read that wording. A merge can hold exactly the right
two statements and publish a proposal carrying only one of them, and every metric
in this file would still read 1.000.

`textFidelity.mjs` judges each member statement against the text its synthesis
published: **preserved** (a reader would know this was asked for), **weakened**
(the concrete ask generalised away), **lost** (a reader would have no idea), plus
whether the merge invented a commitment nobody made.

The instrument is validated first, and that is not a formality — a judge that
answers "preserved" to everything scores a perfect run on a pipeline that
destroyed half its input, and produces a number rather than an error, which is
exactly the shape of both bugs in Finding 8. `textFidelity.selftest.mjs` puts it
against five hand-written merges with known answers (faithful; one member
dropped; both asks generalised into a heading; an invented funding mechanism;
title-only). All five correct.

| run | fidelity | preserved | weakened | lost | fabricated |
| --- | --- | --- | --- | --- | --- |
| seed 42 | 0.840 | 84 | 16 | **0** | 0 |
| seed 7 | 0.870 | 87 | 13 | **0** | 1 |
| seed 1234 | 0.920 | 92 | 8 | **0** | 1 |

**Nothing was lost. Zero members dropped across 300 member statements in three
runs** — no participant's ask vanished from the text that replaced it. That is
the failure this measurement existed to look for, and it is not happening.

What the text does lose is **specificity**: 8–16 asks per 100 arrive generalised.
"students under eighteen" becomes "school-age"; "cut ambulance and fire response
times by opening more local stations" becomes "open more neighborhood emergency
response stations". And 2 syntheses in 150 **inflated scope**, inventing
"citywide" and "residents" where the originals said neither — the same
over-abstraction that cost precision in Finding 5, showing up in the text layer
rather than in the grouping.

**Read this as a bound, not a verdict.** These runs predate the exporter carrying
`description`, so this scores the **title alone** — a summary by construction and
the harshest possible test. Most weakenings are details a body would plausibly
carry.

### Finding 11b — with the body, it does carry them; the real defect is scope

The bound above was resolved rather than left standing. `analysis/synthTextAB.mjs`
drives the **real compiled** `generateSynthesizedProposal` over the same 50
ground-truth pairs the pipeline merged — the pipeline recovered all 50 exactly on
every seed, so these are the same inputs — and judges the full published text.
Importing the compiled function rather than restating its prompt is deliberate:
Finding 8 is what happens when a harness re-implements the code under test.

The body recovers essentially everything the title generalised away: **fidelity
0.990, one weakened member in 100, zero lost.** The specificity worry raised by
the title-only pass is largely answered.

What the body introduced instead is invention, and the blunt `fabricated` signal
was useless for seeing it — it fired on 43 of 50, because the prompt explicitly
orders an implementation plan from one-sentence inputs. A signal that is almost
always on cannot rank anything. Splitting it in two (`scopeInflated` vs
`addedCommitments`, both self-tested) separated the harmless from the harmful:

| | baseline | after the fix |
| --- | --- | --- |
| fidelity | 0.990 | **1.000** |
| members weakened / lost | 1 / 0 | **0 / 0** |
| **scope inflated** | **4/50** | **0/50** |
| added commitments | 50/50 | 25/50 |
| `fabricated` (blunt) | 43/50 | 5/50 |
| refusals | 0 | 0 |

The four were consistent in shape — "freelancers" published as "residents",
"shops and restaurants" as "and other establishments citywide" — and the cause
was a contradiction inside the synthesis prompt: it forbade inventing "facts or
numbers" while ordering it to state "who does what, on what timeline, with what
success measure". Where the inputs were silent the only way to obey was to
invent, and invention defaults to the general case. Making that instruction
conditional on the inputs, and giving scope its own prohibition, removed it
entirely without the synthesis judge starting to refuse pairs it should accept
(`8d10ffd2f`).

One corpus, one sample per pair. The effects are far larger than noise, but the
caveat at the foot of `analysis/README.md` applies here too.

## Finding 1 — the topic-cluster band is a black hole (shipped defaults, English)

The very first run produced **zero syntheses** and **one topic cluster holding all
100 statements**. The audit log tells the whole story: `{"spawn": 1, "attach": 98}`.

What happens:

1. The first two statements land in the `[clusterThreshold 0.60, synthLowerBound
   0.78)` band and spawn a **topic cluster**.
2. Every later statement finds that cluster at ≥ 0.60 and Pass 2 attaches it. The
   pre-flight already measured why this is near-certain: **80% of English
   cross-topic pairs and 100% of Hebrew ones sit above 0.60**, because every
   statement is embedded under the same `"Question: …\nAnswer: …"` prefix, which
   lifts the entire cosine floor (English cross-topic min 0.505, Hebrew 0.639).
3. Once a statement belongs to a cluster, the `findClustersContainingMember` guard
   at the top of `runSinglePipeline` skips it. So when its true paraphrase partner
   arrives, **the pair can never form a synthesis** — the partner just attaches to
   the same growing blob.

The consequence is worse than "topics are too coarse": a single early topic cluster
starves the synthesis layer for the rest of the run. Coverage looks perfect (100/100
clustered) while precision is 0.091 and no actual merging of duplicate ideas
happened at all — the one number that would have looked healthy on a dashboard is
the one that hides the failure.

This is not a corpus artifact. The corpus separability is 100/100 (every
statement's true paraphrase is its nearest neighbour) and the best single cosine
cut reaches F1 0.990, so the information needed to build the 50 correct pairs was
fully present in the embeddings the pipeline had.

**Note on the `clusterThreshold` docstring.** `functions/src/synthesis/pipeline/types.ts`
justifies lowering the gate from 0.65 to 0.60 with the estimate that cross-topic
pairs land at 0.30–0.65. Measured on a real single-question civic corpus they land
at 0.505–0.786 (English) and 0.639–0.912 (Hebrew). The gate was tuned against a
cosine range that the production embedding contract does not actually produce.

## Finding 2 — Hebrew fails identically at defaults, which hides the language effect

The Hebrew baseline scores 0.066 against English's 0.067: same single mega-cluster,
same zero syntheses. At shipped defaults the black hole dominates so completely that
it **masks** the large embedding-quality gap the pre-flight measured (separability
100/100 English vs 56/100 Hebrew). The EN/HE comparison only becomes meaningful once
synthesis actually happens, so fix the structural problem first and treat the
language question as a second, separate measurement.

## Finding 3 — raising `clusterThreshold` restores synthesis, at perfect precision

Setting `clusterThreshold = 0.78` (collapsing the topic-spawn band into the synth
band) lifts English from 0.067 to **0.429**. Every one of the 20 produced syntheses
holds exactly 2 members, precision is **1.000**, and there are zero false merges —
the pairs it does find are perfectly clean. Recall is the whole problem: 20/50.

## Finding 4 — the spawn debounce throttles a busy question to ~1 spawn per window

The recall ceiling is not the thresholds. The audit accounting is exact:

```
45 spawn attempts  =  24 spawned  +  21 debounced
```

and 45 is precisely the number of pairs the pre-flight put above 0.85. So the
pipeline *found* almost every pair and then threw half of them away.

`SPAWN_DEBOUNCE_MS` is 15s and the lock is **per parent, not per cluster**, so a
spawn of one pair blocks the spawn of a completely unrelated pair. Its stated
purpose — stopping a burst of near-identical options from each spawning their own
2-member cluster — only needs to cover the moment between a spawn committing and
the new cluster becoming visible to vector search; after that Pass 1/2 attach
handles duplicates on its own.

Worse, a debounced spawn was **silently dropped**. `runSinglePipeline` runs once per
option create and nothing re-triggered a debounced option, so the comment's premise
that such options "fall through to the attach path on the next tick" did not hold.
Fixed in `deferSpawnAfterDebounce` by enqueuing the option for the queue worker.

That fix is mechanically correct — the queue visibly receives ~20 deferred items —
but only bought +2 pairs (0.429 → 0.442), because `drainSynthesisQueue` processes a
batch in a tight loop: the first retry spawns, re-arms the 15s window, and
re-blocks the rest of its own batch. The window length itself is the binding
constraint, so `SPAWN_DEBOUNCE_MS` is now overridable via
`SYNTHESIS_SPAWN_DEBOUNCE_MS` to make it measurable rather than a guess.

## Finding 5 — shortening the debounce window confirms it was the recall ceiling

With `SYNTHESIS_SPAWN_DEBOUNCE_MS=1500`, English reaches **0.592**: pair recovery
31/50, precision still **1.000**, coverage 97/100. Spawns rose from 24 to 37 and
debounces fell to zero. Cumulatively the two structural changes take English from
**0.067 to 0.592**, roughly a 9× improvement.

> **Correction (2026-08-19).** An audit of the run artifacts contradicts the
> original claim here that no false merge appeared at any point. The intermediate
> run `en-seed42-cluster078-debouncefix` records **P=0.846 with 4 falsely merged
> pairs**, in its own `scores.md`: one 4-member synth,
> "Establish Separate Food-Scrap Collection for Citywide Composting", mixes
> `compost-organic-waste` with `recycling-pickup`. The raw cross-group cosines are
> 0.808–0.836 — all *below* `attachThreshold` 0.85 — so the attach was carried by
> the synth's own title embedding rather than by member evidence. Precision is
> 1.000 in the best run, but it has not been 1.000 at every stage, and the
> mechanism that broke it (a synth title abstracting far enough to pull in a
> neighbouring idea) is a live risk rather than a one-off.

1.5s is a deliberately aggressive probe chosen to size the headroom, not a
production recommendation. The right window is the time for a committed spawn to
become visible to vector search; the principled fix is to scope the lock to the
cluster being spawned rather than to the whole parent, which would remove the
throughput ceiling without shortening the protection at all.

## What still limits the score

- **Recall, 19 pairs short.**

  > **Correction (2026-08-19).** This was originally read as "37 statements are
  > stranded in `review-queued` and never revisited". That mistakes an event count
  > for a terminal state. Reconstructing roles from the memberships and arrival
  > order (37 spawners + 37 spawn-siblings + 23 attachers + 3 unclustered, which
  > reconciles exactly with the audit counts), **35–36 of those 37 were rescued**
  > when their partner arrived and spawned with them. At most 1–2 ended terminally
  > review-queued.
  >
  > The 19 missed pairs break down as: **17 — the twin was already inside a topic
  > cluster** and therefore foreclosed (D1 residue; twin at rank 1, cosine
  > 0.82–0.93 in all 17); **1 — a silent spawn failure** at cosine 0.898 that was
  > never retried; **1 — a topic attach at 0.777 evidence preempted a synth spawn
  > at 0.895** (pass precedence). **Zero** were below the gate, and **zero** fell
  > outside the 10-neighbour window.
  >
  > So revisiting review-queued options — item 4 in the recommendations below —
  > would have recovered roughly none of them. The sink was cluster membership,
  > silent work-dropping, and pass ordering.
- **Topic level, F1 0.331.** The live pipeline never nests syntheses under topic
  clusters — `spawnClusterFromPair` only ever attaches plain options — so the
  10-topic layer of the ground truth cannot be fully reconstructed by design. The
  scorer's `synths-only` self-test fixture shows the ceiling this imposes: a run
  with 50/50 perfect syntheses and no topic nesting still scores only 0.680. Closing
  that gap needs a new nesting pass, which is a design decision rather than a tuning
  one.
- **Hebrew is capped by the embedding model**, not by any of the above — see
  README.md. `text-embedding-3-large` is the lever there.

## Finding 6 — the English fixes do not transfer to Hebrew; the embedding model does

Running Hebrew with exactly the settings that took English to 0.592 leaves it at
**0.066** — still one mega-cluster, still zero syntheses. The reason is in the
pre-flight table: Hebrew's cross-topic *median* under `text-embedding-3-small` is
0.779, so a 0.78 gate still admits nearly every unrelated pair and the black hole
survives. **Cosine thresholds are language-specific and an English-tuned value
cannot be assumed to transfer.**

Switching to `text-embedding-3-large` (requested at 1536 dimensions so the existing
Firestore vector indexes stay valid) moves Hebrew to **0.369** — 27/50 pairs, up
from 0. That is a 5.6× gain from one configuration change, and it is the only lever
that moved Hebrew at all.

Precision fell to 0.293 (65 false merges) at the `0.84` band I used, which is a
tuning artifact rather than a model problem: Hebrew's within-pair p10 (0.814) and
cross-topic max (0.850) still overlap under 3-large, so a single 0.84 cut both
merges true pairs and admits some false ones. The pre-flight puts the best possible
single cut at F1 0.774, so a better-chosen band should recover most of the lost
precision. That tuning pass is the obvious next experiment.

## Recommended changes, in order of measured value

1. **Stop the topic-cluster black hole.** Highest impact by far (English
   0.067 → 0.429). Raising `clusterThreshold` is the blunt version; the better fix
   is to stop letting a topic cluster absorb an option whose best evidence comes
   from a single member, since that is what lets one cluster grow without bound.
2. **Rescope the spawn debounce** from per-parent to per-cluster (English
   0.442 → 0.592). The 15s per-parent lock throttles a whole question to roughly one
   spawn per window, which bites hardest exactly when a question is busiest.
   Already landed: debounced spawns are no longer dropped, and the window is
   overridable via `SYNTHESIS_SPAWN_DEBOUNCE_MS`.
3. **Move Hebrew (and any non-English question) to `text-embedding-3-large`**
   at 1536 dimensions (Hebrew 0.066 → 0.369). Embeddings are a rounding error next
   to the synthesis LLM calls, and English improves too (pre-flight F1 0.947 → 0.990).
4. ~~**Revisit `review-queued` options when a later statement lands near them.**~~
   **Withdrawn 2026-08-19** — see the correction above. Review-queued was not a
   terminal sink; it accounted for at most 1–2 statements and ~0 of the 19 missed
   pairs. The change that belongs in this slot instead is **never dropping a
   failed spawn**: `spawnClusterFromPair` returning `spawned: false` ended the
   pipeline with no audit row and no retry, which cost one pair at cosine 0.898.
5. **Add a synth → topic nesting pass.** Without it the composite cannot exceed
   ~0.68 even with every synthesis perfect. This is a design change, not a tuning one.

## Finding 6 — passes must run most-specific-first, or the general claim wins on the specific claim's evidence

Cohesion-gating the topic attach (Finding 1's fix) worked exactly as intended and
took the score to **0.207** — worse than the tuned run it replaced. The cluster half
improved as designed; the synth half collapsed to 2 of 50 pairs, with the synthesis
LLM consulted 4 times in a 100-statement run.

The cause was pass ordering, and it was not introduced by the gate — the gate merely
exposed it by making themes form early and cleanly. Topic attach ran before synth
spawn, and **a theme that already holds your twin will always look cohesive to you,
because your twin is inside its centroid.** Measured on the earlier runs: in 17 of 23
topic attaches, the member whose cosine justified the attach *was the statement's own
twin*. The pipeline used the twin to file the statement away from it.

Saying two statements are the same idea is a stronger claim than saying they share a
theme, so the specific claim now gets first refusal:

```
1 synth attach → 2 SYNTH SPAWN → 3 topic attach → 4 registry → 5 topic spawn → 6 review
```

A `cannotSynthesize` refusal is no longer terminal at the spawn site — "these are
distinct ideas" is precisely the case *for* theming them. Result: **0.711**, pair
recovery 50/50, at shipped thresholds for the first time.

## Finding 7 — theme membership is not in the geometry, at any threshold or model

With the synth layer solved, the theme layer was the entire remaining gap. It is not
a tuning gap. Measured on the 50 ground-truth synthesis centroids:

|  | same-theme pairs | different-theme pairs |
| --- | --- | --- |
| median cosine | 0.743 | 0.670 |

| mechanism | best achievable F1 |
| --- | --- |
| best single pairwise cut, `text-embedding-3-small` | 0.480 |
| best single pairwise cut, `text-embedding-3-large` @1536 | 0.535 |
| global agglomerative clustering to the true k=10 | 0.432 |
| *what the shipped greedy pipeline actually reached* | *0.388* |

So the pipeline was already at ~90% of its mechanism's ceiling, a better embedding
model buys ~0.05, and a global re-clustering sweep buys **nothing** — it scores below
what greedy attach already achieves. The bands overlap; theme membership is a
semantic judgement that embedding distance does not encode on a single-question
corpus, where every statement shares the question's vocabulary.

Moving the decision to an LLM took topic F1 to 0.481 and then, with consolidation,
to **0.775**. This is the same conclusion the claim registry reached one layer down
(95% vs embeddings' 0.5%) and the same one the cross-synth merge gate reached: cosine
proposes, judgement disposes.

Two structural consequences, both measured:

- **Themes must be born from syntheses, not from pairs of raw options.** Cosine
  cannot tell whether two raw options share a theme, so that path spawned themes it
  could not see were redundant — one run produced "Public Service Access",
  "Essential service accessibility", "Public access and mobility" and "Community
  Support Services" side by side.
- **Themes need consolidating afterwards.** They are created in arrival order, so
  the first synthesis under a question *must* create one, which makes early headings
  narrower than the topic they end up representing. Left alone this produced 18
  headings for 10 topics with ten holding a single synthesis. One judge call per
  sweep over the whole heading set brought 20 created → 11 final, and moved the
  countable cluster score off 0.500 to **0.840**.

## Finding 8 — two measurement bugs that each inverted a conclusion

Both were found by auditing artifacts rather than by reading code, and each had
already caused a wrong call to be reported.

**The harness re-implemented the code under test.** `functions/scripts/runReJudgeMerge.ts`
described itself as a "faithful re-implementation" of the scheduled cross-synth merge.
It was faithful when written and stopped being so the moment the production sweep
gained an LLM merge gate — the pump kept merging on cosine alone. The only symptom
was a diagnostic counter reading 0, which is indistinguishable from a gate that ran
and approved. A harness that re-implements the code under test measures the copy, and
the divergence appears exactly when it matters: right after a fix lands. The pump now
calls the production function.

**Silence is not the same as done.** `waitForSettle` waits for a quiet window, but
the functions emulator serialises trigger executions, so a spawn that is queued but
not started writes nothing and looks identical to a finished run. A 2.5s window was
ample when the pipeline was pure cosine; a spawn now costs 8-10s. On the `llm-themes`
run the last three arrivals' spawns landed 3-29 seconds *after* the exporter
snapshotted, and the run reported 47/50 for a pipeline that had achieved 50/50 — with
three ground-truth pairs scored as failures and a fourth cluster lost entirely. The
window is now 12s, two consecutive quiet windows are required, and the final export is
taken twice and trusted only when unchanged.

Both bugs share a shape worth naming: **a measurement that fails silently in the
direction of looking plausible.** Neither produced an error; both produced a number.
