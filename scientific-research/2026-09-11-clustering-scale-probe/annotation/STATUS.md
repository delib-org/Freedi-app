# Label status — 2026-09-11

| item | status |
|---|---|
| Human labels (two independent annotators + adjudication) | **NOT DONE — blocking dependency for the scientific decision gate** |
| Provisional labels used by the main run | `labels.provisional.jsonl` (copied to `../frozen/labels.jsonl`), written by Claude (claude-opus-5) from the screening shortlists. Model-authored, **not** independent human ground truth. |
| Query selection log | `query-selection.jsonl`: 97 seeded candidates walked, each with an accept or reject reason. No judge output existed at selection time. |
| Blank blinded sheets | `sheet-annotator-1.csv`, `sheet-annotator-2.csv` (1,002 rows each: 24 queries × shortlist + 20 fill checks) |
| Screening method | per query: union of top-25 text-embedding-3-small, top-25 text-embedding-3-large, top-15 BM25 (`shortlists.jsonl`, readable `shortlists.md`) |

## What the provisional labeller did, and did not do

- Read each candidate query's shortlist and tagged items as **match** or **hard
  distractor** (with a reason). Items a lenient reader might call `same` were
  marked **borderline**. No item was marked ambiguous-and-excluded.
- Justification clauses were treated as not changing the proposal (e.g.
  "legalising marijuana would be a boon" counts as the same proposal as
  "recreational marijuana should be legal").
- It did not look at any judge output (none existed), and it did not tune anything on
  the smoke results. In the smoke test the judge rejected both dev matches. That
  showed the judge is stricter than these labels, and nothing was changed.

## Why this matters for the result

In the main run, 18 of the 19 A-vs-B disagreements on match-present queries are
cases where A said `same` and B said `none` (the remaining one is the reverse; one
further disagreement is on a no-match query, where A joined and B did not). Under these provisional labels, that counts as
B missing a match. If the human labels are stricter (for example, "municipal
internet" ≠ "BGMU residential fiber utility"), the same cells become A **false
joins** and the conclusion reverses. The human labels decide which reading holds.
