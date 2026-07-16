# Claim-Registry Hard-Triplet Benchmark

Measures the claim registry's classification accuracy on the hard triplets from
**Blair, Procaccia & Tambe, "Embeddings for Preferences, Not Semantics"**, and
compares it against the production embedding-cosine passes and the paper's
published numbers. Each triplet is (anchor, same-stance paraphrase = *match*,
stance-flipped rewrite = *distractor*); a system is correct on a triplet when it
attaches the match to the anchor's claim and does NOT attach the distractor.

The harness imports the **real production functions** (`classifyAgainstClaims`,
`generateClaim`, `orderClaimsForClassification` from
`functions/src/services/claim-registry-service.ts`) — nothing is reimplemented.

## Conditions

| Cond. | What | Runner |
|---|---|---|
| A | Cosine baseline, `text-embedding-3-small`, raw + production ctx format, pipeline thresholds 0.60/0.85 | `run-cosine-baseline.ts` |
| A2 | Embedding gate (0.45 / 0.60) + LLM judge — the RAG-style architecture; derived from B1 + A, no extra calls | `analyze.ts` |
| B1 | Registry classifier, single-claim codebook, claim = raw anchor, gpt-4o-mini | `run-registry-single.ts` |
| B2 | B1 with `generateClaim` canonicalization (production-faithful claim text) | `run-registry-single.ts --generated-claims` |
| C | Full per-dataset codebook (up to 100 claims), production ordering with real cosine evidence | `run-registry-codebook.ts` |
| D | B1 on gpt-4o (the production audit model) | `run-registry-single.ts --model gpt-4o` |

## Running

Requires `OPENAI_API_KEY` in `functions/.env` (loaded automatically). All
runners are resumable — results append to `results/*.jsonl` keyed by triplet id;
re-running skips completed ids.

```bash
cd scientific-research/20206-07-16-Claim-regestry/benchmark

npx tsx make-pilot-sample.ts                 # fixed 150-triplet stratified pilot
npx tsx run-cosine-baseline.ts --sample results/pilot-ids.json
npx tsx run-registry-single.ts --sample results/pilot-ids.json
npx tsx analyze.ts                           # → RESULTS.md

# full run (875)
npx tsx run-cosine-baseline.ts
npx tsx run-registry-single.ts
npx tsx run-registry-single.ts --generated-claims
npx tsx run-registry-single.ts --model gpt-4o
npx tsx run-registry-codebook.ts
npx tsx analyze.ts
```

Dev set (`--file dev`, 100 triplets, separate id namespace `dev:*`) exists for
harness debugging; headline numbers come from the 875-triplet main file.

## Outputs

- `results/*.jsonl` — raw per-triplet decisions (append-only, resumable)
- `RESULTS.md` — metric tables (Wilson 95% CIs, McNemar tests, per-dataset)
- `../TEST_REPORT.md` — the scientific write-up
