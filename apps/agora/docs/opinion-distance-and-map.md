# User-to-User Opinion Distance & the 2D Opinion Map

How to compute the distance between every pair of users based on their statement
evaluations — without quadratic blowup — and how to draw the result as a 2D map.

A runnable demo lives next to this doc: [`scripts/opinion_map_demo.py`](./scripts/opinion_map_demo.py)
(numpy only; emits an HTML/SVG map, printable to PDF via headless Chrome).

---

## 1. The distance metric

Evaluations live in `[-1, +1]`. For two users `a`, `b`:

```
d(a, b) = mean( |eₐ(s) − e_b(s)| )   over statements s BOTH users evaluated
```

- Range is `[0, 2]`: `0` = identical evaluations, `2` = maximally opposed
  (one always `+1`, the other always `−1`) — exactly the intuition that
  motivated the metric.
- Averaging (not summing) over shared statements keeps the range stable
  regardless of how many statements a pair shares.
- **Minimum-overlap rule:** require ≥ ~5 shared statements before showing a
  distance. With 1–2 shared statements the number is noise.

## 2. The scaling problem — and why it isn't exponential

Naive recomputation is `O(U² × S)` (users² × statements) — quadratic, not
exponential, but still a Firestore-cost disaster if recomputed on every write.
The fix depends on what the feature actually needs. Three tiers, cheapest first:

### Tier 1 — "How far is user A from everyone?" → O(1) per read

Most features don't need the full pairwise matrix; they need each user's
average distance to the crowd. That has a closed form using only per-statement
running aggregates (Freedi statements already carry `sumEvaluations` and
`numberOfEvaluators`; add `sumSquares`):

For **squared** distance, the average over all other users b on statement s is
pure algebra:

```
avgSqDist(a, s) = eₐ² − 2·eₐ·mean(s) + meanOfSquares(s)   (+ small self-correction)
```

No pair is ever enumerated or stored. Scales to millions of users.

For the **|a − b| (L1)** metric: evaluations are discrete in `[-1, 1]`, so keep
a small histogram per statement (~20 bucket counts + bucket sums). Then
`Σ_b |eₐ − e_b|` is an O(20) walk over the buckets — constant time, exact for
discrete values.

**Bonus identity (bridging/polarization):** the mean pairwise squared
difference on a statement equals `2 × variance` of its evaluations —
computable from `count / sum / sumSquares` in O(1). This is the identity behind
Blair et al., *The Structure of Bridging* (the anchor of `docs/WHY_FREEDI.md`):
variance *is* pairwise disagreement. Group-level polarization needs no
pairwise work at all.

### Tier 2 — Full pairwise matrix, maintained incrementally

Only if a feature must *display* specific user-to-user distances:

- One pair doc keyed by the sorted uid pair: `{ sumAbsDiff, sharedCount }`.
  Distance = `sumAbsDiff / sharedCount` ∈ [0, 2].
- A Cloud Function trigger on evaluation write (old → new) for statement s
  queries the co-evaluators of s and applies, per co-evaluator b:
  `delta = |new − e_b| − |old − e_b|`.
- Cost per write = k (evaluators of *that statement*), not U². Storage is
  bounded by pairs that actually share a statement.
- **Failure mode:** a statement with thousands of evaluators makes k (and k²
  total pairs) painful. That is the signal to move to Tier 3.

### Tier 3 — Embeddings (the Pol.is approach) for clustering / maps

Treat each user as a sparse vector of evaluations. A periodic offline job runs
PCA/SVD down to 2–10 dimensions and stores one small vector per user. Any
pairwise distance is then an O(d) dot product computed on demand — the full
matrix is never materialized. Handles the "users rarely evaluate the same
statements" problem better than raw overlap does.

**Recommended rollout:** start with Tier 1 (`sumSquares` + histogram on the
existing evaluation-trigger aggregates — tiny change, immediate per-user
scores + polarization for free). Build Tier 2 only for a concrete
pair-display feature. Use Tier 3 when you want clusters or the map below.

---

## 3. Drawing the 2D opinion map (MDS)

Given the pairwise distance matrix, **classical MDS (multidimensional
scaling)** finds 2D positions whose straight-line distances best reproduce it.
Same family of math as Pol.is opinion maps.

**Algorithm (Torgerson):**

