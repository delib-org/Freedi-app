# Theme layer on narrow questions: handoff (2026-09-18)

Question under study: **`Bq-VQPMPiG7b`** (production, `wizcol-app`). The question is:
"אילו תנאים וגורמים שזיהיתם יאפשרו לרתום את כוחו של המחקר לשינוי המציאות? נסו להציע פעולות, כלים, אירועים, סדירויות וכו'"
("Which conditions and factors you identified would enable harnessing the power of research to change reality? Suggest actions, tools, events, routines, etc.")

There are 114 participant statements. A human coder (Fanny) clustered them by hand: `~/Downloads/statements_full.xlsx`, with 36 clusters, 20 of them singletons. The research goal is to compare **Fanny's clustering with the machine clustering**, which is the online placement pipeline in the paper *Geometry Proposes, Judgement Disposes* (`~/Downloads/Geometry Proposes, Judgement Disposes - Scientific Research Paper (Freedi).pdf`).

---

## 1. What is already done

### Reports (in `~/Downloads`)
| File | Content |
|---|---|
| `machine_clustering_Bq-VQPMPiG7b.{xlsx,csv}` + `clustering_comparison_Bq-VQPMPiG7b.pdf` | v1: the **old** machine clustering (Aug 2026, 4 topics + 9 merge groups) vs Fanny |
| `machine_clustering_v2_Bq-VQPMPiG7b.{xlsx,csv}` + `clustering_comparison_v2_Bq-VQPMPiG7b.pdf` | v2: first re-cluster with the new algorithm (1 theme + 18 merge groups). This run **had duplicate merge groups** caused by the race below, so treat it as superseded |

Method used in both reports: compare over the 114 original statements; drop the 27 machine-cluster rows that are in Fanny's file. Metrics are pair coverage, pair precision (Fanny's second label counts) and ARI with singletons. There's also a table of merge-group purity ("all members share a Fanny cluster").

Scripts (copied from the session scratchpad) are in `scripts/` next to this file:
- `fetch2.cjs`: read-only production pull of a question's children, using ADC with projectId `wizcol-app`.
- `failed.cjs`: queue status and failed items.
- `timeline.cjs`: cluster create/delete timeline.
- `analyze*.py` / `build*.py`: Excel, CSV and HTML → PDF via headless Chrome.

The scripts need a Python venv with `pandas openpyxl scikit-learn pypdf`, and paths inside them point at the old scratchpad, so adjust those.

Data snapshots are in `~/Downloads/clustering-research-Bq-VQPMPiG7b/` (not in git, because they contain participant data):
- `snapshot-1-before-recluster.json`: the old clusters. This is the only backup of them.
- `snapshot-2-recluster-with-duplicates.json`
- `snapshot-3-after-race-fix.json`
- `snapshot-4-after-dedup-fix.json`
- `paper-text.txt`: the paper as text.

### Bugs found and fixed (all on `dev`; **`dev` is not pushed**)
| Commit | Bug | Status |
|---|---|---|
| `06a2effc2` (Tal) | Two queue workers drained the same items: Cloud Scheduler re-fired after its ~3-minute deadline and there was no lease. Cancel was ignored, so a new re-cluster dissolved clusters mid-build | Deployed |
| `29c81ea06` | **Spawn race**: `spawnClusterFromPair` did check → LLM (seconds) → write, so overlapping spawns created duplicate synths. Now a single transaction with per-member claim docs (`_synthSpawnClaims`, `pipeline/spawnClaims.ts`) | Deployed |
| `29c81ea06` | **Lost retries**: the worker deleted an item that the pipeline had just re-queued under the same id. The worker now keeps re-queued items, and a retry counts one attempt (max 3) | Deployed |
| `a5be0294d` | **Dedup treated as failure**: when a sibling was already in a synth that wasn't among the vector candidates, P2 re-queued forever and the statement never reached theming (30/114 "retries exhausted"). Now `deduped` → next candidate → theming | Deployed ~08:30 |
| `a5be0294d` | **Stranded queue items**: re-judge revisits, claim mutations and live retries enqueued without a run. `ensureQueueRun` (`queue/enqueue.ts`) joins a live run, starts a small one, or respects pause/cancel | Deployed ~08:30 |

Evidence for the race: production logs 2026-09-18 03:45–03:47Z. Workers `6evhhsxvpp7m` and `6f0mp13lygnd` both spawned `N0u…+brW…` (synths `qgAihJACKhzM` / `1aw2Ct9zn63t`) and `Rgvp…+chqV…` (`iBlnoq55k9M0` / `KTs-oiWginDO`).

