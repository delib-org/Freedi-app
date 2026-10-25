# Theme layer and synthesis: plan from what we learned (2026-10-24)

Status: **plan, nothing built.** Owner: Tal. Evidence comes from three studies on local `dev`:
`scientific-research/2026-10-24-hdbscan-theme-probe/`, `scientific-research/2026-10-24-theme-refile-pass/`, and the earlier `2026-09-04-llm-only-baseline/`, `2026-09-11-clustering-scale-probe/`, `2026-09-18-theme-layer-narrow-questions/`.

## 1. What we know

| finding | evidence | consequence |
|---|---|---|
| Synthesis is strong | EN F1 1.000 / 0 false merges; HE 0.947; hard triplets 95.0% vs 80–81% for Blair–Procaccia–Tambe's tuned embeddings | keep the engine as is |
| Our theming beats conventional clustering | topic F1 EN 0.65–0.78 vs HDBSCAN 0.39–0.43, agglomerative 0.43–0.48; HE 0.66–0.91 vs 0.15–0.33 | **do not build the HDBSCAN worker** |
| A bare LLM themes better at 100 statements | full-list LLM topic F1 0.83–0.91 vs ours 0.75 | our case rests on cost and scale, which is unproven above 500 |
| Ideas are filed once, at arrival | `runSinglePipeline` → `assignToTheme`; the cron only splits and merges | arrival order still shapes the result |
| **Bug: some ideas are never themed** | the zero-neighbour path returns before the theme judge (`runSinglePipeline.ts:419`); `no-themes-yet` before the first synthesis (`nestSynthesis.ts:353`); NONE is final; nothing re-offers (`revisitUnmergedOptions` is synthesis-only; `minEvaluators: 0` means the threshold trigger never fires) | 26/114 unthemed on Bq; 0–7 per benchmark run |
| Re-offering unthemed ideas is safe | file-only pass: 8/8 runs equal or better, mean topic F1 0.757 → 0.779; Bq 23/26 filed | **build it** |
| Moving themed ideas is not safe | oscillates (11/36 moves ping-pong); on Bq moves 20% of statements both humans said fit | **do not build moves** with the current judge |
| Remaining loss is fragmentation | themefix has 16 themes vs 10 true topics, recall ~0.58 | the merge judge is the next lever |
| Truly unique ideas exist | some atoms fit no theme | Tal decided: **show them under "Other"**, never force a theme |

## 2. Workstreams, in order

### A. Every idea is either in a theme or in Other (the bug)

**A1 — cron step "file unthemed atoms"** (`functions/src/synthesis/pipeline/fileUnthemed.ts`, called from `reJudgeProcessParent` after the split sweep).
- Atom = a visible synthesis in no theme, or a visible option in no synthesis and no theme. The atom contract: never count a synthesis's members separately.
- For each atom: one `assignToTheme` call against the current live themes (`liveThemes` + `toThemeOption`, as in `nestSynthesis.ts`). On a theme id, add it in a transaction that re-checks the atom is still unthemed and the theme still visible, then `recordLiveSynthEvent` + `enqueueClusterRecompute`, as nesting does today. On NONE or error, leave it and it shows in Other.
- **Judged once:** store a fingerprint (atom id + sorted theme ids/titles) in `_liveSynthThemeFile`. Skip the atom until the theme list changes. This is the same pattern as `_liveSynthThemeSplit` / `_liveSynthThemeSweep`.
- Bounded: `MAX_FILES_PER_SWEEP` constant (start at 30), counted against the sweep's existing per-parent budget. Never create a theme here.
- It must not touch synthesis membership or votes. It only writes theme `integratedOptions`.
- Tests (`__tests__/fileUnthemed.test.ts`): files an unthemed option; files an unthemed synthesis; skips already-themed atoms; skips on unchanged fingerprint and re-judges after the theme list changes; NONE leaves the atom; a judge error leaves the atom and doesn't record the fingerprint (so it retries); concurrent theme hide aborts the write; members of a synthesis are not filed separately.

**A2 — live path fix (small).** In the zero-candidate branch (`runSinglePipeline.ts` ~419), when `llmThemeAssignment` is on and themes exist, call `assignOptionToTheme` before returning `seeded-singleton`. This removes the most obvious case at arrival; A1 still catches everything else.

**A3 — "Other" in the UI and exports.**
- **IA first:** run the `information-architect` agent → `docs/ia/main-app-theme-other.md`. Decide one name (label, i18n key, code type), where Other sits relative to themes (last, always), whether it's shown when empty (no), and how it reads to participants vs admins.
- Other is **derived on read**, not a Statement doc: atoms with no visible theme. That keeps it out of the synthesis collection and the vector index.
- Surfaces to cover: the ThinkingSpace / AgreementHub theme views (`src/view/components/atomic/organisms/ThinkingSpace/`), the tree view, and topic-grouped exports (`src/utils/exportUtils.ts`, `plans/topic-grouped-results-export.md`). MC if it shows themes.
- `useTranslation()` with keys in every language file. Atomic SCSS, BEM, design tokens only.

