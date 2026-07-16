# The Claim Registry: Canonical Labeling as an Oracle-Complete Layer for Semantic Equivalence Detection in Deliberation

*Scientific description of the mechanism. Engineering counterpart:
`docs/architecture/CLAIM_REGISTRY.md`. Companion to
`clustering-and-synthesis-paper.md` (cosine-banded synthesis pipeline).*

---

## Abstract

Deliberation platforms must detect when two participant statements express the
same proposal despite arbitrary differences in wording. The standard
architecture — dense-embedding retrieval for candidate generation followed by
an LLM equivalence judge — is *precision-complete but recall-incomplete*: the
judge is only consulted on pairs the embedding geometry surfaces, so
equivalent statements that embed far apart are silently never compared. We
describe a mechanism, the **claim registry**, that restores recall
completeness by exploiting a property peculiar to deliberation corpora: the
number of *distinct proposals* per question grows sublinearly in the number of
statements and remains small in absolute terms. This permits an exhaustive
classification step — a single LLM call whose context contains the *entire*
codebook of canonical claims — making equivalence detection independent of
embedding geometry. The same structure resolves the cold-start failure of
online greedy clustering and yields, as a byproduct, a continuously growing
labeled dataset that quantifies the very recall gap it closes.

---

## 1. Problem Statement

### 1.1 Setting and notation