### Live state at hand-off (≈08:46)
- 18 merge groups, **0 duplicates**. Merge layer ✓.
- **2 themes**: "מינוף מחקר לשינוי מציאות" (56 statements) and "שיתופי פעולה בין בעלי עניין" (29). 10 statements unclustered.
- The re-judge sweep (`fn_synthesisReJudge`, every 10 min) is working through a revisit backlog of 10 per sweep (35 → 25 → …). With `ensureQueueRun` it now starts its own small runs (`initiatedBy: 'system'`), which is expected. When it settles, one "סנתז" (Synthesize now) press clears any leftover "retries exhausted" items.

---

## 2. The open problem: the theme layer collapses on a narrow question

**Symptom.** One theme whose title restates the question ("Leveraging research to change reality") swallows most statements. Thematic structure is far poorer than Fanny's 36 clusters.

**Why.** Three mechanisms reinforce each other. All are in `functions/src/services/integration-ai-service.ts` and `functions/src/synthesis/pipeline/nestSynthesis.ts`.

1. **The theme title may restate the question.** `generateTopicLabel` (≈line 585) names a theme from its first synth plus the question context. The prompt has no rule against a label that paraphrases the question. Themes are born only from a synthesis (`createThemeForSynth`, `nestSynthesis.ts` ≈139), so the first theme's title sets the attractor.
2. **The filing judge's notion of "topic" fits broad questions only.** `assignToTheme` (≈line 790) defines a topic as "the same general area of concern" (example: buses and bike lanes are both transport). On a question where every answer shares one area of concern, every proposal "belongs" to the broad theme. The existing `"When unsure, answer NONE"` and "don't choose a title just because it sounds broad" guards aren't enough: the contents shown are themselves broad.
3. **Nothing splits a theme.** `consolidateThemes.ts` only **merges** themes. A plain option can't create a theme (`assignOptionToTheme` is file-only), and a new synth is usually filed into the attractor, so no second theme gets born. The claim registry has a `tooBroad` flag (`consolidation/consolidateClaims.ts`), but only for claims, and it routes to admin review.

The paper's benchmark (100 statements, about 10 clearly distinct topics) never exercised this regime. **A narrow question with sub-themes is a new failure class, and publishable.**

---

## 3. Proposed solutions (not started)

- **A. Theme titles must discriminate.** Extend the `generateTopicLabel` prompt: name the specific sub-area that separates these ideas from other answers to the same question, and never restate or paraphrase the question. Guard it in code: if the label is too close to the question (cosine between the label and question embeddings above a calibrated threshold, or a cheap LLM yes/no), regenerate once with a stricter instruction. If it's still too close, fall back to the synth title.
- **B. A question-relative filing judge.** Add to the `assignToTheme` prompt: "Every proposal answers the same question, so relating to the question is never a reason to file it. File only when it shares the specific lever or mechanism of what the topic already holds (e.g. funding, partnerships, education, data access)."
- **C. A split sweep (the mirror of `consolidateThemes`).** Trigger: a theme holding more than about ⅓ of the question's placed statements, or more than N members. One LLM call proposes 2–5 sub-themes with titles and assigns the members. Apply it by creating the sub-themes, re-homing the members and hiding the parent. Same once-per-theme-set fingerprint guard as consolidation, so a settled question isn't re-asked every 10 minutes. The merge sweep repairs any over-split.
- **D. (Optional) Let unthemed options seed a theme** once several unthemed options accumulate that the judge says share a sub-area. Today only a synth can seed one.

### Validation plan (do this first)
1. **Baseline**: score the current theme layer of `Bq-VQPMPiG7b` against Fanny's labels (pairwise F1 / ARI; reuse `scripts/build2.py` metrics). This becomes the **narrow-question Hebrew benchmark**, with human ground truth.
2. Replay offline, without touching production: export the question (`scripts/exportProdQuestion.ts` / `importQuestionToEmulator.ts`), run the pipeline in the solo emulator suite with A+B(+C), and re-score against Fanny.
3. Guard against regression: re-run the existing 100-statement live-synth accuracy benchmark (EN/HE; see memory `live-synth-accuracy-benchmark`). The multi-topic case must not get worse.
4. Only then deploy, then use "Re-cluster from scratch" on `Bq-VQPMPiG7b` (once), and regenerate the v3 comparison report.

---

## 3b. What was done (2026-09-18, second session)

Fixes A, B and C are implemented on `dev` (D is not; see below). Everything below is measured against Fanny's labels with `scripts/scoreVsFanny.py`, which scores any snapshot in the `fetch2.cjs` / export shape.

### Baseline (validation step 1)

