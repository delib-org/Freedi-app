# Annotation guide — equivalence labels (for Tal Yaron and Fany Yuval)

Two people annotate **independently**, without looking at each other's sheet, the
provisional labels (`labels.provisional.jsonl`), or any model output (`runs/`,
`results.csv`, `TABLES.md`). Then the disagreements are adjudicated together.

## Files

- `sheet-annotator-1.csv` — for annotator 1 (1,002 rows)
- `sheet-annotator-2.csv` — for annotator 2 (same rows, different order within each query)

Each row pairs a **query** (a new proposal) with a **candidate** (an existing
proposal from the same Pol.is discussion). Fill in two columns:

| column | value |
|---|---|
| `label` | `same`, `different` or `unsure` |
| `why_separate_or_note` | For close items you marked `different`, say in one line *why* they must stay apart (e.g. "adds a tax", "county not city"). Optional otherwise. |

Rows marked `section = fill-check` are 20 random items that screening did **not**
flag as close. Label them the same way. They test whether screening missed matches.

## The rule

Mark **same** only if the two proposals agree on the **action**, its **direction**,
its **scope**, and the **intervention**, so that a participant could not reasonably
support one while rejecting the other.

- Sharing a topic is not enough.
- A different action, the opposite direction, a different population or place, a
  different scope, or an added or removed condition means **different**.
- Different wording, level of politeness, or an added *reason*
  ("…because it would bring tax revenue") does not by itself make them different.
  Judge the proposed action, not the argument for it.
- A query can have several `same` candidates, or none.
- Use `unsure` sparingly. It is treated as "not an allowable match" in the primary
  analysis and reported separately.

## When both sheets are done

```bash
node annotation/import-labels.mjs                       # κ, agreement.json, disagreements.csv
# adjudicate disagreements.csv → annotation/adjudication.csv  (columns: row_id,label)
node annotation/import-labels.mjs --adjudicated=annotation/adjudication.csv
node analyze.mjs --study=. --labels=annotation/labels.human.jsonl
```

Re-scoring needs **no new API calls**. The pools were built so every item that could
plausibly be a match is either in a query's fixed core (present at all sizes) or
excluded. If a human marks an item outside the core `same`, the importer writes it
to `screening-misses.json` and the analysis reports that cell set as compromised.

Estimated effort: about 1,000 short comparisons per annotator, roughly 2–3 hours.