Let a deliberation question $q$ accumulate a stream of statements
$s_1, s_2, \dots, s_N$ (natural-language proposals, arriving online, in
multiple languages). Define the latent relation $a \equiv b$ ("$a$ and $b$
express the same proposal") as **bidirectional entailment at the level of the
proposed action**: $a \equiv b$ iff a cooperative author of $a$ would accept
$b$ as a statement of their idea and vice versa. $\equiv$ is (approximately)
an equivalence relation; the platform's task is to maintain the partition
$S/\equiv$ online — its equivalence classes are the "clusters" shown to
participants.

The production system approximates this with:

- an embedding $\varphi : S \to \mathbb{R}^{1536}$
  (`text-embedding-3-small`, applied to an LLM-distilled 5–15-word *brief* of
  each statement, with question-context prefixing);
- a retrieval operator $R_\tau(s) = \{\,t : \cos(\varphi(s),\varphi(t)) \ge
  \tau\,\}$ truncated to top-$k$ ($k=10$, $\tau = 0.45$);
- an LLM judge $J(a,b) \in \{\text{same, related, different, opposite}\}$,
  consulted only on pairs surfaced by $R_\tau$.

### 1.2 The recall gap (Procaccia's critique)

The judge $J$ has high accuracy on the pairs it sees; the failure mode lives
entirely in **candidate generation**. Embeddings guarantee neither direction
of the desired equivalence:

- **False positives** (semantically close, different meaning — negations,
  magnitude flips) are *caught*, because the pair is surfaced and $J$
  rejects it.
- **False negatives** (same meaning, lexically and structurally disjoint) are
  *silent*: if $\cos(\varphi(a), \varphi(b)) < \tau$, the pair is never
  presented to $J$, and no component of the system is aware a decision was
  skipped.

Formally, the system computes the partition induced by the restriction of $J$
to the graph $G_\tau = (S, \{(a,b) : b \in R_\tau(a)\})$. Its recall is
bounded above by the probability that an $\equiv$-pair is an edge of
$G_\tau$ — a property of the embedding geometry, not of the judge. No
threshold choice repairs this: lowering $\tau$ toward 0 restores edges at the
cost of $O(N^2)$ judge invocations on overwhelmingly negative pairs.

### 1.3 The cold-start problem

The online pipeline makes greedy, order-sensitive attach/spawn decisions
using cosine thresholds ($0.85 / 0.78 / 0.60 / 0.45$) that are *decision
boundaries calibrated to the similarity distribution of mature corpora*
(within-class pairs at $0.86$–$0.95$, cross-class same-topic at
$0.65$–$0.84$). Early in a question's life these distributions do not yet
exist: with $|S| \approx 5$, sample cosines carry almost no information about
class structure, cluster representatives (medoids of 2) are noise, and early
mistakes propagate through a rich-get-richer dynamic. Historically, quality
arrived only after an expensive offline re-clustering pass (complete-linkage /
UMAP+DBSCAN over the full corpus).

---

## 2. The Mechanism

### 2.1 Key empirical premise: bounded codebooks

Deliberation questions exhibit **proposal saturation**: while statements
accumulate linearly, *distinct* proposals accumulate sublinearly and plateau —
a question with hundreds of statements typically sustains tens of
equivalence classes (compare species-accumulation / Heaps'-law behavior).
Each class is representable by a **canonical claim** $c_i$: a 5–15-word
neutral statement of its core proposal. The codebook
$C_q = \{c_1, \dots, c_K\}$ therefore fits comfortably inside a single LLM
context ($K \cdot 15$ words; even $K = 500$ is $\sim$5k tokens).

This is the structural difference from web-scale retrieval, where exhaustive
comparison is impossible and approximate nearest-neighbor search is forced.
Here, **exhaustive comparison against class representatives is cheap** — the
system simply was not exploiting it.

### 2.2 Classification, not generation

A naive canonicalization — map each statement independently to a "simple
meaning" sentence $g(s)$ and compare canonical forms — fails on stability
grounds: $g$ is a stochastic map, and $a \equiv b$ does not imply
$g(a) = g(b)$; the equivalence problem recurs one level up, between canonical
forms. The registry instead casts canonicalization as **classification into a
shared, growing label set**:

$$
\rho(s, C_q) \in \{(\textsf{expresses}, c_i),\ (\textsf{opposes}, c_i),\ \textsf{new}\}
$$

implemented as one `gpt-4o-mini` call (temperature 0, JSON output) whose
prompt contains the statement, the question, and the *entire* codebook.
Properties:

1. **Geometry-independence (recall).** Because every class representative is
   in-context, the probability that an $\equiv$-pair is never compared is 0
   at the class level. Recall now depends on the LLM's judgment of meaning —
   the quantity $J$ was already trusted for — rather than on
   $\cos \circ\, \varphi$.
2. **Convergence (stability).** Classification against a fixed set is a
   decision problem; labels only *grow* when the classifier answers
   `new`. Assignments are therefore consistent by construction: two
   equivalent statements are compared against the same codebook, not against
   two independent generations.
3. **Directionality guard — and a byproduct edge.** The three-way output
   separates *expresses* from *opposes* (contradiction of the same
   proposition), inheriting the `same/related/different/opposite` taxonomy of
   the pairwise judge; an opposing statement is never attached to the claim it
   contradicts. The verdict is not discarded: a confident *opposes* is
   persisted as a first-class statement→claim edge (the option records the
   claim it contradicts; the claim accumulates its counter-statements). The
   relation "$s$ contradicts $c_i$" is precisely the pro/con structure the
   synthesis layer needs to present a proposal together with its
   counter-positions — information the classifier computes anyway.
4. **Cost structure.** The fast path is unchanged: cosine attach passes
   (zero LLM calls) still resolve the typical high-similarity arrival. The
   registry call fires only when geometry fails — by construction, the
   minority of arrivals in mature questions. Amortized cost is $\le 1$
   small-model call per statement (~\$1–2 per 1,000 statements). A
   confidence floor ($0.6$) plus a "when in doubt, answer new" prompt prior
   biases the classifier toward precision; its false negatives degrade to the
   status quo ante rather than below it.

Two implementation details matter for oracle quality. First, **prompt order**:
LLMs exhibit position bias in long in-context lists (mid-list entries are
under-matched), so the codebook is presented most-plausible-first — ranked by
cosine evidence where geometry produced any, then by class size. This demotes
the embedding from *gatekeeper* (where it fails) to *ranker* (where it is
adequate), while the oracle retains the decision. Second, **codebook
language**: canonical claims are generated in the *question's* language
regardless of the arriving statement's language, so a multilingual corpus
yields a uniform codebook rather than one whose per-claim language is an
accident of who spoke first.

Viewed abstractly, this is **online exemplar-based clustering with a
linguistic oracle**: claims play the role of prototypes, but prototype
comparison happens in language space (entailment) rather than vector space
(distance), and the oracle sees all prototypes simultaneously. The codebook is
the vector-quantization analogy made discrete and human-readable — and the
human-readability is itself load-bearing (§2.4).

### 2.3 Cold start: calibration-free judgments plus cheap regret

Two properties fix the cold-start failure:

1. **The oracle needs no density prior.** Deciding "does $s_2$ express
   $c_1$?" is as reliable with 2 statements as with 2,000 — unlike cosine
   thresholds, which are meaningless until the similarity distribution has
   mass. In young questions the cosine passes rarely fire (few clusters,
   sparse geometry), so the registry is *naturally* the primary mechanism —
   no explicit mode switch is required.
2. **Claim-per-statement with a lifecycle.** Every unmatched arrival
   immediately spawns a single-member cluster with a *provisional* claim
   (generated once, together with a 1–2-sentence public explanation), so the
   visible partition exists from $s_1$. Provisional claims are cheap to merge;
   claims are promoted to *confirmed* only after reaching $\ge 3$ members and
   surviving a consolidation pass — an explicit uncertainty annotation on
   early structure.

Greedy online clustering still makes early mistakes; the design goal is not
to avoid them but to make their **regret cheap to repay** (§3).

### 2.4 The public-explanation byproduct

Because class representatives are natural-language claims rather than
centroids, each cluster carries a citizen-facing plain-language explanation
from the moment it exists. The representation chosen for algorithmic reasons
(exhaustive in-context comparison) is *the same representation* the product
needs for legibility — the mechanism and the interface share one artifact.

---

## 3. Consolidation: Re-clustering on the Quotient

Offline re-clustering is expensive because it operates on statements:
$O(N^2)$ similarity computations and up to thousands of judge calls. The
registry substitutes the **quotient structure**: consolidation reads the $K$
claims (not the $N$ statements) and, in a single LLM call, proposes
merge/too-broad verdicts over the codebook.

The efficiency rests on the (approximate) **transitivity of expression**: if
statement $a$ expresses claim $x$, and $x \equiv y$, then $a$ expresses $y$.
Hence a merge transfers membership *wholesale* — no per-statement
re-judgment. The only operation requiring member-level work is a **split**
(a claim judged too broad), and even that is bounded: members are
re-classified only against the 2–3 daughter claims. (In the current
implementation, splits are routed to human review rather than automated: a
bad merge is recoverable by a later split, whereas a bad split scatters an
equivalence class — the asymmetry justifies asymmetric automation.)

Because a pass is one cheap call, consolidation runs *continuously* (every
~15 processed statements) instead of rarely. The online partition therefore
converges toward the offline-quality partition without a batch phase:
early-greedy errors are corrected within one or two intervals of their
commission. Each cluster may participate in at most one merge per pass, so
chained merges settle across successive passes rather than racing within one
— a deliberate fixed-point iteration rather than a one-shot solver.

---

## 4. The Mutation Protocol: Versioned Claims

Cluster representatives are not static: synthesis regenerates a cluster's
title as members accrue, which mutates its claim. The protocol treats claims
as **versioned anchors** and asks, on any text change $c \to c'$, *how the
meaning moved* — one LLM call classifying the change into:

| Change | Semantic content | Member consequence |
|---|---|---|
| reword | $c \equiv c'$ | none (version bump) |
| broaden | $c \models c'$ (old entails new) | none — each member expressed $c$, hence a special case of $c'$ |
| narrow | $c' \models c$ strictly | re-validate |
| different | neither entailment | re-validate |

The broaden row carries a hidden ratchet: each broaden is individually safe
($c \models c'$ preserves membership), but broadens **compose** — a chain
$c_1 \models c_2 \models \dots \models c_n$ of small generalizations can move
the meaning arbitrarily far with zero member checks, because each step is
locally exempt from re-validation. The protocol therefore maintains an
**anchor**: the last wording the members were actually validated against.
After $M$ consecutive unchecked broadens ($M = 2$), the new wording is
classified against the anchor *directly*; if the anchor still entails it, the
chain is re-established end-to-end and the counter resets, otherwise the
accumulated drift is treated as narrow/different and members are re-validated
(after which the anchor moves to the new text). This bounds unchecked
composition without touching the common case.

Re-validation is **one batched call per cluster**, not one per member: the
prompt contains $c'$ and every member's brief, and returns the surviving
subset. Members that no longer express the claim are detached and re-enter
the arrival pipeline unchanged ("auto-reprocess") — they re-classify against
the codebook or spawn new provisional claims. The statement→claim edge
records the claim version at attach time, so the system always knows which
wording each membership was validated against.

The failure-direction conventions are chosen per operation: change
classification **fails closed** (unparseable → `different` → forces
re-validation), while re-validation **fails open** (LLM outage keeps all
members) — the invariant being that an infrastructure failure may delay
cleanup but must never scatter an equivalence class.

---

## 5. Measurement: The Mechanism Audits Itself

Every registry decision is logged as
$(s, \hat{c}, \text{relation}, \text{confidence}, \cos_{\text{at-match}})$ —
and **persisted** (a per-question decision collection), since calibration and
error estimation need the accumulated set, not ephemeral log lines. A match
whose recorded cosine is low (or absent — the zero-candidate path) is
*precisely* an instance of the recall gap of §1.2, now observed rather than
silent. The log therefore yields:

1. a running **estimate of the false-negative rate** of embedding-only
   retrieval on this exact corpus (the empirical question underlying the
   original critique), and
2. a growing set of **labeled positive pairs at low cosine** — exactly the
   contrastive training data (anchor, hard positive) required if one later
   chooses the "permanent fix" of fine-tuning the embedding space
   (multiple-negatives-ranking or triplet objectives). The cheap mechanism
   bootstraps the expensive one.

The registry's *own* errors are measured symmetrically, closing what would
otherwise be the §1.2 blind spot recurring one level up:

- **False-`new` rate.** When the classifier wrongly answers `new`, two claims
  come to exist for one proposal — and every consolidation **merge is an
  observed instance** of exactly that error. Cumulative merge counters per
  question therefore estimate the classifier's recall error from data the
  system already produces.
- **Single-model bias.** A small sample (~5%) of classifications is re-run on
  a stronger model from a different tier, detached from the decision path;
  persisted (dis)agreement bounds family-systematic error without adding
  latency or changing any primary decision.
- **Confidence calibration.** Self-reported LLM confidence is not trustworthy
  a priori; the persisted (confidence, outcome) pairs are the dataset from
  which the confidence floor (currently $0.6$, a placeholder) is to be set
  empirically.

---

## 6. Limitations and Failure Analysis

- **Oracle error.** The LLM classifier can attach wrongly (precision) or
  miss (recall). Precision is defended by the conservative prompt prior, the
  confidence floor, and the opposes-guard; recall failures degrade to the
  pre-registry status quo, never below it — and are additionally *observed*
  post hoc as consolidation merges (§5). Single-model systematic bias is
  bounded by the sampled second-model audit (§5); residual shared-family bias
  remains, and the persisted decision log supports later human audit.
- **Prompt growth.** The classification prompt is linear in $K$. Proposal
  saturation keeps $K$ small in practice, and the existing
  synth/topic-cluster hierarchy supports two-stage classification
  (topic first, then claims within topic) should a question exceed
  $K \sim 10^3$.
- **Transitivity is approximate.** $\equiv$ drifts at class boundaries;
  chained merges can accrete non-equivalent members. Mitigations: one merge
  per cluster per pass, conservative merge prompt, too-broad flagging, the
  mutation protocol's re-validation whenever a representative's meaning
  moves, and the broaden-ratchet anchor (§4) bounding unchecked chains of
  generalization.
- **Order effects remain, damped.** The first phrasing to arrive seeds the
  claim's wording and thus anchors subsequent classification. Consolidation
  and title regeneration erode, but do not eliminate, founder effects; pinning
  the claim language to the question's language removes the *language*
  component of the founder effect, not the framing component.
- **Latency-sensitive paths are excluded by design.** The interactive
  find-similar flow (user mid-submission) receives a cheaper recall aid —
  query paraphrase expansion with max-similarity pooling — because a
  codebook call there would sit on the critical UX path.

---

## 7. Relation to Alternatives

Fine-tuning the embedding (contrastive learning) attacks the geometry
itself and is the only alternative that also closes the gap, at the cost of
leaving managed embeddings, re-embedding the corpus, and requiring labeled
in-domain pairs — which the registry generates as exhaust (§5). Late-
interaction models (ColBERT-style) and lexical hybrids (BM25 + RRF) address
the *shared-vocabulary* regime and are structurally unable to help in the
*disjoint-vocabulary, same-meaning* regime at issue. Knowledge-graph
approaches are the registry's heavyweight generalization; at per-question
scale the codebook **is** the minimal viable knowledge structure, maintained
by the same call that consumes it.

The registry's essential observation is not algorithmic novelty but a
*regime identification*: deliberation corpora are small enough per question
that the retrieval approximation forced on web-scale systems is unnecessary
for the equivalence decision — retrieval can be kept for speed while an
exhaustive linguistic oracle provides truth.