| snapshot | themes | largest theme, share of placed | theme pairs prec / rec / F1 | ARI | unthemed |
|---|---|---|---|---|---|
| snapshot-1 (Aug clustering) | 4 | 77% | 0.216 / 0.624 / 0.321 | 0.208 | 37 |
| **snapshot-4 (live at hand-off)** | **2** | **64%** | **0.117 / 0.449 / 0.186** | **0.035** | 19 |

The live theme layer is barely better than chance (ARI 0.04). The 61-statement theme holds 26 of Fanny's 36 clusters. Recall is dominated by Fanny's own 30-statement cluster (*Research–civil society partnership*, 435 of her ~1,050 pairs), so F1 is a poor summary here; ARI is the fairer number.

### The fixes

- **A. Label guard** (`generateTopicLabel`, `labelRestatesQuestion` in `integration-ai-service.ts`). The prompt now demands the sub-area that separates these ideas from other answers and forbids restating the question. A fast-model yes/no check (not cosine: the Hebrew 3-large space packs into 0.64–0.94, so no threshold would transfer) rejects a restating label; one stricter regeneration, then the synth-title fallback. Fail-open. On the live titles: "מינוף מחקר לשינוי מציאות" → restates **true**; "שיתופי פעולה בין בעלי עניין" → false.
- **B. Question-relative judges.** `assignToTheme`: answering the question is never a reason to file; file only on a shared specific sub-area; a topic whose contents span many sub-areas is a catch-all, prefer NONE. The same clause went into `groupEquivalentThemes`, plus "never give a merged group a heading that restates the question", because the merge sweep is the other place a catch-all can be born.
- **C. Split sweep** (`pipeline/splitThemes.ts`, `proposeThemeSplit`). Runs in `reJudgeProcessParent` after consolidation. Trigger: ≥ 8 leaves (a synthesis counts per member) AND (≥ ⅓ of placed OR ≥ 25 leaves). One call proposes 2–6 sub-topics with member assignment; applied in a transaction that re-checks the parent's membership fingerprint; parent hidden with `splitInto`, sub-topics carry `splitFrom`; unassigned members become unthemed and are logged. Each membership is judged once (`_liveSynthThemeSplit/{parentId}`). At most 2 splits per parent per sweep. **Loop guard:** `consolidateThemes` refuses a group containing two siblings of the same split (cross-parent merges stay allowed).
- **D not built.** With C in place the sub-themes exist for the judge to file into; D stays optional.

Tests: `synthesis/__tests__/splitThemes.test.ts`, `services/__tests__/themeLabelAndSplit.test.ts`, two cases added to `consolidateThemes.test.ts`. Audit action `'split'` added.

### Offline dry run on the live state (validation step 2a, real LLM, no Firestore)

`scripts/splitDryRun.ts` runs the split judge on snapshot-4's two themes; `scripts/consolidateDryRun.ts` then runs the merge judge on the result, the way the next sweep tick would. Two independent split runs gave the same structure (6 + 6 sub-topics, every member assigned, headings like *Incentives, resources and training*, *Knowledge access and public discourse*, *Intermediaries and decision-makers*, *Forums and meetings*, *Citizen science*).

| state | themes | largest share | prec / rec / F1 | ARI |
|---|---|---|---|---|
| live (snapshot-4) | 2 | 64% | 0.117 / 0.449 / 0.186 | 0.035 |
| after split, run 1 | 12 | 12% | 0.268 / 0.169 / 0.207 | 0.131 |
| after split, run 2 | 12 | 14% | 0.277 / 0.175 / 0.214 | 0.139 |
| after split + merge sweep (run 1) | 9 | 17% | 0.267 / 0.222 / 0.242 | 0.150 |

The merge sweep proposed 4 groups: 3 cross-parent duplicates (merged) and 1 sibling pair (refused by the guard). Precision doubles, ARI ×4. Recall against Fanny's 30-statement cluster is what caps F1 — the machine sub-divides that cluster into partnerships / field-grounded research / intermediaries / tools, which is a finer reading than hers, not a wrong one.

**Consequence for production:** deploying the sweep set fixes the live question *without* a re-cluster — the first `fn_synthesisReJudge` tick after deploy splits both themes, the next tidies. A re-cluster is only needed to test whether A+B prevent the collapse from forming in the first place.

### Emulator replay (validation step 2b)

