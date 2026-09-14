# Scientific Research

Formal, reproducible research produced during Freedi development. Each
sub-folder is **one self-contained study**: a name, a date, an abstract, its
own methodology, raw data, and independent reproduction instructions — so an
outside scientist can pick it up and re-derive every claim without taking our
word for it.

## Studies

| Study | Date | Summary |
|---|---|---|
| [`2026-06-14-synthesis-clustering-validation/`](./2026-06-14-synthesis-clustering-validation/README.md) | 1–14 June 2026 | Controlled ground-truth validation of the synthesis & clustering pipeline (merging paraphrased contributions into distinct proposals, keeping opposites apart, grouping into topics). 5 experiments, 3 production bugs found and fixed. |
| [`2026-07-24-delta-support-probe/`](./2026-07-24-delta-support-probe/README.md) | 24 July 2026 | Method design (pre-registration stage): embedded probe sampling — 1 of 6 evaluation slots serves a current top-avg-eval proposal — yielding a within-user Δ(r) convergence curve plus top-set churn, at zero participant burden. Includes implementation spec for the MC app. |
| [`2026-09-11-clustering-scale-probe/`](./2026-09-11-clustering-scale-probe/README.md) | 11 September 2026 | Budgeted ($0.27 of a $5 cap) mechanism probe on real Pol.is data: an LLM judge sees either the full pool (100/200/500 proposals) or the top-15 by embedding, 240 paired calls. Retrieval is 2.6×/4.3×/9.4× cheaper; the full list shows no degradation to 500; retrieval makes the judge more conservative. Labels provisional pending human annotation. |

*(Future studies get their own dated sub-folder here, following the same
`YYYY-MM-DD-short-name/` convention and internal structure — see below.)*

## Conventions for a new study

1. **Folder name:** `YYYY-MM-DD-short-kebab-name/`, dated to when the study
   was finalized (so folders sort chronologically).
2. **Self-contained:** everything the study needs — protocol docs, scripts or
   symlinks to canonical scripts, raw data, and the report — lives inside that
   one folder. Don't reach outside it except via symlinks to the single
   canonical source (avoids duplication/drift).
3. **`README.md` at the study root** states: study name, date, abstract,
   folder map, and at least one way to independently reproduce or verify the
   findings without trusting the prose.
4. **Register it** by adding a row to the table above.

## License

Part of the Freedi project — **GPL-3.0** (`LICENSE.md` at the repo root).
Attribution to the **Deliberative Democracy Institute** ([delib.org](https://delib.org))
is required per the license's attribution clause. Each study's artifacts are
released under the same license.
