# Offline geometry analysis

Every gate constant in the synthesis pipeline that is justified by a measured
number was measured by one of these scripts. They read the pre-flight embedding
cache (`scripts/.cache/preflight-embeddings.jsonl`) and the frozen corpora, so
they need **no emulator and no Firestore** — only `OPENAI_API_KEY` in
`functions/.env` for the two that embed with a different model.

Run from anywhere; paths are absolute to the repo.

```bash
node scientific-research/2026-08-18-live-synth-accuracy/analysis/<script>.mjs [corpus.json]
```

| script | question it answers | where the answer landed |
| --- | --- | --- |
| `centroidGate.mjs` | Can a centroid separate on-theme from off-theme where a pairwise max cannot? | `clusterCohesion.ts` — the topic gate's centroid floor at `synthLowerBound`. Measured: cut 0.773–0.816 across cluster sizes, F1 up to 0.877 (P 0.943) where the max-based gate admitted 80% of cross-topic pairs. |
| `synthAttachGate.mjs` | Where should the synth-attach cohesion floor sit? | `synthCentroidFloor()` — halfway up the synth band. Measured over 4900 false candidates: floor 0.78 admits 63, floor 0.82 admits 9 with all 50 genuine attaches kept, floor 0.85 admits 0 but loses 5. |
| `themeAssign.mjs` | How separable are the 10 themes, given perfect syntheses? | Established that the greedy pairwise ceiling is F1 0.480 while the pipeline already reached 0.434 — i.e. threshold tuning on the topic layer was exhausted. |
| `themeCeiling.mjs` | Would a global sweep, or a better embedding model, fix theming? | **No to both.** Global agglomerative to the true k=10 scores 0.432 — *below* greedy attach; `3-large` buys ~0.05. This is why theme placement became an LLM judgement (`nestSynthesis.ts`). Embeds with `text-embedding-3-large` into its own cache file — never into the shared pre-flight cache, whose keys do not include the model. |
| `heSynth.mjs` | Is Hebrew's synth layer fixable by changing model? | **Yes.** Twin within `NEIGHBOR_LIMIT` 79/100 → **99/100**, nearest-neighbour 56 → 89, cross-pair median 0.781 → 0.702. The basis for the still-undecided `3-large` migration. |
| `rejudge.mjs` | Does the cross-synth merge gate's 0.82 threshold admit distinct same-topic synths? | **Yes — seven pairs at 0.823–0.855**, including the two that were the only false merges in a certified run. No threshold separates them from true duplicates (0.80–0.84), which is why that decision moved to the LLM in `fn_synthesisReJudge.ts`. |
| `themeConsolidation.mjs` | Why does theme consolidation stop while redundant headings remain — the merge cap, or the judge? | **The judge, and only because of what it could see.** The cap (8) was never reached: sweeps were offered 1–3 groups. Replaying the real judge on all three certified runs' final theme sets, showing it the proposals under each heading beat headings-alone on every seed (seed 1234: 17→10.5 vs 17→12.5, all 10 topics still represented, no extra false merges). Also measured that looping to a fixpoint *adds* false merges, which is what motivated the judge-once fingerprint in `consolidateThemes.ts`. Unlike the others this reads run artifacts rather than the embedding cache, and calls the fast model. |

Note the study root also holds `textFidelity.mjs` — the only scorer that reads
the *text* a synthesis publishes rather than its membership. It needs a run
folder, not the embedding cache, and `textFidelity.selftest.mjs` must pass
before its numbers mean anything.

## Caveat that applies to all of them

They measure ONE corpus: a single civic question, English or its sentence-by-sentence
Hebrew translation, exactly two paraphrases per idea, no off-topic or adversarial
submissions. Every constant they justify is therefore calibrated against a clean
single-question geometry. Re-run them against a real question's embeddings before
trusting any of these numbers in a different setting.
