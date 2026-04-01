# Scalable Deliberative Democracy: A Confidence-Adjusted Method for Collective Preference Aggregation

**Author:** Tal Yaron

---

## Abstract

Identifying collective preferences in large groups remains a central challenge for democratic decision-making. Existing approaches—such as surveys, focus groups, and voting—either constrain participants to predefined options or fail to scale while preserving minority perspectives and epistemic uncertainty.

This paper introduces **Mass Consensus**, a scalable deliberative framework for collective decision-making based on open proposal generation and confidence-adjusted aggregation. The method separates preference direction from confidence by incorporating participation size and variance directly into the scoring process, producing conservative consensus estimates that penalize uncertainty rather than popularity alone.

We formally describe the aggregation logic, sampling strategy, and decision pipeline underlying the framework, and present results from a real-world pilot deployment involving 129 participants and 139 user-generated proposals. These results demonstrate feasibility and system behavior rather than claim generalizable empirical validation.

The primary contribution of this work is methodological: a transparent, reproducible approach to large-scale deliberation that preserves openness while maintaining statistical discipline. Future work will focus on comparative evaluation, scaling behavior, and normative implications.

---

## 1. Introduction

Current methodologies for gathering collective input face significant limitations:

| Method | Limitation |
|--------|------------|
| **Surveys** | Follow a top-down approach where surveyors predetermine choices, limiting the public's ability to propose novel solutions |
| **Focus Groups** | Expensive, prone to groupthink, and dominated by vocal participants |
| **AI Sentiment Analysis** | While scalable, these systems often provide abstract summaries, can hallucinate results, and lack statistical transparency |

Mass Consensus addresses these limitations by allowing **open creativity**, where any participant can propose a solution. However, this creates a cognitive bottleneck: individuals cannot meaningfully evaluate hundreds of options. To solve this, the system employs a **randomized, incomplete evaluation process** in which each person rates only a small subset of proposals.

### 1.1 Scope and Contribution

This work is intentionally positioned as a **methodological contribution** rather than a finalized empirical evaluation. The goal is to formally describe a deliberative aggregation method that can be independently examined, implemented, and extended.

While pilot deployments are included, they primarily serve to illustrate the operational feasibility and qualitative behavior of the system under real participation constraints. Claims regarding effectiveness, optimality, or policy impact are explicitly deferred to future large-scale studies.

---

## 2. Methods: Confidence-Adjusted Deliberative Aggregation

### 2.1 Problem Setting

We consider a deliberative decision-making process involving a set of participants:

$$U = \{u_1, u_2, \ldots, u_N\}$$

and a dynamically generated set of proposals:

$$P = \{p_1, p_2, \ldots, p_M\}$$

where proposals are contributed freely by participants rather than predefined by the system.

Each participant evaluates only a limited subset of proposals, reflecting realistic cognitive and time constraints. The central challenge is to aggregate these incomplete, uneven evaluations into a ranked set of proposals while accounting for both **preference direction** and **statistical uncertainty**.

### 2.2 Evaluation Model

#### 2.2.1 Individual Evaluations

Each evaluation is represented as a bounded scalar value:

$$e_{u,p} \in [-1, +1]$$

Where:
- **+1** indicates strong support
- **-1** indicates strong opposition
- Intermediate values indicate weaker or ambivalent judgments

Not all users evaluate all proposals. For each proposal *p*, let:

$$E_p = \{e_{u,p} \mid u \text{ evaluates } p\}$$

be the set of evaluations received, with $n_p = |E_p|$ as the number of evaluations.

### 2.3 Confidence-Adjusted Scoring

#### 2.3.1 Mean Preference

For each proposal *p*, the observed mean preference is:

$$\mu_p = \frac{1}{n_p} \sum_{e \in E_p} e$$

However, raw averages are unreliable when $n_p$ is small or variance is high.

#### 2.3.2 Uncertainty Estimation

We estimate uncertainty using the **Standard Error of the Mean (SEM)**:

$$SEM_p = \frac{s_p}{\sqrt{n_p}}$$

where $s_p$ is the sample standard deviation of the evaluations for *p*.

SEM captures both:
- **Participation depth** (number of evaluations)
- **Disagreement** among evaluators