**A gate (before deploy).**
1. Unit tests and `npm run check-all` green.
2. Emulator replays: EN seeds 42/7/1234 and HE seed 42 (3-large), scored with `score100.mjs`. Topic F1 is no worse than each run's baseline, the unthemed count drops, and synthesis F1 and false merges are unchanged.
3. Bq replay (solo suite): the unthemed count drops; structure is reported.

**Deploy:** `fn_synthesisReJudge` (A1), plus the `liveSynthOnOption*` functions only if A2 lands, via `npm run deploy:f:test -- <fns>` first, then prod after Tal's go-ahead. Hosting for A3.

### B. Decisions recorded: do not build

- **No HDBSCAN worker.** It's below the current layer and its parameters don't transfer across languages; on Bq ≥66% of statements end in noise. With a perfect judge, agglomerative seeding reaches the same ceiling.
- **No moving themed ideas** until a stronger decision rule exists (e.g. two independent agreeing calls, or a pairwise "keep vs move" judge) and is measured with the refile harness, including on Bq's human fit flags.
- **No theme creation by single ideas.** Leftovers go to Other.

### C. Fragmentation: the merge judge

1. Offline, on the 8 benchmark end states: list every pair of themes that share a true topic. For each, record whether `consolidateThemes` proposed it, refused it, or never saw it (cap, `MIN_THEMES_TO_CONSOLIDATE`, the judged-once state, the sibling guard).
2. Fix the dominant cause, then re-measure on the same states. Make sure the split-sibling guard still blocks the Bq ping-pong.
3. Gate: topic recall up, precision no worse, no new catch-alls on Bq (largest share ≤ 30%).

### D. Isolation: themes are navigation only

From the HDBSCAN prompt, independent of the clusterer:
1. **Differential replay harness:** identical arrivals with frozen judge/writer/embedding responses, themes on vs off. The synthesis outcome, votes and joint texts must be identical. This proves themes can't change synthesis. Start with a test-level version on the 100-statement corpus.
2. **Audit indirect coupling.** Theme docs live in the statements collection and the vector index (`runSinglePipeline.ts` ~104 already notes cluster docs crowding top-k). Measure how often a theme doc takes a top-k slot from a real candidate.
3. Only if the audit shows real crowding: a separate theme read model or vector namespace, as an explicit migration with differential tests.

### E. Research and publication

1. **Human ceiling.** Recover Fanny's 36-cluster Bq labels (the on-disk `statements_full.xlsx` lost them on 2026-10-15). Have a second annotator label the same 114 statements and report inter-annotator ARI. That number is the target.
2. **Triplets, done fairly.** Add (a) a bare-LLM "same stance?" prompt and (b) decoys generated adversarially against the judge (buried negation, hedges, scope shifts). This shows what our design adds beyond "an LLM reads it".
3. **Scale experiment (the paper's main claim).** At 1k / 5k / 10k statements, compare ours vs a full-list incremental LLM vs a chunked one-shot LLM on synthesis accuracy, theme accuracy, and cost and latency per statement. The corpus needs planted duplicates (Pol.is Bowling Green has only 607 comments). The full-list arm at 10k costs about $200 per run. Pre-register the criteria.
4. **Held-out evaluation.** Freeze the pipeline commit, then test on corpora never used for tuning (the EN corpus had ~28 tuning runs).
5. **Paper framing until E3 lands.** Write it as a systems paper (online, auditable, no observed false merges, opposition refusal, verbatim originals) plus diagnostic findings (embedding geometry doesn't encode single-question themes; the narrow-question catch-all; file-once stickiness; a strong bare-LLM baseline at small N). Allowed claims: judge beats tuned embeddings on stance (95.0% vs 80–81%); our theming beats geometric clustering. **Not allowed:** "better than LLM-based theming", or any scale or cost claim not yet measured.

### F. Ideas to test later (measured before built)

- **Global re-plan:** periodically draft a theme list from all atoms, then file against it (TnT-LLM / GoalEx style). This is the direct fix for arrival order and the most promising open idea.
- **Instruction-conditioned embeddings** ("embed by area of concern for question X"), measured with the HDBSCAN probe harness for cosine separation.

## 3. Order and rough size

| step | size | depends on |
|---|---|---|
| A1 + A2 + tests | 1 day | — |
| A3 (IA spec → UI → i18n → export) | 1–2 days | IA spec |
| A gate replays | half a day of emulator time | A1, A2 |
| C merge-judge analysis + fix | 1–2 days | — (parallel to A) |
| D1 differential replay | 1–2 days | — |
| E1 human ceiling | annotator time | Fanny's file |
| E2 triplet baselines | half a day, < $5 | — |
| E3 scale experiment | 1 week + ~$500 budget | corpus, E1 |

A and C can run as parallel lanes (the `parallel-work` skill). Every deploy waits for Tal's explicit go-ahead.
