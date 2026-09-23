# Clustering-scale probe — retrieve-then-judge vs full-list judge

**Date:** 11 September 2026 · **Protocol:** Tal Yaron & Fany Yuval, "Claude protocol: a
budgeted cost and accuracy probe for proposal clustering" (11 Sep 2026) · **Budget
cap:** US$5 · **Actually spent:** **US$0.269** · **Labels:** PROVISIONAL (model-authored),
human annotation pending.

## Abstract

This is a mechanism probe, not a pipeline benchmark. For 20 held-out proposals from one
real public deliberation (Pol.is, Bowling Green KY, CC BY 4.0), one LLM judge
(gpt-5.6-luna) decides whether an equivalent proposal already exists in nested pools of
100, 200 and 500 existing proposals. It sees either the whole pool (**A**) or only the
15 nearest by exact embedding cosine, in the same relative order (**B**). Everything
else is identical: question, rubric, schema, model, output cap, candidate texts.
There are 240 paired judgements across 2 presentation orders.

**Cost.** B's input stays flat at about 655 tokens while A's grows linearly, reaching
12,520 tokens at N=500. The median paired cost saving is 2.6×, 4.3× and 9.4× at 100,
200 and 500 (undiscounted). Output tokens, which are similar in A and B, cap the saving.

**Accuracy.** Neither method made a false join at 200 or 500. The one false join
anywhere was A's, at N=100, on an item already flagged borderline. A did not degrade
between 100 and 500. B's retrieval put an approved target among its 15 for 10/10
match-present queries at every size. Even so, B said "none" more
often when the target was shown: at N=500 there were 6 paired cells where only A was
correct and 0 where only B was. The judge becomes more conservative when every
candidate is a near-variant.

Under the provisional labels this fails the pre-registered accuracy criterion (B
incorrect 15 vs A 9 at N=500, allowed +2). Whether B is *missing* matches or A is
*over-joining* depends on labels that humans have not yet given.

Details: [`REPORT.md`](REPORT.md) · tables: [`TABLES.md`](TABLES.md) · pre-registration:
[`PREREGISTRATION.md`](PREREGISTRATION.md).

## Folder map

| path | what |
|---|---|
| `probe.mjs` | CLI: `prepare`, `dry-run`, `smoke`, `run`, `status`. Only `smoke` and `run` reach an API. |
| `analyze.mjs` | offline scoring → `results.csv`, `summary.json`, `TABLES.md`, `figures/` |
| `lib/` | pure modules (corpus, retrieval, pools, prompt, validator, pricing, ledger, executor, scoring, bootstrap). `transport.mjs` is the only module that reads a key. |
| `test/selftest.mjs` | offline mock-transport tests (`node --test test/selftest.mjs`) |
| `study.json` | every setting: seeds, model, caps, verified prices with URLs + retrieval date |
| `data/source/bowling-green/` | pinned Pol.is files + `PROVENANCE.md` |
| `data/bank-all.jsonl` | 607 eligible items with opaque ids |
| `annotation/` | shortlists, provisional labels, query-selection log, blank human sheets, guide, importer |
| `frozen/` | bank, queries, labels, pools, manifests, prompt template, `HASHES.sha256` |
| `.cache/emb-3small.*` | 1536-d vectors used by method B (3-large screening vectors are gitignored) |
| `runs/{prep,smoke,main}/` | per-attempt raw usage (`attempts.jsonl`) and per-decision records |
| `budget-ledger.jsonl` | every reservation / settlement (the $5 guard) |
| `dry-run.json` | worst-case pricing of every request, bound-vs-observed check |
| `analysis/` | historical cost-fit recomputation, figure builder |
| `figures/` | SVG (vector) + PNG previews |
| `manuscript-suggested-update.tex` | proposed text for the arXiv manuscript (not applied) |

## Commands actually run (in order)

```bash
node --test test/selftest.mjs                     # 9/9 pass, offline
node probe.mjs prepare --step=bank                # 607 of 896 rows eligible
node probe.mjs run --stage=embed                  # PAID $0.0048 (3-small + 3-large, 607 texts each)
node probe.mjs prepare --step=screen --limit=110  # shortlists for the seeded candidates
node annotation/build-provisional.mjs             # provisional labels + selection log (in-session reading)
node probe.mjs prepare --step=pools               # bank 583, 240 main + 8 smoke specs
node probe.mjs dry-run                            # worst case main $1.66 (1 attempt) / $3.32 (2)
node probe.mjs smoke                              # PAID $0.0047, 8/8 valid, max completion 280 < cap 4000
node probe.mjs prepare --step=freeze              # HASHES.sha256
node probe.mjs run --resume --allow-provisional   # PAID $0.2598, 240/240, 0 retries, 249 s
node analysis/recompute-cost-fit.mjs              # offline: reproduces parameters.json exactly
node annotation/make-sheets.mjs
node analyze.mjs --study=.
```

Repository revision at run time: `944aeb7ef` (branch `dev`). Node 22.17.1.

## Resume and reproduce

- **Resume an interrupted run:** `node probe.mjs run --resume --allow-provisional`. The
  ledger is replayed. Calls that already have a decision are skipped. A crash after a
  successful response is rebuilt from `attempts.jsonl` without re-sending, and an
  orphaned reservation is settled from that record or kept at full value. No call is
  made more than 2 times.
- **Re-score with human labels (no API):** see [`annotation/GUIDE.md`](annotation/GUIDE.md).
- **Verify without trusting the prose:** `shasum -a 256 -c frozen/HASHES.sha256`
  (from this folder), then `node analyze.mjs --study=.` regenerates every table and
  figure from the stored decisions. `node analysis/recompute-cost-fit.mjs` re-derives
  the manuscript's historical fit from the 2026-09-04 raw usage.
- A fresh paid replication needs `OPENAI_API_KEY` (env or `functions/.env`). The key is
  never written to any output.

## Data licence

Pol.is data © The Computational Democracy Project, CC BY 4.0. "Data was gathered using
the Polis software (compdemocracy.org/polis) and is sub-licensed under CC BY 4.0 with
Attribution to The Computational Democracy Project." Source:
https://github.com/compdemocracy/openData (commit `3be5785c3f59`),
conversation https://pol.is/9wtchdmmun. Code: GPL-3.0 (repository licence).
