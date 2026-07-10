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
