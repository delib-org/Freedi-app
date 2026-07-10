# The Freedi Synthesis & Clustering Validation Campaign

**A controlled, ground-truth evaluation of how Freedi merges thousands of
free-text contributions into a small set of distinct proposals.**

| | |
|---|---|
| **Study name** | Validation of an Embedding-Based Synthesis & Clustering Pipeline for Large-Scale Deliberation |
| **Date** | Data collected 1–4 June 2026 · report finalized 14 June 2026 |
| **System under test** | Freedi's production "bulk" synthesis path — `bulkClusterByEmbedding` (UMAP→DBSCAN) + `twoTierJudge` (cosine bands + LLM equivalence judge) |
| **Runs** | 5 controlled corpora, each with a known ground truth |
| **Organization** | Deliberative Democracy Institute ([delib.org](https://delib.org)) — Freedi project |
| **License** | GPL-3.0 (`LICENSE.md` at repo root); these artifacts are released under the same license |

This folder is a **self-contained scientific record**: every claim it makes is
backed by a committed artifact (input sentences, exact embedding vectors,
pipeline output, and a dependency-free scorer), so an outside scientist can
independently re-derive every number without taking our word for it. This file
is the front door — start here, then follow the links below.

---

## Abstract

Large-scale deliberation platforms must reduce hundreds or thousands of
free-text contributions into a tractable set of distinct proposals without
discarding minority positions or conflating opposing ones. Freedi does this
with a two-stage **synthesis pipeline**: embedding-based geometric clustering
(UMAP → DBSCAN over OpenAI `text-embedding-3-small` vectors), followed by a
medoid-anchored, cosine-banded **two-tier judge** that uses a large language
model to verify semantic equivalence within each candidate cluster.

We built **five synthetic corpora with known ground-truth structure** and
tested whether the pipeline (a) merges paraphrases of one idea into a single
"synth," (b) keeps distinct-but-related ideas separate, (c) keeps opposing
stances separate, (d) leaves a lone outlier unclustered, and (e) groups synths
into correct topics.

**Result:** on realistically-worded input the pipeline recovers ground-truth
synth structure **exactly** (12/12 pure synths, 60/60 options assigned, zero
overlap), correctly leaves an off-topic outlier unclustered, and — critically —
its LLM verifier separates opposing stances ("make peace" vs. "do *not* make
peace") that pure cosine similarity conflates. Running this campaign surfaced
**three real production defects**, all since root-caused and fixed with
regression tests, plus one recall-improving refinement. The dominant residual
failure mode is **corpus realism**: synthetic paraphrases written with maximal
lexical variation fragment recovery in a way real human near-duplicates likely
would not. Full results, numbers, and discussion: **[`VALIDATION-REPORT.md`](./validation/VALIDATION-REPORT.md)**.

---

## Start here: three ways to read this

| If you want... | Read |
|---|---|
| The full scientific paper (abstract, related work, methods, results, threats to validity, references) | **[`validation/VALIDATION-REPORT.md`](./validation/VALIDATION-REPORT.md)** ([PDF](./validation/VALIDATION-REPORT.pdf)) |
| A condensed, numbers-first internal summary of all 5 runs + the 3 bugs found | **[`validation/FINDINGS.md`](./validation/FINDINGS.md)** |
| A plain-language explanation with no jargon (for a non-specialist reviewer) | **[`validation/FINDINGS-plain.md`](./validation/FINDINGS-plain.md)** ([PDF](./validation/FINDINGS-plain.pdf)) |

## Reevaluate it yourself

You do not have to trust our numbers — every one of them is checked into this
folder and re-derivable independently, at three levels of independence
(cheapest first):

```bash
# Level 1 — recompute every metric from the committed artifacts.
# No dependencies, no API keys, no emulator.
cd scientific-research/2026-06-14-synthesis-clustering-validation/validation
node score.mjs 1-6-2026-40-20-10-validation

# Level 2 — re-run the real clustering primitive on the exact shipped
# embedding vectors. No OpenAI key, no emulator — proves the numbers
# aren't just re-read, they're re-derived.
cd ../../functions && npm install
npx tsx scripts/verifyFromEmbeddings.ts ../scientific-research/2026-06-14-synthesis-clustering-validation/validation/1-6-2026-40-20-10-validation

# Level 3 — full end-to-end: regenerate embeddings from raw text and run
# the whole live pipeline. Requires an OpenAI API key + the Firebase
# emulators. Full walkthrough: REPRODUCTION-GUIDE.md.
```

To run the **same protocol on your own sentences** (not just replay ours),
follow **[`REPRODUCTION-GUIDE.md`](./REPRODUCTION-GUIDE.md)** — a self-contained,
copy-paste sheet for installing the app from scratch and validating with a
corpus you write yourself.

---

## Folder map

```
scientific-research/
├── README.md                        ← you are here — study index, name, date, abstract
├── REPRODUCTION-GUIDE.md            ← install-from-scratch + run-with-your-own-corpus guide
├── DESIGNING-TEST-CORPORA.md        ← how to design a corpus with a known ground truth
├── PREPARING-VALIDATION-REPORTS.md  ← the agent protocol used to run + record every experiment
├── scripts/                         ← the seed script + reference corpus (symlinked to canonical repo copies)
└── validation/
    ├── VALIDATION-REPORT.md (+ .pdf)   ← THE PAPER: full write-up of the whole campaign
    ├── FINDINGS.md                     ← condensed internal summary (all 5 runs, 3 bugs found)
    ├── FINDINGS-plain.md (+ .pdf)      ← plain-language version of FINDINGS.md
    ├── README.md                       ← protocol notes + run index
    ├── score.mjs                       ← dependency-free scorer (verifies a run vs. its ground truth)
    └── <5 dated run folders>/          ← one per experiment (see table below)
        ├── statements.json                # input sentences + ground-truth labels
        ├── embeddings.json                # exact 1536-d input vectors (reproduce without an API key)
        ├── results.json                   # pipeline output + full parameter manifest
        └── report.md                      # per-run objective, procedure, results, verdict, reproduction
```

**Reading order for methodology:** `DESIGNING-TEST-CORPORA.md` (how a corpus
with a known answer is built) → `PREPARING-VALIDATION-REPORTS.md` (how a run is
executed and recorded) → each run's `report.md` (the executed instance).

---

## The five experiments

| Run folder | Structure | Property tested | Verdict |
|---|---|---|---|
| [`1-6-2026-40-20-10-validation`](./validation/1-6-2026-40-20-10-validation/report.md) | 2 topics × 2 synths × 10 paraphrases = 40 | Clean recovery (reference baseline) | **PASS** — 4 pure synths, 2 correct topics, 0 overlap |
| [`4-6-2026-60-20-5-validation`](./validation/4-6-2026-60-20-5-validation/report.md) | 3 topics × 4 synths × 5 = 60, *loosely* worded | Recovery under unrealistically low within-synth similarity | **FAIL (partial)** — surfaced 2 production bugs, since fixed |
| [`4-6-2026-60-20-5-tight-validation`](./validation/4-6-2026-60-20-5-tight-validation/report.md) | Same structure, *tightly* worded | Recovery under realistic wording (controlled A/B vs. the loose run) | **PASS** — 12/12 pure synths, 60/60 assigned, 0 LLM calls needed |
| [`4-6-2026-20-10-5-negation-validation`](./validation/4-6-2026-20-10-5-negation-validation/report.md) | 2 subjects × pro/anti stance × 5 = 20 | Opposing stances must not be merged | **PASS** — 4 stance-pure synths, 0 cross-stance contamination |
| [`4-6-2026-41-20-4-singleton-validation`](./validation/4-6-2026-41-20-4-singleton-validation/report.md) | 2 topics × 5 synths × 4 + 1 off-topic outlier = 41 | A lone, unrelated statement must stay unclustered | **PASS** — outlier correctly left unclustered (first run failed, root-caused a production bug) |

Each run folder is independently self-contained: read its `report.md` for the
exact procedure, every tuned parameter with its justification (e.g. the DBSCAN
`ε` sweep), the results table, and three levels of reproduction commands.

---

## What this campaign found (short version)

1. **Synth recovery is exact on realistically-worded input** — 12/12 pure
   synths, full coverage, zero overlap, and the cosine tier alone handles it
   (zero LLM calls).
2. **The LLM equivalence judge does what cosine similarity cannot** — it
   separates closely-related-but-distinct ideas and, critically, opposing
   stances that sit at high cosine similarity.
3. **Lone outliers are correctly left unclustered**, after a bug fix.
4. **Three real production defects were found and fixed** by this validation
   process itself (DBSCAN border double-claim, an over-high auto-reject
   threshold, and a dissenter-retention bug in the "keep" branch) — each with a
   regression test. See `FINDINGS.md` §4 for the full defect table.
5. **The dominant remaining variable is corpus realism**, not the mechanism: a
   controlled loose-vs-tight A/B (identical structure, only the wording width
   changed) showed recovery jumping from 6/12 pure synths to 12/12 purely from
   more realistic wording.

## Honest limitations (read before citing this)

- **All five corpora are LLM-authored synthetic sentences (Claude), not real
  human deliberation.** They are cleaner and more on-message than genuine input.
  A PASS here is **necessary, not sufficient** — it shows the mechanism *can*
  recover a known structure from a clean signal; it does not establish
  robustness on messy real-world text. This is disclosed in every report, not
  just here.
- **Topic-level grouping is unproven for closely-related sub-topics** — the
  clustering method used to form topics in these runs is a diagnostic script,
  not the production topic-formation path. This is the main open item; see
  `VALIDATION-REPORT.md` §8.
- **Cluster membership is deterministic and reproducible** (fixed UMAP seed,
  shipped embedding vectors); **LLM-generated titles and equivalence verdicts
  are not** — only membership is ever scored.

Full discussion of threats to validity: `VALIDATION-REPORT.md` §8, or the
plain-language version in `FINDINGS-plain.md`.

---

## Provenance

| | |
|---|---|
| Branch | `fix-default-mono-discussion` |
| Commit span | `8e1d10e29` → `ef32bf68b` (validation runs) → `661ec69e4` (final report + PDF) |
| Environment | Node 22.17.1 · `umap-js` 1.4.0 · `cloud-firestore-emulator` v1.19.8 · macOS (Darwin 24.6.0) |
| Embedding model | OpenAI `text-embedding-3-small` (1536-d) |
| Equivalence judge / titles | Gemini (Vertex AI) — non-deterministic, never scored |

## License

Part of the Freedi project — **GPL-3.0** (`LICENSE.md` at the repo root).
Under the license's attribution clause, any deployment of this software must
credit the **Deliberative Democracy Institute** ([delib.org](https://delib.org)).
These validation artifacts, scripts, and reports are released under the same
license.