#### 2.3.3 Conservative Consensus Score

The final consensus score is defined as:

$$C_p = \mu_p - SEM_p$$

This formulation yields a **conservative lower-bound estimate** of collective support. Proposals with high mean support but insufficient or inconsistent evaluation are penalized, while proposals with stable agreement converge toward their observed mean as $n_p$ increases.

This approach explicitly favors **epistemic caution** over popularity amplification.

### 2.4 Incomplete and Adaptive Sampling

Because evaluating all proposals is infeasible at scale, the system employs **incomplete randomized evaluation**: each participant evaluates a small number *k* of proposals per session.

To prevent structural bias, proposal selection is **adaptive** rather than uniform.

### 2.5 Proposal Selection Priority

For each proposal *p*, a priority score $Q_p$ determines its probability of being shown for evaluation:

$$Q_p = w_1 \cdot B_p + w_2 \cdot U_p + w_3 \cdot R_p + w_4 \cdot T_p$$

Where:

| Component | Symbol | Description |
|-----------|--------|-------------|
| **Base Coverage** | $B_p$ | Inversely proportional to $n_p$, prioritizing under-evaluated proposals |
| **Uncertainty** | $U_p$ | Proportional to $SEM_p$, prioritizing proposals with unstable estimates |
| **Recency** | $R_p$ | A time-decay function granting temporary exposure to newly submitted proposals |
| **Threshold Proximity** | $T_p$ | Emphasizes proposals near decision thresholds, where additional information is most informative |

The weights $(w_1, w_2, w_3, w_4)$ are configurable parameters. In the pilot deployment, they were set to **(0.40, 0.25, 0.20, 0.15)**.

### 2.6 Algorithm Summary

```
Algorithm: Confidence-Adjusted Deliberative Aggregation

For each evaluation round:
    For each participant u:
        Select k proposals p with probability proportional to Qp
        Record evaluations e(u,p)

Periodically:
    For each proposal p:
        Compute μp, sp, SEMp
        Compute consensus score Cp = μp - SEMp
    Rank proposals by Cp

Repeat until evaluation resources are exhausted or consensus stabilizes.
```

### 2.7 Decision Output

The system outputs:

1. A **ranked list** of proposals by $C_p$
2. **Participation and uncertainty metrics** for each proposal
3. Optional selection of top-ranked proposals subject to contextual constraints

Importantly, the system preserves **traceability**: all scores can be decomposed into observed preferences and uncertainty penalties.

### 2.8 Implementation Notes

The method is **agnostic** to:
- Interface design
- Domain of deliberation
- Institutional setting

It requires only:
- Bounded scalar evaluations
- Randomized but adaptive sampling
- Transparent aggregation logic

The pilot implementation described in Section 3 demonstrates feasibility but is not required for the method itself.

### 2.9 Methodological Scope

This section defines the Mass Consensus aggregation method independently of empirical outcomes. While pilot data illustrates system behavior, the method itself is fully specified by the evaluation model, confidence-adjusted scoring, and adaptive sampling mechanism described above.

> *This manuscript constitutes version 1.0 of the Mass Consensus deliberative aggregation method.*

---

## 3. Experimental Results: The Neighborhood-East Pilot

The framework was tested in a neighborhood in Israel to identify community priorities. The pilot included **139 resident-created suggestions** and **129 unique evaluators**.

### 3.1 Statistical Validation of Consensus

The system successfully identified high-consensus items while maintaining a conservative score for those with fewer evaluations. The top-ranked priorities were:

| Rank | Issue | Consensus Score |
|------|-------|-----------------|
| 1 | **Inaccessible Sidewalks** — Identified as the primary concern for people with disabilities | 0.777 |
| 2 | **Traffic Safety** — Specifically at the main junction | 0.775 |
| 3 | **Environmental Nuisances** — Including lighting, smoke/BBQ smells, and stray dogs | 0.760 |

### 3.2 Impact of the SEM Penalty

The data demonstrated how the **Mean − SEM** formula protected the integrity of the ranking:

#### Example 1: Appropriate Ranking Despite Strong Support

**Neighborhood Events** received a consensus score of **0.668**. While it had strong support, the system correctly categorized it below more urgent infrastructure needs that had higher agreement *and* statistical stability.

