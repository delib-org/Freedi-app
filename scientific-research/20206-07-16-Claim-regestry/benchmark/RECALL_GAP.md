# Condition E — Recall-Gap Benchmark (B1 ungated vs A2 gated)

Anchors processed: 150. Rewrites preserve stance (gpt-4o verified, lowest-cosine candidate first); the judge is the production classifier (gpt-4o-mini) against the anchor claim. Attach rule: expresses ∧ confidence ≥ 0.6.

## English adversarial rewrites

Verified same-stance: 147/150 (3 dropped by the independent meaning check).

Cosine to anchor (ctx format): median 0.860, min 0.738, max 0.965.

| Cosine band | n | B1 recall (judge always sees claim) | A2 recall, gate 0.45 | A2 recall, gate 0.60 |
|---|---|---|---|---|
| cos < 0.45 (invisible to retrieval) | 0 | — | — | — |
| 0.45 ≤ cos < 0.6 | 0 | — | — | — |
| cos ≥ 0.6 | 147 | 98.6% [95.2, 99.6] (145/147) | 98.6% [95.2, 99.6] (145/147) | 98.6% [95.2, 99.6] (145/147) |
| **All verified pairs** | 147 | 98.6% [95.2, 99.6] (145/147) | 98.6% [95.2, 99.6] (145/147) | 98.6% [95.2, 99.6] (145/147) |

Selected styles (lowest-cosine verified candidate): metaphorical 70, colloquial 25, values 24, formal 28.

## Hebrew paraphrases (cross-language)

Verified same-stance: 125/150 (25 dropped by the independent meaning check).

Cosine to anchor (ctx format): median 0.702, min 0.574, max 0.822.

| Cosine band | n | B1 recall (judge always sees claim) | A2 recall, gate 0.45 | A2 recall, gate 0.60 |
|---|---|---|---|---|
| cos < 0.45 (invisible to retrieval) | 0 | — | — | — |
| 0.45 ≤ cos < 0.6 | 6 | 100.0% [61.0, 100.0] (6/6) | 100.0% [61.0, 100.0] (6/6) | 0.0% [0.0, 39.0] (0/6) |
| cos ≥ 0.6 | 119 | 100.0% [96.9, 100.0] (119/119) | 100.0% [96.9, 100.0] (119/119) | 100.0% [96.9, 100.0] (119/119) |
| **All verified pairs** | 125 | 100.0% [97.0, 100.0] (125/125) | 100.0% [97.0, 100.0] (125/125) | 95.2% [89.9, 97.8] (119/125) |

## Reading the table

- **B1 − A2 in each row is the recall gap**: statements a gated (RAG-style) architecture structurally cannot file, because the embedding never retrieves the right claim for the judge to see.
- The main hard-triplet benchmark could not measure this: all its pairs were high-cosine by construction (its A2 tied B1 exactly).
- Precision control: the same judge's false-attach rate on stance-flipped distractors is measured in the main benchmark (B1: 2.1% on n=875) — low-cosine recall here is not bought with indiscriminate attaching.
