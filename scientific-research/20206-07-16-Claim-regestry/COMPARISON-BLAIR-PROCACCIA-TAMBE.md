# Our engine vs. "Embeddings for Preferences, Not Semantics"

**Paper:** Carter Blair, Ariel D. Procaccia, Milind Tambe (Harvard). *Embeddings for Preferences, Not Semantics.*
**Ours:** Claim registry / tiered ELJ, `SIMULATED-ENGINE.md` §7, condition E.
**Date:** 2026-07-24

The paper is the *source of our benchmark data* — the 875 hard triplets in
`Proccacia-dataset/hard_eval_triplets_1k.jsonl` are theirs. So this is not two
methods measured on different problems: it is two different layers of attack on
one problem, evaluated on the same instances.

---

## 1. Same diagnosis, arrived at independently

| | their finding | our measurement |
|---|---|---|
| cosine can't see stance | base encoders 6.3–48.3% on hard triplets (near chance for ST5-XL at 48.3) | `text-embedding-3-small` = **0.5%** triplet accuracy |
| distractors beat matches | "these three encoders rank the semantic distractor above the preference match 70–95% of the time" | distractors outrank matches in **863/880** cases (98.1%) |
| the signal on natural data is a mirage | 50pp drop from natural (57.8–65.2%) to hard (6.3–48.3%) | 99.1% of opposite-meaning distractors score ≥ 0.85 cosine |

Their §4.1 supplies the *theory* for what our benchmark found empirically. They
decompose the cosine margin into a **preference** component Δ_S (in the
stance-relevant subspace) and a **nuisance** component Δ_T (wording, style,
topic). Cosine weights both equally. On natural deliberation data the two
correlate — people who share a stance also share vocabulary — so cosine looks
preference-aware. Hard triplets break the correlation on purpose, and cosine
collapses.

That is a precise explanation of our observation that "0.85 is safe as a fetch
floor and catastrophic as a decision threshold": the 0.85 is mostly Δ_T.

---

## 2. Where the two methods intervene

```
 statement pair
      │
      ├─ EMBED ──────────────► [ THEIR FIX: change the geometry ]
      │                          DPT fine-tune, or per-topic rank-20 projection
      │                          → cosine itself becomes preference-aware
      │
      └─ DECIDE ─────────────► [ OUR FIX: don't let geometry decide ]
                                 cosine only RANKS candidates;
                                 an LLM judge returns expresses/opposes/none
```

**They repair the metric. We refuse to use the metric as a decision rule.**

Both accept the same premise — off-the-shelf cosine is not trustworthy for
stance — and then diverge completely on the remedy.

---

## 3. Results — and why the numbers are NOT directly comparable

| system | task | score |
|---|---|---|
| base ST5-XL (paper) | rank: is cos(a,match) > cos(a,distractor)? | 48.3% |
| base BGE-large / mpnet (paper) | same | 6.3% / 8.2% |
| our `text-embedding-3-small` | same | 0.5% |
| **DPT-tuned ST5-XL (paper §5)** | same | **80.0%** |
| **per-topic projection (paper §7)** | same | **81.1%** |
| **our LLM judge, 1-claim codebook (B1)** | decide: attach match AND reject distractor | **95.0%** |
| our full engine, corpus replay (condition E + guard) | file into the right synth among ~20 live rivals | 82.0% |

**Read the middle column before the numbers.** Their triplet accuracy is a
*ranking* metric on an isolated pair: it only asks whether one similarity
exceeds another. Ours is a *decision* metric with a threshold — the match must
clear confidence ≥ 0.6 to attach AND the distractor must fail to. A ranking
metric is strictly easier: a system can rank correctly while attaching both, or
neither.

So "95.0% vs 81.1%" understates the gap in one sense (harder metric) and
overstates it in another (see §6 caveat). The honest claim is narrower: **on
these instances an LLM judge decides stance far more reliably than any
embedding geometry tested, tuned or not.**

---

## 4. The trade-off that actually decides which to use