```
D²  = element-wise squared distance matrix
J   = I − (1/n)·𝟙𝟙ᵀ                 (centering matrix)
B   = −½ · J · D² · J               (double-centered Gram matrix)
X   = top-2 eigenvectors of B, each scaled by √eigenvalue
```

`X` is n×2 — the dot positions. See the demo script for a ~10-line numpy
implementation.

### What X and Y mean

**They are not predefined variables — the algorithm invents them.** Each axis
is a weighted combination ("quiz score") over all statements:

1. **X**: find statement weights **w** maximizing the variance of
   `xₐ = w·eₐ` across users → the single score that spreads people out the
   most. In practice: the main split on the question.
2. **Residual**: `rₐ = eₐ − xₐ·w` — what X can't explain about user a.
3. **Y**: repeat on the residuals → the highest-variance score *uncorrelated
   with X* (automatically orthogonal). The second-biggest independent
   disagreement.
4. Reconstruction: `eₐ ≈ xₐ·w + yₐ·v`.

**Toy example** — 4 users, 2 statements about taxes (s1, s2), 2 about climate
(s3, s4), tax stance independent of climate stance:

| user | s1 | s2 | s3 | s4 |
|---|---|---|---|---|
| Dana | +1 | +1 | +1 | +1 |
| Eli  | +1 | +1 | −1 | −1 |
| Noa  | −1 | −1 | +1 | +1 |
| Omer | −1 | −1 | −1 | −1 |

Pairwise distances: Dana–Eli = 1, Dana–Noa = 1, Dana–Omer = 2, Eli–Noa = 2,
Eli–Omer = 1, Noa–Omer = 1. These four users **cannot be placed on one line**
(Omer would need to be distance 2 from Dana while distance 1 from both Eli and
Noa — impossible in 1D). In 2D they form a square: X = tax score
(w ≈ (0.7, 0.7, 0, 0)), Y = climate score (v ≈ (0, 0, 0.7, 0.7)).

The map needs **one axis per independent way people disagree**. Every
statement feeds *some* weight into *every* axis (real weight vectors are
blends, not 0/1 partitions); a hypothetical third independent theme (s5, s6)
would need a Z axis and gets flattened — that loss is what the fidelity
numbers below measure.

### Honesty requirements for a shipped map

- **Fidelity metrics — always compute and show them:**
  - `r` = Pearson correlation between true and drawn distances
  - `stress = √( Σ(d − d̂)² / Σd² )` (Kruskal stress-1)
  - variance carried by 2 axes = `(λ₁+λ₂)/Σλᵢ`
  - If r < ~0.8 the map is misleading — warn in the UI or don't show it.
- **Axes are unitless; origin/rotation/flip are arbitrary.** Never label
  directions with fixed meaning. Use a **scale bar** ("distance = 0.5")
  instead of axis ticks. UI framing: "closeness = similarity of evaluations."
- **Equal scale on both axes** when rendering — it's a distance map, not a
  chart with independent axes.
- **Stability over time:** adding users can reorient the axes, moving dots for
  users who changed nothing. Procrustes-align each new projection to the
  previous one (rotate/flip/shift only) to keep the map stable.
- **Post-hoc axis labeling (optional, Pol.is-style):** correlate each axis
  with the statements ("this side tended to agree with statement 12") to turn
  abstract axes into readable ones.

### Production scaling

Classical MDS is O(U³) (eigendecomposition) — fine to a few thousand users.
Beyond that: **landmark MDS**, or better, skip the pairwise matrix entirely
and run PCA on the raw user×evaluation matrix (Tier 3) — nearly the same map,
and exact pairwise distances are computed lazily only for pairs actually
displayed.

### Demo results (60 simulated users, 40 statements, 3 opinion camps)

The demo plants two opposed camps plus a bridging group (agrees with camp A on
some statements, camp B on others, consistently among themselves). MDS
recovers the structure: camps at opposite ends, bridging group lifted *off*
the A–B line — because their shared pattern is uncorrelated with the A–B axis
(that's Y doing its job). Fidelity: r = 0.97, stress = 0.15, 2 axes carry 66%
of structure.

Run it:

```bash
python3 scripts/opinion_map_demo.py   # writes opinion_map.html next to itself
# optional PDF:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --no-pdf-header-footer --print-to-pdf=opinion_map.pdf "file://$PWD/opinion_map.html"
```