#### Example 2: Capturing Controversy

**Adding Notice Boards** resulted in a negative consensus of **−0.535**. The system captured the significant opposition and the high standard error associated with conflicting views, preventing a "neutral" average from masking the controversy.

---

## 4. Discussion

### 4.1 Key Properties

Mass Consensus transforms scoring from an arbitrary contest of exposure into a measure of collective judgment. By grounding the algorithm in **Mean − SEM** and **adaptive sampling**, we achieve:

| Property | Description |
|----------|-------------|
| **Fairness** | Equal treatment of all proposals regardless of submission time |
| **Reliability** | Scores reflect genuine community sentiment, not sampling artifacts |
| **Epistemic Humility** | The system quantifies what it does not know, penalizing uncertainty rather than just the size of participation |

### 4.2 Limitations and Intended Use

The pilot data presented in this paper are limited in scale and context and should not be interpreted as evidence of causal effectiveness or universal applicability. Participation was voluntary and context-specific, and no attempt was made to compare outcomes with those from alternative decision-making mechanisms.

This publication intends to establish a clear, citable description of the Mass Consensus deliberative method and its underlying aggregation logic. By making the structure explicit at this stage, we aim to support **replication**, **critique**, and **future empirical evaluation** across diverse social and institutional settings.

---

## 5. Conclusion

This paper presents Mass Consensus, a methodological framework for scalable deliberative democracy. The core innovation lies in combining:

1. **Open proposal generation** — enabling participants to contribute novel solutions
2. **Incomplete but adaptive sampling** — making large-scale participation cognitively feasible
3. **Confidence-adjusted scoring** — ensuring statistical rigor through the Mean − SEM formula

The framework prioritizes transparency and reproducibility over black-box optimization. All rankings are fully decomposable into observable quantities: mean preference, sample size, and variance.

Future work will address:
- Comparative evaluation against alternative aggregation methods
- Scaling behavior with thousands of participants
- Normative implications for democratic theory
- Integration with existing institutional decision-making processes

---

## Appendix A: Mathematical Notation Summary

| Symbol | Definition |
|--------|------------|
| $U$ | Set of participants $\{u_1, u_2, \ldots, u_N\}$ |
| $P$ | Set of proposals $\{p_1, p_2, \ldots, p_M\}$ |
| $e_{u,p}$ | Evaluation by user $u$ of proposal $p$, where $e \in [-1, +1]$ |
| $E_p$ | Set of all evaluations for proposal $p$ |
| $n_p$ | Number of evaluations for proposal $p$ |
| $\mu_p$ | Mean evaluation for proposal $p$ |
| $s_p$ | Sample standard deviation for proposal $p$ |
| $SEM_p$ | Standard error of the mean for proposal $p$ |
| $C_p$ | Consensus score: $\mu_p - SEM_p$ |
| $Q_p$ | Priority score for adaptive sampling |
| $B_p, U_p, R_p, T_p$ | Priority components: Base, Uncertainty, Recency, Threshold |
| $w_1, w_2, w_3, w_4$ | Priority weights (default: 0.40, 0.25, 0.20, 0.15) |

---

## Appendix B: Consensus Score Properties

### B.1 Behavior Under Different Conditions

| Scenario | Mean ($\mu$) | SEM | Consensus ($C$) | Interpretation |
|----------|--------------|-----|-----------------|----------------|
| Strong support, many evaluations | +0.8 | 0.05 | +0.75 | High confidence positive |
| Strong support, few evaluations | +0.8 | 0.30 | +0.50 | Penalized for uncertainty |
| Moderate support, low variance | +0.5 | 0.08 | +0.42 | Stable moderate support |
| Moderate support, high variance | +0.5 | 0.25 | +0.25 | Penalized for disagreement |
| Mixed opinions | +0.1 | 0.35 | −0.25 | Uncertainty dominates |
| Strong opposition | −0.7 | 0.10 | −0.80 | Confirmed opposition |

### B.2 Convergence Property

As $n_p \to \infty$ and evaluations are drawn from a stable distribution:

$$C_p \to \mu_p$$

The consensus score converges to the true mean preference as uncertainty diminishes.

---

*Version 1.0 — January 2025*
