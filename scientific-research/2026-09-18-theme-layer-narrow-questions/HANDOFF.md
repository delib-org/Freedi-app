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

## 4. Other open items
- **Map not live** (it showed deleted clusters until a refresh). The listener dies silently on errors or network drops, and a restart can't see deletions made meanwhile. The full plan is **Part 2** of `~/.claude/plans/tranquil-napping-cake.md`: port Join's `resilientOnSnapshot` into `src/controllers/utils/firestoreListenerHelpers.ts`, and add a tombstone listener plus cluster reconcile to `listenToMindMapData`.
- **"Synthesize now" is refused while a system run is active.** It should join the running run instead (`fn_synthesizeNow.ts`, `isRunInFlight`).
- **P1 attach vs P2 spawn race** is not claim-guarded (rare now that there's one worker per question).
- **Push `dev`** when ready. `feat/odyssey-feedback` was merged into dev by Tal (`cc6bfb8f4`).
- **Deploy**: auto-mode blocks `npm run deploy:f:prod`, so Tal runs it. The synthesis deploy set is `processSynthesisQueue reCluster synthesisCancel synthesisPause synthesisResume synthesizeNow synthesizeSelected` + `claimRegistryFirstRun rejudgeGrayBand fn_synthesisReJudge fn_synthesisBulkFlush liveSynthOnOptionCreate liveSynthOnOptionUpdate liveSynthOnOptionEvaluationChange`.