| | paper (DPT / projection) | ours (ELJ) |
|---|---|---|
| cost at inference | **a dot product** — microseconds, ~free | 2–3 LLM calls/statement, ~$0.2–0.5 per 1k |
| latency | negligible | 1–2 s per statement |
| scale ceiling | millions of pairs (they score 1.46M) | thousands of statements |
| training data | synthetic hard triplets (DPT), or **per-topic votes** (projection) | **none** |
| cold start | projection needs ~50 labelled triplets *for that topic* | works from statement #1 |
| output | a continuous metric space | a discrete claim structure + counter-edges |
| enables | facility location, k-median, proportional/fair representation, ideal points, utilities for unvoted statements | dedup, canonical claims, pro/con structure, synthesis |
| interpretability | a number | a verdict with a stated reason |

This is the crux: **their method scales and ours explains.** Scoring 1.46M
pairwise preferences the way we do is financially absurd; producing a labelled,
auditable pro/con claim structure the way they do is impossible — a projection
returns a distance, never "this opposes that, because …".

Also note the cold-start asymmetry, which matters for Freedi specifically: the
per-topic projection is their *best* result (81.1%) but needs participant votes
**on that topic**. A new question has none. That is exactly the cold-start gap
the claim registry was built to close.

---

## 5. Complementary, not competing — the hybrid worth building

Our §7 design already says *"use the embedding as a ranker, not a filter."* The
paper's contribution is precisely a better ranker.

The concrete opening: our biggest structural risk was **top-K crowding** — with
distractors outranking matches 863/880 of the time, a cosine-ordered candidate
list is opposites-first, and the true match can be pushed out of the window
before the judge ever sees it. **That is the exact failure DPT fixes.** Swapping
`text-embedding-3-small` for a DPT-tuned encoder in the retrieval layer should:

- put the true match near rank 1 instead of buried under stance-flips,
- allow shorter candidate lists → fewer judge tokens → cheaper,
- shrink the residual recall loss that cosine ranking causes.

And the reverse direction: their projection needs per-topic supervision. A claim
registry produces exactly that — "these statements are the same claim" is a
stronger, cheaper label for the stance axis than raw votes, and it accumulates
automatically as the deliberation runs. **Registry output could bootstrap the
projection that then makes the registry cheaper.**

Proposed division of labour:

```
DPT / projected embedding   →  retrieval + ranking  (fast, scales, no LLM)
LLM judge (ELJ)             →  the attach decision  (accurate, explainable)
claim registry              →  supervision back to the projection
```

---

## 6. Caveat that cuts against US

The hard triplets were generated by **GPT-4o rewriting anchors** to be
surface-similar and stance-flipped. They were engineered to defeat *embeddings* —
maximum lexical overlap, minimal stance overlap. Nothing in their construction
was designed to defeat an LLM reading the text.

So our 95% is measured against an adversary purpose-built for the opponent we
replaced. An attack designed against an LLM judge — subtle scope shifts,
conditional hedges, negation buried in a subordinate clause, sarcasm — might
score far worse. The paper's method has no such asymmetry: its adversary and its
solution live in the same representation.

Before treating 95% as the judge's true ceiling, we would need distractors
generated adversarially *against the judge*, not against cosine.

## 7. Caveat that cuts against THEM (for our use case)

Their metric answers "would this participant endorse this statement?" Ours
answers "is this the same claim?" These are different questions, and the paper
is explicit that its geometry is "an empirical and imperfect representation of
preferences… should not be used as a basis for binding decisions."

For Freedi's synthesis pipeline the question genuinely is claim identity —
merging duplicates, building pro/con structure, writing canonical claims. A
preference geometry does not answer it, however well-tuned. Their own §8 frames
the target applications as *grouping participants, selecting slates, fair
representation* — social choice, not deduplication.

---

## 8. One-line summary

They make the ruler honest; we stop measuring and ask a reader. On stance
decisions the reader wins by a wide margin (95% vs 81%) at ~10⁴× the cost per
comparison — so the right architecture is almost certainly **their ruler
choosing what the reader looks at.**