`runs/bq-replay-themefix` under `scientific-research/2026-08-18-live-synth-accuracy/` — the 114 statements in arrival order, production bands + 3-large, solo emulator suite, with A+B+C (82 min; `score-vs-fanny.json` in the folder; export via `scripts/exportEmulatorRun.cjs`, which maps the harness's fresh ids back).

| state | themes | largest share | prec / rec / F1 | ARI |
|---|---|---|---|---|
| live production (snapshot-4) | 2 | 64% | 0.117 / 0.449 / 0.186 | 0.035 |
| replay from scratch with A+B+C, at harness end | 8 | 28% | 0.189 / 0.222 / 0.204 | 0.088 |
| + one more sweep tick offline (split the 26-leaf theme) | 11 | 22% | 0.249 / 0.193 / 0.217 | 0.117 |
| + the merge tick after it | 10 | 28% | 0.211 / 0.204 / 0.207 | 0.099 |

What happened in the run: **the label guard never fired** — with the new prompt no theme title restated the question in 114 arrivals (final headings: funding and resources; knowledge access and brokering; trust and knowledge mapping; continuity and persistence; community involvement; cross-sector partnerships; initiative and daring; research-question focus). The split sweep fired twice (a 3-theme set → +4 sub-topics; a 7-theme set → +5), the merge sweep merged 3 and **tried 3 times to re-merge split siblings**, which the guard refused — the loop guard is load-bearing, not theoretical. The 26-leaf "cross-sector partnerships" heading was one tick short of its split when the harness stopped (it trips the ≥25 rule); production's 10-minute sweep would take it.

Reading: from scratch, A+B+C turn one catch-all into 8–11 headings of 6–26 statements with precision 0.19–0.25 vs Fanny (up from 0.12) and ARI 2.5–3× the live state. The offline split of the *existing* live state scores higher still (ARI 0.15), because it starts from Fanny-sized merge groups already settled. Both routes beat the baseline; neither reaches the old August clustering's F1 0.32, which rested on one 59-statement heading matching Fanny's 30-statement cluster — recall the new structure gives up by design.

**Where the remaining gap is:** the merge judge still wants to reunite sub-topics on a narrow question (3 refused sibling merges + 1 more in the offline tick, plus 3 cross-parent merges that each cost ~0.02 ARI). Next lever is `groupEquivalentThemes` on narrow questions — e.g. refuse a merge whose result would trip the split trigger, or show it the split history — not the split itself.

### Regression on the broad-question benchmark (validation step 3)

`runs/en-seed42-themefix` (English 100-statement corpus, seed 42, defaults, same solo suite, 62 min) against the baseline `en-seed42-alljudged`:

| | baseline | with A+B+C |
|---|---|---|
| composite | 0.878 | 0.861 |
| synth pairs | P 1.000 / R 0.980 / F1 0.990, 0 false merges | **P 1.000 / R 1.000 / F1 1.000**, 0 false merges |
| topic pairs | P 0.713 / R 0.707 / F1 0.710 | P 0.740 / R 0.582 / F1 0.652 |
| topics produced (10 true) | 14 | 16 |

The synthesis layer is untouched (perfect on this run). On a broad question the split sweep never fired (no theme approached the trigger) and the label guard never rejected anything, both as intended. Topic recall dropped 0.12 and precision rose 0.03: the question-relative filing clause (B) makes the judge file less eagerly, which on a broad question means two more headings than before. The composite is inside the documented run-to-run band for topic filing (0.78–0.93 across the study's seeds), so one run cannot separate B's cost from filing dice, but the direction is plausible and worth knowing: **B trades a little broad-question recall for narrow-question precision.** If that matters, the consolidation sweep is where a broad question recovers it, and on this run it merged 10 times. Not a blocker for deploy; a second seed would settle it.

### Not done
- HE 100-statement regression not re-run (the HE corpus needs the 3-large pin; same harness, `--set embeddingModel=text-embedding-3-large`).
- A second EN seed to separate B's effect from filing variance.

## 4. Other open items
- **Map not live** (it showed deleted clusters until a refresh). The listener dies silently on errors or network drops, and a restart can't see deletions made meanwhile. The full plan is **Part 2** of `~/.claude/plans/tranquil-napping-cake.md`: port Join's `resilientOnSnapshot` into `src/controllers/utils/firestoreListenerHelpers.ts`, and add a tombstone listener plus cluster reconcile to `listenToMindMapData`.
- **"Synthesize now" is refused while a system run is active.** It should join the running run instead (`fn_synthesizeNow.ts`, `isRunInFlight`).
- **P1 attach vs P2 spawn race** is not claim-guarded (rare now that there's one worker per question).
- **Push `dev`** when ready. `feat/odyssey-feedback` was merged into dev by Tal (`cc6bfb8f4`).
- **Deploy**: auto-mode blocks `npm run deploy:f:prod`, so Tal runs it. The synthesis deploy set is `processSynthesisQueue reCluster synthesisCancel synthesisPause synthesisResume synthesizeNow synthesizeSelected` + `claimRegistryFirstRun rejudgeGrayBand fn_synthesisReJudge fn_synthesisBulkFlush liveSynthOnOptionCreate liveSynthOnOptionUpdate liveSynthOnOptionEvaluationChange`.
