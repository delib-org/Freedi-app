# Why Freedi? How It Compares to Other Deliberation Platforms

Freedi is built for one job: **helping large audiences — including audiences split into factions — deliberate and actually reach decisions together.**

Many excellent tools exist in the civic-tech and deliberation space. Most of them do one part of the job well: listening at scale, mapping arguments, or running a vote. Freedi's distinctive claim is that it covers the **whole arc** — from open ideation, through consensus-seeking evaluation, to a concrete decision and even a signed document — with an aggregation algorithm that structurally favors proposals that bridge factions.

This page explains the design commitments behind that claim, and compares Freedi honestly to the best-known alternatives.

---

## Table of Contents

- [The Four Design Commitments](#the-four-design-commitments)
- [Deliberating with Factions](#deliberating-with-factions)
- [What the Research Says About Bridging](#what-the-research-says-about-bridging)
- [Comparison Matrix](#comparison-matrix)
- [Tool-by-Tool Comparison](#tool-by-tool-comparison)
  - [Pol.is](#polis)
  - [Community Notes–style Bridging Ranking](#community-notesstyle-bridging-ranking)
  - [Decidim & Consul](#decidim--consul)
  - [Loomio](#loomio)
  - [Kialo](#kialo)
  - [Consider.it](#considerit)
  - [Remesh](#remesh)
  - [All Our Ideas](#all-our-ideas)
  - [Ethelo](#ethelo)
- [When Freedi Is *Not* the Right Tool](#when-freedi-is-not-the-right-tool)

---

## The Four Design Commitments

### 1. An open option set — anyone can propose, anytime

Most voting and consultation tools start from a **fixed list of options** written by organizers. Freedi treats the option set itself as part of the deliberation: any participant can propose a new option or refine an existing one at any point, and new proposals can genuinely compete with established ones (see the algorithm below). Vector-based similar-idea detection prevents the option space from flooding with duplicates.

Why it matters: in real deliberations, the best answer is usually one nobody thought of at the start. A platform that can't grow its option set can only pick the least-bad of the initial ideas.

### 2. Intensity-aware, uncertainty-aware scoring

Participants evaluate each proposal on a **continuous −1 to +1 scale** (updatable at any time), not a binary agree/disagree. Aggregation uses the **Consensus Score**:

```
Consensus Score = Mean − SEM
```

where SEM is the standard error of the mean with an uncertainty floor (σ ≥ 0.5). In plain language: a proposal's score is a *statistically conservative estimate of how much the whole population supports it*.

- Few evaluations → large SEM → the score is held back until more people weigh in.
- **High disagreement (variance) → large SEM → the score is penalized**, even if the mean is high.
- As evaluations accumulate on a genuinely good proposal, the penalty shrinks and it rises naturally.

See the [Consensus Scoring documentation](./features/CONSENSUS_SCORING_UPDATE.md) and the [published paper](https://doi.org/10.31235/osf.io/u4phy_v1) for the full treatment.

### 3. Bridging is built into the math, not bolted on

Because the variance of evaluations directly penalizes the score, **polarizing proposals structurally cannot win**. A proposal adored by faction A (+1 across the board) and rejected by faction B (−1 across the board) has enormous variance — its Consensus Score collapses. A moderate proposal that both factions rate +0.5 beats it decisively.

This achieves the goal of *bridging* — surfacing "outcomes that are endorsed by participants who otherwise hold divergent or opposing views" ([Blair et al., *The Structure of Bridging*](https://www.cs.toronto.edu/~nisarg/papers/bridging.pdf)) — **without needing to model who belongs to which faction**. Blair et al. show that the bridging metrics used by leading platforms (Pol.is's group-aware consensus, Remesh's minimum cross-group approval) share a structural weakness: they depend on a *single fixed partition* of participants into groups, "which may fail to capture important cleavages in the population." Freedi sidesteps the problem entirely — there is no clustering step, no latent-factor estimation, no pre-specified groups.

There is also a direct mathematical link to their framework: sample variance is proportional to the mean **pairwise disagreement** between evaluators (Var = ½ · mean of (xᵢ − xⱼ)²) — one of the two bridging measures Blair et al. axiomatically support. Freedi's SEM penalty is therefore a partition-free pairwise-disagreement penalty on a continuous scale: it works from the very first handful of votes, is robust to every cleavage at once (not just the dominant one), and the formula is simple enough to explain to every participant in one sentence. Transparency of the aggregation rule is itself a trust-building feature in factional settings.

### 4. A pipeline from talk to outcome

Deliberation that ends in a report nobody signs is deliberation that gets ignored. Freedi is a monorepo of apps that hand off to each other:

| Stage | App | What it does |
|-------|-----|--------------|
| Deep deliberation | **Freedi (main app)** | Hierarchical discussions (groups → questions → options), multi-stage processes, mind maps, facilitation support |
| Mass input | **Mass Consensus** | Anonymous, no-login, server-rendered rapid evaluation at scale (FCP < 0.8s), AI-assisted suggestions |
| Commitment | **Freedi Sign** | Turn the consensus into a document with paragraph-level approval, suggestions, and public endorsement |

The output of a Freedi process is not a heat map for experts to interpret — it is a ranked set of options with quantified consensus, and optionally a signed charter.

---

## Deliberating with Factions

This is Freedi's core scenario: an audience that is not merely large but **divided** — secular and religious, labor and management, neighborhood factions, rival departments.

What Freedi does differently for this case:

1. **The variance penalty makes cross-faction appeal the winning strategy.** Participants quickly learn that proposals written to please only their own side sink in the rankings. The rational move — visible in real time — is to draft proposals the other side can live with. The scoring rule changes the *incentives* of the deliberation, not just its measurement.

2. **No faction needs to be identified or labeled.** Cluster-based bridging approaches (Pol.is opinion groups, Remesh's pre-specified groups, Community Notes' matrix factorization) must first estimate or declare who belongs to which camp — which requires substantial data, can misclassify people, can make participants feel sorted into boxes, and — as [Blair et al.](https://www.cs.toronto.edu/~nisarg/papers/bridging.pdf) argue — accounts for only a single partition while real populations split along many cleavages at once. Freedi's mechanism is faction-blind by construction while still being faction-robust in outcome: disagreement along *any* cleavage inflates variance and lowers the score.

3. **Continuous scores let moderates be moderate.** Binary agree/disagree forces every participant into one of two camps on every statement, amplifying the appearance of polarization. A −1..+1 scale lets a religious participant say "+0.3, I can live with this" — which is exactly the signal a bridging process needs and binary tools destroy.

4. **New bridging options can enter mid-process.** When live rankings reveal that all current options are factional, anyone can propose a synthesis — and the SEM mechanics give it a fair chance to overtake incumbents as evaluations accumulate.

5. **Polarization is surfaced, not hidden.** Polarization tracking and demographic lenses show facilitators which proposals divide the room and along which lines, so facilitated sessions can target exactly the fault lines that matter.

Field results (religion–state charter, 40 secular and religious participants, two facilitated sessions): proposals exceeding 60% consensus across both camps were synthesized into a draft charter. See [Real-World Impact](../README.md#real-world-impact).

---

## What the Research Says About Bridging

*Bridging* — surfacing outcomes "endorsed by participants who otherwise hold divergent or opposing views" — is the emerging scientific frame for exactly the problem Freedi targets. The most rigorous treatment to date is **[The Structure of Bridging](https://www.cs.toronto.edu/~nisarg/papers/bridging.pdf)** (Blair, de Raaij, Procaccia, Rubin-Toles, Shah, Si & Wang; Harvard University / University of Toronto), which develops an axiomatic framework for bridging metrics. Its findings map remarkably well onto Freedi's design:

1. **Fixed partitions are the weak point of current platforms.** Pol.is scores a comment by the *product* of its approval rates across PCA-estimated opinion groups; Remesh uses the *minimum* approval rate across pre-specified groups (e.g., Israelis and Palestinians). Blair et al.'s central critique is that both "only account for inter-group connections in a fixed partition of the participants into groups, which may fail to capture important cleavages in the population" — and they show empirically that Pol.is's single-partition approach is significantly less robust to missing votes than partition-free alternatives. Freedi never partitions participants, so no cleavage is privileged and none is missed.

2. **Pairwise disagreement is an axiomatically sound bridging measure.** One of the paper's two endorsed metrics scores an alternative by the disagreement *between pairs of participants* — no group structure required. Freedi's Consensus Score connects to this directly: the sample variance that drives the SEM penalty is proportional to the mean pairwise squared disagreement among evaluators (Var = ½ · mean (xᵢ − xⱼ)²). Penalizing variance *is* penalizing pairwise disagreement — on a continuous scale, with an explicit small-sample correction on top.

3. **Sparse votes are the reality of deliberation platforms.** The paper emphasizes that participants only ever vote on a small subset of comments, and evaluates metrics under exactly this sparsity. Freedi's SEM term addresses the same reality from the statistical side: proposals with few evaluations are explicitly treated as uncertain rather than compared naively against well-evaluated ones.

Freedi's Mean − SEM predates this formalism and is not identical to the paper's metrics — bridging functions reward a proposal whose *supporters* disagree elsewhere, while Freedi penalizes disagreement *about the proposal itself* — but both mechanisms select for the same thing: options acceptable across divides rather than beloved by one side. The convergence of independent lines of work on variance/disagreement-sensitive scoring is encouraging validation of the approach.

---

## Comparison Matrix

| Capability | **Freedi** | Pol.is | Community Notes-style | Decidim / Consul | Loomio | Kialo | Consider.it | Remesh | All Our Ideas | Ethelo |
|---|---|---|---|---|---|---|---|---|---|---|
| Open option set (participants add proposals) | ✅ | ✅ (comments) | ✅ (notes) | ✅ | ✅ | ✅ (claims) | ✅ | ✅ | ✅ | ⚠️ organizer-set |
| Expression richer than binary | ✅ continuous −1..+1 | ❌ agree/disagree/pass | ⚠️ helpful ratings | ❌ support counts | ⚠️ 4 positions | ⚠️ 1–100 impact | ✅ slider | ⚠️ | ❌ pairwise | ✅ multi-criteria |
| Built-in consensus/bridging metric | ✅ Mean − SEM | ⚠️ group-aware consensus (needs clusters) | ✅ bridging rank | ❌ | ❌ | ❌ | ❌ | ⚠️ min across pre-set groups | ⚠️ ranking | ✅ proprietary |
| Faction-robust without clustering users | ✅ | ❌ needs clusters | ❌ needs latent factors | ❌ | ❌ | — | ❌ | ❌ | ❌ | ⚠️ |
| Real-time results guide iteration | ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ✅ | ✅ | ✅ live | ✅ | ⚠️ |
| Produces a decision (not just insight) | ✅ | ❌ sensemaking | ❌ ranking | ✅ | ✅ | ❌ debate map | ⚠️ | ⚠️ | ⚠️ | ✅ |
| Document co-drafting & signing | ✅ Freedi Sign | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Hierarchical multi-question processes | ✅ unlimited depth | ❌ single conversation | ❌ | ✅ | ⚠️ threads | ✅ | ❌ | ⚠️ | ❌ | ⚠️ |
| Anonymous no-login participation | ✅ Mass Consensus | ✅ | ❌ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ |
| Open source | ✅ GPL-3 | ✅ AGPL | ✅ (algorithm) | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| AI assistance (dedup, clustering, synthesis) | ✅ | ⚠️ third-party | ✅ | ⚠️ | ❌ | ❌ | ❌ | ✅ core | ❌ | ⚠️ |
| RTL + full i18n | ✅ he/ar + 4 more | ⚠️ | — | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ |

✅ = first-class support · ⚠️ = partial / requires work or add-ons · ❌ = not a design goal · — = not applicable

*This matrix reflects our understanding as of mid-2026; corrections are welcome — [open an issue](https://github.com/delib-org/Freedi-app/issues).*

---

## Tool-by-Tool Comparison

### Pol.is

**What it is:** The best-known open-source "listening at scale" tool ([pol.is](https://pol.is)). Participants submit short comments and vote agree/disagree/pass on others' comments; PCA clustering reveals opinion groups and the comments that unite or divide them. Famous for powering vTaiwan.

**Where it shines:** Understanding the landscape of opinion in a large population. Unmatched track record in government consultations.

**Where Freedi differs:**
- **Pol.is is a sensemaking instrument; Freedi is a decision instrument.** Pol.is output is a map of opinion clusters that experts and facilitators interpret downstream. Freedi outputs a live ranking with a quantified consensus score — the deliberation itself converges on an answer.
- **Binary votes vs. intensity.** Agree/disagree/pass cannot distinguish "I'd die for this" from "sure, fine," which is precisely the information consensus-building needs.
- **Bridging requires clustering in Pol.is.** Its group-aware consensus (the product of a comment's approval rates across PCA/k-means opinion groups) is computed only after opinion groups are estimated from the vote matrix — and depends on that single estimated partition, a weakness formalized by [Blair et al.](https://www.cs.toronto.edu/~nisarg/papers/bridging.pdf), who also show it is markedly less robust to missing votes than partition-free alternatives. Freedi's variance penalty bridges from the first votes without modeling groups at all.
- **No decision pipeline.** Pol.is has no ranking-to-decision step, no hierarchical multi-question processes, and no document/endorsement stage.

**Use Pol.is when** you want a wide-open listening exercise and have the analytical capacity to interpret cluster output. **Use Freedi when** the group needs to *decide something* — or use Pol.is to listen first, then run the resulting themes through Freedi.

### Community Notes–style Bridging Ranking

**What it is:** The bridging algorithm behind X/Twitter's Community Notes (open-sourced): matrix factorization separates a note's quality from raters' ideological alignment, and only notes rated helpful *across* the divide are shown.

**Where it shines:** Adversarial, massive-scale environments; the strongest deployed proof that bridging-based ranking works.

**Where Freedi differs:**
- **Same goal, radically simpler mechanism.** Freedi's variance penalty achieves cross-faction filtering without latent-factor models — which means it works with 10 evaluators, not 10,000, and every participant can verify the formula themselves.
- **Community Notes ranks annotations; Freedi runs deliberations.** There is no proposal iteration, no discussion structure, no decision output in the Notes mechanism — it is a ranking layer, not a deliberation platform.

### Decidim & Consul

**What they are:** Heavyweight open-source participatory-democracy portals ([decidim.org](https://decidim.org), [consuldemocracy.org](https://consuldemocracy.org)) used by Barcelona, Madrid, and hundreds of cities — participatory budgeting, proposal collection, meeting management, and voting.

**Where they shine:** Institutional breadth. If a city needs one portal for budgets, petitions, assemblies, and legislative annotation, these are the mature choices.

**Where Freedi differs:**
- **Their aggregation is majoritarian.** Support counts and thresholds reward mobilizing your own faction, not persuading the other one — the opposite incentive from Freedi's consensus scoring.
- **No consensus measurement at all** — a proposal with 5,000 supporters and 5,000 furious opponents looks identical to one with 5,000 supporters and no opposition.
- **Deployment weight.** Decidim/Consul are institutional installations with significant setup and administration overhead; a Freedi question can be live and collecting anonymous input in minutes via Mass Consensus.

**Use Decidim/Consul when** you're a municipality standing up permanent participation infrastructure. **Use Freedi when** the hard problem is genuine agreement among divided stakeholders — or embed Freedi processes inside a Decidim consultation.

### Loomio

**What it is:** Open-source decision-making for teams and co-ops ([loomio.com](https://loomio.com)) — discussion threads plus proposals with agree/abstain/disagree/block positions.

**Where it shines:** Small-group consent-based decisions (boards, co-ops, working groups of dozens). Warm, well-crafted, battle-tested in the cooperative movement.

**Where Freedi differs:**
- **Scale.** Loomio's thread-and-position model assumes everyone can read everything; it has no aggregation algorithm to compress thousands of voices. Freedi is designed for 10 → 10,000+.
- **Factional dynamics.** A "block" in Loomio is a veto conversation; in a genuinely factional large group, veto mechanics deadlock. Freedi's scoring lets divided groups converge without giving any camp a veto.

### Kialo

**What it is:** Structured pro/con argument mapping ([kialo.com](https://kialo.com)) — debates as trees of claims with impact ratings.

**Where it shines:** Making the *logical structure* of a controversy legible; superb for education and debate analysis.

**Where Freedi differs:** Kialo maps arguments; it doesn't aggregate preferences into a collective choice. There is no consensus metric, no decision stage, and it's proprietary. Freedi's hierarchical statements give some of the same structure, but every node is evaluable and the process terminates in a ranked decision.

### Consider.it

**What it is:** Open-source deliberation forum ([consider.it](https://consider.it)) where participants place themselves on a slider and attach pros/cons; opinions render as a histogram.

**Where it shines:** Beautiful, legible visualization of where a community stands and why. Closest of the listening tools to Freedi's continuous-scale philosophy.

**Where Freedi differs:** Consider.it visualizes the distribution but does not *score* it — there's no aggregation rule that rewards bridging, penalizes polarization, or handles small-sample uncertainty, and no mechanism for the option set to iterate toward synthesis. It's a better opinion X-ray than a decision engine.

### Remesh

**What it is:** Proprietary AI-moderated live research platform ([remesh.ai](https://remesh.ai)) — a moderator poses questions to thousands of participants in real time; AI clusters and surfaces representative answers.

**Where it shines:** Enterprise/government qualitative research at speed; polished live-session experience.

**Where Freedi differs:** Remesh is closed-source and priced for enterprises; sessions are moderator-driven research exercises, not participant-driven deliberations; the output is insight for the sponsor, not a decision owned by the participants. Its bridging score — the minimum approval rate across *pre-specified* groups (e.g., the two sides of a peace process) — requires organizers to decide in advance which cleavage matters, the exact limitation critiqued by [Blair et al.](https://www.cs.toronto.edu/~nisarg/papers/bridging.pdf) Freedi is GPL-3, self-hostable, needs no group specification, and puts the ranking in participants' hands in real time.

### All Our Ideas

**What it is:** Open-source pairwise "wiki survey" ([allourideas.org](https://allourideas.org)) — participants pick between two ideas at a time; ideas accumulate a ranking; anyone can add ideas.

**Where it shines:** Dead-simple prioritization with an open option set — the lowest-friction tool in this list.

**Where Freedi differs:** Pairwise choice yields a popularity ranking, not a consensus measure — it cannot distinguish a broadly acceptable idea from a factional favorite that wins its matchups on mobilization. No deliberation, discussion, or refinement loop surrounds the ranking.

### Ethelo

**What it is:** Proprietary multi-criteria decision platform ([ethelo.com](https://ethelo.com)); participants evaluate options against weighted criteria, and its algorithm explicitly optimizes for support *and* low inequality of satisfaction (it powers Engaged California).

**Where it shines:** Complex trade-off decisions (budgets, site selection) with explicit criteria. Notably, Ethelo shares Freedi's conviction that variance/inequality of support matters — it is the closest philosophical cousin in this list.

**Where Freedi differs:** Ethelo is closed-source with organizer-configured option sets and significant process-design overhead per engagement, and its algorithm is a black box to participants. Freedi keeps the option set open to participants, the formula one line long, and the code GPL-3.

---

## When Freedi Is *Not* the Right Tool

We'd rather you pick the right tool than pick Freedi:

- **Pure listening/opinion-mapping with no decision needed** → Pol.is or Consider.it are excellent and have longer track records at civic scale.
- **A permanent municipal participation portal** (budgets, petitions, assemblies) → Decidim or Consul.
- **A small team making consent-based decisions** → Loomio is warmer and simpler at that scale.
- **Teaching argumentation or mapping a debate's logic** → Kialo.
- **Adversarial content moderation at social-media scale** → Community Notes-style bridging is the proven design.

Also see [Limitations and Future Work](../README.md#limitations-and-future-work): Freedi's empirical evidence is strongest at 40–70 active participants, manipulation resistance is still under research, and successful cases so far involved skilled facilitation.

---

## References

- Blair, C., de Raaij, J., Procaccia, A. D., Rubin-Toles, M., Shah, N., Si, M., & Wang, S. *The Structure of Bridging.* Harvard University / University of Toronto. [PDF](https://www.cs.toronto.edu/~nisarg/papers/bridging.pdf) — axiomatic framework for bridging metrics; critique of fixed-partition approaches (Pol.is, Remesh); pairwise disagreement and p-mean bridging.
- Yaron, T. (2026). *A Confidence-Adjusted Consensus Mechanism for Scalable Deliberative Decision-Making.* SocArXiv. [https://doi.org/10.31235/osf.io/u4phy_v1](https://doi.org/10.31235/osf.io/u4phy_v1) — the Freedi Consensus Score (Mean − SEM) and its field validation.
- Ovadya, A. (2022). *Bridging-Based Ranking.* Belfer Center, Harvard Kennedy School — the concept of ranking by cross-divide endorsement.
- Small, C., et al. (2021). *Polis: Scaling Deliberation by Mapping High Dimensional Opinion Spaces.* — the Pol.is methodology.
- [Consensus Scoring documentation](./features/CONSENSUS_SCORING_UPDATE.md) — Freedi's implementation details.

---

*Descriptions of third-party tools are good-faith summaries as of mid-2026 and may lag their latest releases. Found an error? [Open an issue](https://github.com/delib-org/Freedi-app/issues) — we want this page to stay fair.*
