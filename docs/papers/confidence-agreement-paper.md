# Confidence and Agreement Indices for Deliberative Consensus Systems: A Companion Framework to Mass Consensus Scoring

**Author:** Tal Yaron, in discussion with Claude Code (Anthropic)

> **Note:** This is a **working paper** — a preliminary exploration of ideas developed through iterative dialogue between a human researcher and an AI assistant. The formulas and reasoning presented here have not undergone peer review and should be treated as a starting point for further investigation, not as established results. We warmly invite statisticians, survey methodologists, social choice theorists, and practitioners of deliberative democracy to examine, critique, and extend this work. Collaboration inquiries are welcome at the [Freedi project](https://github.com/delib-org/FreeDi-sign).

---

## Abstract

The Mass Consensus framework (Yaron, 2025) introduced a confidence-adjusted scoring method for collective preference aggregation, producing a conservative consensus score $C_p = \mu_p - SEM_p$. While this score effectively ranks proposals, it conflates two distinct informational dimensions: *how much do participants agree?* and *can we trust the result given the sample?*

This working paper proposes two companion metrics that attempt to decompose the epistemic state of a consensus estimate into interpretable components:

1. **Agreement Index** ($A$) — a normalized measure of evaluator alignment, independent of sample size
2. **Confidence Index** ($\Gamma$) — a measure of sample representativeness incorporating participation depth, population size, and sampling methodology

We derive each metric from established statistical principles, justify the functional forms chosen, and calibrate the confidence index against known benchmarks from survey methodology. Together with the consensus score, these metrics are intended to provide a three-dimensional characterization of collective judgment: *what the group thinks* ($C_p$), *how aligned they are* ($A_p$), and *how much we should trust the estimate* ($\Gamma_p$).

The ideas presented here emerged from an iterative design conversation and have not yet been empirically validated. We present them in the hope that they may be useful as a foundation for more rigorous treatment by the research community.

---

## 1. Introduction

### 1.1 The Problem of Interpretability

The Mass Consensus score $C_p = \mu_p - SEM_p$ serves as a ranking function: proposals with higher scores reflect stronger, more certain collective support. However, when communicating results to non-technical stakeholders — citizens, policymakers, community members — a single ranking score is insufficient. Stakeholders naturally ask:

- *"How confident should I be in this result?"*
- *"Do people actually agree, or is this an average of opposing views?"*

These are distinct questions that the consensus score cannot answer alone.

### 1.2 Two Dimensions of Epistemic State

Consider two scenarios with identical consensus scores:

**Scenario A:** 100 evaluators with mean $\mu = 0.6$ and low variance ($\sigma = 0.1$). The SEM is small; the consensus score is high because people genuinely agree.

**Scenario B:** 100 evaluators with mean $\mu = 0.8$ and high variance ($\sigma = 0.8$). The SEM is large; the consensus score happens to equal Scenario A's because the high mean compensates for the large penalty.

These scenarios have the same $C_p$ but represent fundamentally different deliberative states. Scenario A reflects genuine alignment; Scenario B reflects polarization masked by an asymmetric distribution. A complete reporting framework must distinguish these cases.

### 1.3 Contribution

We propose two metrics that, alongside the consensus score, form a **three-dimensional characterization** of any deliberative outcome:

| Metric | Symbol | Measures | Depends On |
|--------|--------|----------|------------|
| **Consensus Score** | $C_p$ | Ranking under uncertainty | $\mu$, $\sigma$, $n$ |
| **Agreement Index** | $A_p$ | Evaluator alignment | $\sigma$ only |
| **Confidence Index** | $\Gamma_p$ | Sample representativeness | $n$, $N$, $q$ |

The consensus score combines preference and uncertainty for ranking. The agreement and confidence indices decompose the *reasons* behind that score into human-interpretable dimensions.

---

## 2. The Agreement Index

### 2.1 Motivation

The agreement index answers: *"To what extent do evaluators share the same assessment?"*

This question is independent of:
- **How many** people evaluated (that is a confidence question)
- **What direction** they lean (that is captured by the mean)

It concerns only the **dispersion** of evaluations around the mean.

### 2.2 Derivation

On the evaluation scale $e \in [-1, +1]$, the maximum possible standard deviation occurs when evaluators are maximally polarized — half voting $+1$ and half voting $-1$:

$$\sigma_{max} = \sqrt{\frac{1}{n}\sum(e_i - \mu)^2} = \sqrt{\frac{n \cdot 1}{n}} = 1$$

when $\mu = 0$ and all values are at the extremes.

**Proof:** Let $n/2$ evaluators choose $+1$ and $n/2$ choose $-1$. Then $\mu = 0$ and:

$$\sigma^2 = \frac{1}{n}\sum_{i=1}^{n}(e_i - 0)^2 = \frac{1}{n}\sum_{i=1}^{n}e_i^2 = \frac{1}{n} \cdot n \cdot 1 = 1$$

Therefore $\sigma_{max} = 1$ on the $[-1, +1]$ scale.

The **normalized disagreement** is then:

$$D_p = \frac{\sigma_p}{\sigma_{max}} = \sigma_p$$

And the **Agreement Index** is its complement:

$$\boxed{A_p = 1 - \sigma_p}$$

### 2.3 Properties

| Property | Value |
|----------|-------|
| **Range** | $[0, 1]$ |
| **Perfect agreement** | $A = 1$ when all evaluators assign the same value |
| **Maximum polarization** | $A = 0$ when $\sigma = 1$ (extreme split) |
| **Scale-normalized** | Derived from the bounded evaluation domain |
| **Sample-size independent** | Does not change with $n$ for the same distribution |
| **Direction-agnostic** | Equal agreement whether consensus is positive or negative |

### 2.4 Interpretation Guide

| Agreement | Interpretation | Typical Pattern |
|-----------|---------------|-----------------|
| $A \geq 0.9$ | Very strong alignment | Near-unanimous support or opposition |
| $0.7 \leq A < 0.9$ | Substantial agreement | Clear majority with mild dissent |
| $0.5 \leq A < 0.7$ | Moderate agreement | Noticeable spread in evaluations |
| $0.3 \leq A < 0.5$ | Weak agreement | Significant division |
| $A < 0.3$ | No meaningful agreement | Strongly polarized or multimodal |

### 2.5 Relationship to Consensus Score

The agreement index and consensus score are complementary but not redundant:

$$C_p = \mu_p - \frac{\sigma_p}{\sqrt{n_p}} = \mu_p - \frac{(1 - A_p)}{\sqrt{n_p}}$$

The consensus score uses disagreement *weighted by sample size*. The agreement index reports disagreement in absolute terms, providing context that the consensus score absorbs.

---

## 3. The Confidence Index

### 3.1 Motivation

The confidence index answers: *"Given who participated and how they were sampled, how representative is this result of the target population?"*

This depends on three factors:

1. **Sample size** ($n$) — How many people evaluated?
2. **Population size** ($N$) — How large is the affected community?
3. **Sampling quality** ($q$) — How well does the sample represent the population?

Crucially, confidence is **independent of the evaluations themselves**. Whether evaluators agree or disagree, 1,500 well-sampled people from a large population provide the same representativeness. The *content* of their evaluations affects agreement; the *structure* of their participation affects confidence.

### 3.2 Design Requirements

We require a confidence function $\Gamma(n, N, q)$ satisfying:

| Requirement | Formal Condition | Rationale |
|-------------|-----------------|-----------|
| **Bounded** | $\Gamma \in [0, 1]$ | Interpretable as a percentage |
| **Monotone in $n$** | $\partial\Gamma/\partial n > 0$ | More evaluators increase confidence |
| **Census completeness** | $\Gamma(N, N, 1) = 1$ | Surveying everyone with perfect method gives certainty |
| **Zero at zero** | $\Gamma(0, N, q) = 0$ | No data means no confidence |
| **Polling calibration** | $\Gamma(1500, N_{large}, 1) \approx 0.95$ | Aligned with established survey methodology |
| **Diminishing returns** | $\partial^2\Gamma/\partial n^2 < 0$ | The 1,001st participant adds less than the 1st |
| **Population adjustment** | For small $N$, sampling a large fraction yields higher confidence | Finite population correction |
| **Quality scaling** | $\partial\Gamma/\partial q > 0$ | Better sampling methods increase confidence |

### 3.3 Derivation

#### 3.3.1 Base Form: The Bayesian Participation Weight

We begin with the functional form:

$$\Gamma_{base}(n) = \frac{n}{n + k}$$

where $k > 0$ is a half-confidence parameter (the number of evaluators at which confidence reaches 50%).

**Justification.** This form arises naturally in several statistical contexts:

1. **Bayesian shrinkage.** In the Bayesian estimation of a mean with a prior, the posterior weight assigned to the observed data is $n / (n + \kappa)$, where $\kappa$ reflects prior strength. Our confidence index assigns analogous weight to empirical participation relative to assumed uncertainty.

2. **Reliability functions.** In psychometrics, the Spearman-Brown prophecy formula uses $n / (n + k)$ to model how test reliability increases with the number of items — the same diminishing-returns structure applies to sampling.

3. **Recommendation systems.** The IMDB Bayesian weighted rating and similar platforms use $n / (n + m)$ to discount ratings from items with few votes, preventing small samples from dominating rankings.

The form satisfies boundedness ($\Gamma \in [0, 1)$), monotonicity, zero-at-zero, and diminishing returns by construction.

#### 3.3.2 Population-Dependent Scaling: Why Logarithmic?

For the confidence index to account for population size, $k$ must depend on $N$. The question is: *how*?

Consider three candidate scaling functions for $k(N)$:

| Scaling | $k(N)$ | $n$ for 50% confidence (large $N$) | Behavior |
|---------|--------|--------------------------------------|----------|
| **Constant** | $k_0$ | $k_0$ (fixed) | Population-blind; statistically valid but ignores democratic context |
| **Linear** | $\alpha N$ | $\alpha N$ | Requires a fixed fraction of population; overly pessimistic for large $N$ |
| **Logarithmic** | $c \cdot \ln(N)$ | $c \cdot \ln(N)$ | Grows slowly; reflects that required sample size is approximately independent of population for large $N$ |

We select **logarithmic scaling** based on a fundamental result from survey statistics:

**The Central Limit Theorem and Population Independence.** For a simple random sample of size $n$ drawn from a population of size $N$, the margin of error for the sample mean is:

$$MOE = z_{\alpha/2} \cdot \frac{\sigma}{\sqrt{n}} \cdot \underbrace{\sqrt{\frac{N - n}{N - 1}}}_{FPC}$$

For large $N$ with $n \ll N$, the finite population correction (FPC) approaches 1, and the margin of error depends only on $n$ and $\sigma$ — **not on $N$**. This is why political polling organizations (Gallup, Pew Research, etc.) use approximately 1,000–1,500 respondents regardless of whether the target population is 1 million or 300 million.

However, population size is not entirely irrelevant. At a deliberative level, there is a meaningful — if subtle — difference between sampling from a community of 200 and sampling from a nation of millions, even if the statistical precision is similar. The logarithmic function captures this:

$$\ln(200) \approx 5.3 \qquad \ln(2{,}000{,}000) \approx 14.5$$

A 10,000-fold increase in population produces only a 2.7-fold increase in the required half-confidence sample. This matches the empirical reality of survey methodology far better than linear or square-root alternatives.

#### 3.3.3 Finite Population Correction

When a significant fraction of the population has been sampled, the remaining uncertainty about the population is reduced. This is captured by the classical **Finite Population Correction (FPC)** factor:

$$FPC^2 = \frac{N - n}{N - 1}$$

We incorporate this directly:

$$k_{eff} = c \cdot \ln(N) \cdot \frac{N - n}{N - 1}$$

**Behavior:**
- When $n \ll N$: $\frac{N-n}{N-1} \approx 1$, and $k_{eff} \approx c \cdot \ln(N)$ (standard scaling)
- When $n \to N$: $\frac{N-n}{N-1} \to 0$, and $k_{eff} \to 0$, giving $\Gamma \to 1$ (complete census)
- Boundary: $\Gamma(N, N, q) = \frac{N \cdot q}{N \cdot q + 0} = 1$ for any $q > 0$

This ensures that surveying an entire population always yields maximum confidence, regardless of method.

#### 3.3.4 Sampling Quality as Effective Sample Size

In survey methodology, the **design effect** (DEFF) quantifies how much a non-ideal sampling method inflates variance relative to simple random sampling:

$$n_{eff} = \frac{n}{DEFF}$$

We simplify this to a quality coefficient $q \in (0, 1]$ applied directly to $n$:

$$n_{eff} = n \cdot q$$

This is equivalent to stating that a self-selected sample of 100 people ($q = 0.4$) provides the same representational power as a random sample of 40 people.

| Sampling Method | Suggested $q$ | Justification |
|----------------|---------------|---------------|
| **Stratified random sample** | 1.0 | Gold standard; may even reduce variance below SRS |
| **Simple random sample** | 0.9–1.0 | Near-optimal; minor practical imperfections |
| **Invited representative panel** | 0.6–0.8 | Partially controlled but with non-response bias |
| **Open with demographic balancing** | 0.3–0.5 | Self-selection bias partially mitigated |
| **Fully self-selected** | 0.1–0.3 | Convenience sample; significant bias expected |

These values are informed by typical design effects reported in survey methodology literature (Kish, 1965; Lohr, 2021) but should be calibrated empirically for specific deliberative contexts.

#### 3.3.5 The Complete Formula

Combining all components:

$$\boxed{\Gamma_p = \frac{n_p \cdot q}{n_p \cdot q + c \cdot \ln(N) \cdot \dfrac{N - n_p}{N - 1}}}$$

where:
- $n_p$ = number of evaluators for proposal $p$
- $N$ = target population size
- $q \in (0, 1]$ = sampling quality coefficient
- $c$ = calibration constant (see Section 3.4)
- $\ln$ = natural logarithm

### 3.4 Calibration

#### 3.4.1 Calibration Principle

We anchor the confidence index to the most well-established benchmark in survey methodology: **a properly conducted national poll of approximately 1,500 respondents achieves a margin of error of approximately $\pm 2.5\%$ at the 95% confidence level** (Groves et al., 2009).

We therefore require:

$$\Gamma(1500, N_{large}, 1) \approx 0.95$$

#### 3.4.2 Solving for $c$

For large $N$ (say $N = 2{,}000{,}000$), the FPC term approaches 1:

$$\frac{1500}{1500 + c \cdot \ln(2{,}000{,}000)} = 0.95$$

$$1500 = 0.95 \cdot (1500 + c \cdot 14.51)$$

$$1500 = 1425 + 13.78c$$

$$c = \frac{75}{13.78} \approx 5.44$$

We round to $c = 5$ for simplicity and ease of communication, yielding:

$$\Gamma(1500, 2{,}000{,}000, 1) = \frac{1500}{1500 + 5 \cdot 14.51 \cdot 1} = \frac{1500}{1572.5} \approx 0.954$$

This calibration is robust across population scales. For $N = 300{,}000{,}000$ (a national population):

$$\Gamma(1500, 3 \times 10^8, 1) = \frac{1500}{1500 + 5 \cdot 19.52} = \frac{1500}{1597.6} \approx 0.939$$

The difference between polling 2 million and 300 million is approximately 1.5 percentage points of confidence — consistent with the known population-independence of sampling precision for large $N$.

#### 3.4.3 Validation Against Known Benchmarks

| Scenario | $n$ | $N$ | $q$ | $\Gamma$ | Expected |
|----------|-----|-----|-----|----------|----------|
| Complete census, small group | 30 | 30 | 1.0 | **1.000** | Perfect — everyone participated |
| Large majority, small group | 25 | 30 | 1.0 | **0.895** | Very high — 83% of the group |
| Half of small group | 15 | 30 | 1.0 | **0.630** | Moderate — significant portion missing |
| Quarter of medium group | 50 | 200 | 1.0 | **0.714** | Reasonable — substantial sample |
| Quarter, self-selected | 50 | 200 | 0.4 | **0.427** | Lower — biased sampling reduces effective $n$ |
| Standard national poll | 1,500 | 2M | 1.0 | **0.954** | Industry benchmark |
| National poll, open sampling | 1,500 | 2M | 0.4 | **0.892** | Reduced by self-selection bias |
| Tiny sample, large population | 9 | 200,000 | 1.0 | **0.129** | Very low — expected |
| Small sample, large population | 50 | 2M | 1.0 | **0.408** | Low — too few for large population |
| Large sample, large population | 5,000 | 2M | 1.0 | **0.986** | Very high — exceeds polling standards |

These values align with practitioner intuition across deliberative contexts.

### 3.5 Properties

**Theorem 1 (Boundedness).** $\Gamma_p \in [0, 1]$ for all valid inputs.

*Proof.* The numerator $n_p \cdot q \geq 0$ and the denominator $n_p \cdot q + k_{eff} \geq n_p \cdot q$, so $\Gamma_p \leq 1$. When $n_p = N$, $k_{eff} = 0$ and $\Gamma_p = 1$. When $n_p = 0$, $\Gamma_p = 0$. $\square$

**Theorem 2 (Monotonicity in $n$).** $\Gamma$ is strictly increasing in $n_p$ for $n_p < N$.

*Proof.* Taking the derivative with respect to $n_p$ (treating other parameters as constants), the quotient rule yields a positive numerator since both the numerator increases and the $k_{eff}$ term decreases as $n_p$ grows. $\square$

**Theorem 3 (Census Completeness).** $\Gamma(N, N, q) = 1$ for all $q > 0$.

*Proof.* When $n_p = N$, the FPC term $(N - N)/(N - 1) = 0$, so $k_{eff} = 0$ and $\Gamma = N \cdot q / (N \cdot q + 0) = 1$. $\square$

**Theorem 4 (Population Insensitivity for Large $N$).** For $n \ll N$, doubling $N$ changes $\Gamma$ by at most $\frac{c \cdot \ln(2)}{(n \cdot q + c \cdot \ln(N))^2} \cdot n \cdot q$, which is small for moderate $n$.

*Informal statement:* For large populations, adding more people to the target population has diminishing effect on confidence — consistent with classical sampling theory.

### 3.6 Behavior When Population Is Unknown

In many deliberative settings, the target population size $N$ is not precisely known. We recommend:

1. **If $N$ is unknown:** Use a conservative estimate or set $N$ to a contextually appropriate default (e.g., the size of the organization, municipality, or electorate). The logarithmic dependence ensures that imprecision in $N$ has limited impact on $\Gamma$.

2. **Sensitivity:** A 10× error in estimating $N$ changes $\ln(N)$ by only $\ln(10) \approx 2.3$ units, shifting $k_{eff}$ by approximately $\pm 15\%$. This robustness to population misestimation is a desirable property.

3. **Fallback:** If no population estimate is available, the formula reduces to the base form $n \cdot q / (n \cdot q + c \cdot \ln(N_0))$ for some chosen reference $N_0$.

---

## 4. Combined Interpretation

### 4.1 The Three-Metric Framework

Together, the three metrics provide a complete, layered description of any deliberative outcome:

$$\text{Consensus Score } C_p = \mu_p - SEM_p \qquad \text{(ranking)}$$
$$\text{Agreement } A_p = 1 - \sigma_p \qquad \text{(alignment)}$$
$$\text{Confidence } \Gamma_p = \frac{n_p \cdot q}{n_p \cdot q + c \cdot \ln(N) \cdot \frac{N - n_p}{N - 1}} \qquad \text{(representativeness)}$$

### 4.2 Diagnostic Scenarios

The following scenarios illustrate how the three metrics jointly diagnose different deliberative states:

| Scenario | $C_p$ | $A_p$ | $\Gamma_p$ | Interpretation |
|----------|--------|--------|------------|----------------|
| Strong consensus, well-sampled | +0.75 | 0.90 | 0.95 | **Actionable:** clear agreement from a representative sample |
| Strong consensus, poorly sampled | +0.75 | 0.90 | 0.30 | **Promising but unreliable:** the few who participated agree, but sample is too small or biased |
| High confidence, no agreement | +0.05 | 0.15 | 0.95 | **Confirmed division:** we are confident the population is deeply split |
| Low confidence, high agreement | +0.80 | 0.95 | 0.20 | **Suggestive:** strong agreement among participants, but too few to generalize |
| Moderate across all | +0.40 | 0.60 | 0.60 | **Developing:** partial agreement with room for more participation |

### 4.3 User-Facing Communication

For non-technical audiences, we recommend presenting:

**Primary display:** A single **confidence percentage** ($\Gamma_p \times 100\%$) alongside the consensus score, answering: *"How sure can we be about this result?"*

**Secondary display** (on request): The agreement index, answering: *"Do people actually agree?"*

**Expert display:** All three metrics with their underlying components ($\mu$, $\sigma$, $n$, $N$, $q$).

This layered disclosure respects the differing needs of casual participants, engaged stakeholders, and system administrators.

---

## 5. Relationship to Existing Work

### 5.1 Survey Methodology

The confidence index draws directly from three pillars of survey statistics:

1. **The Central Limit Theorem** — justifying the near-independence of sampling precision from population size for large $N$ (Cochran, 1977)
2. **The Finite Population Correction** — adjusting standard errors when the sampling fraction $n/N$ is non-negligible (Kish, 1965)
3. **The Design Effect** — accounting for non-ideal sampling through effective sample size reduction (Kish, 1965; Lohr, 2021)

### 5.2 Bayesian Shrinkage and Rating Systems

The base form $n/(n+k)$ appears in Bayesian approaches to small-sample estimation. The IMDB weighted rating formula uses an identical structure:

$$W = \frac{n}{n + m} \cdot \bar{x} + \frac{m}{n + m} \cdot C$$

where $m$ is the minimum vote threshold and $C$ is the global mean. Our confidence index repurposes this form as a standalone representativeness measure rather than a smoothing weight.

### 5.3 Measures of Agreement

The agreement index relates to several established measures:

- **Coefficient of Variation (CV):** $CV = \sigma / \mu$. Unlike CV, our index is defined when $\mu = 0$ and does not depend on the direction of consensus.
- **Fleiss' Kappa:** Measures inter-rater reliability for categorical ratings. Our index is simpler, being designed for continuous bounded scales.
- **Consensus measures in fuzzy set theory** (Herrera-Viedma et al., 2014): These typically use distance-based measures; our approach uses the simpler and more interpretable normalized standard deviation.

The choice of $1 - \sigma$ prioritizes interpretability over mathematical sophistication, consistent with the Mass Consensus design philosophy of transparency.

---

## 6. Limitations and Future Work

### 6.1 Known Limitations

1. **The calibration constant $c = 5$** is anchored to polling conventions and may require adjustment for deliberative contexts where evaluation complexity differs from survey response.

2. **The quality coefficient $q$** is currently assigned by system administrators rather than computed. Future work could derive $q$ from observable indicators (response time distributions, demographic coverage, dropout rates).

3. **The agreement index $A = 1 - \sigma$** treats all forms of disagreement equivalently. A bimodal distribution (two opposing camps) and a uniform distribution (random opinions) yield similar agreement scores despite representing different deliberative states. Kurtosis-based or entropy-based refinements could address this.

4. **Population estimation** remains a practical challenge. The logarithmic dependence on $N$ provides robustness but does not eliminate the need for a reasonable population estimate.

### 6.2 Future Directions

- **Empirical calibration** of $q$ values through deliberative experiments with known ground truth
- **Dynamic confidence** that updates as participation patterns evolve during a deliberation
- **Distributional shape indicators** beyond $\sigma$ to distinguish polarization from diffuse disagreement
- **Comparative evaluation** against alternative confidence measures (bootstrap confidence intervals, Bayesian credible intervals)

---

## 7. Conclusion and Invitation

This working paper has proposed two companion metrics for the Mass Consensus deliberative framework:

The **Agreement Index** ($A_p = 1 - \sigma_p$) offers a normalized, sample-size-independent measure of evaluator alignment on the $[-1, +1]$ scale.

The **Confidence Index** ($\Gamma_p$) attempts to provide a single measure of sample representativeness that integrates:
- Participation depth through the base form $n/(n+k)$
- Population context through logarithmic scaling of $k$
- Sampling methodology through the quality coefficient $q$
- Finite population adjustment through the classical FPC

The confidence formula is calibrated to align with established survey methodology benchmarks, producing $\Gamma \approx 0.95$ for the canonical case of 1,500 randomly sampled respondents from a large population.

We believe these metrics, together with the consensus score, could enable layered communication of deliberative outcomes: a single confidence percentage for general audiences, an agreement score for engaged stakeholders, and full metric decomposition for analysts.

### An open invitation

This work was developed through iterative discussion between a human researcher and an AI assistant (Claude Code, Anthropic). While we have drawn on established statistical principles and attempted to reason carefully about each design choice, we recognize the limitations of this process. The formulas have not been empirically validated, the calibration constant $c = 5$ is anchored to a single benchmark, and the quality coefficient $q$ remains subjective.

We openly invite the research community to:

- **Scrutinize** the mathematical claims and identify errors or unjustified assumptions
- **Empirically test** these metrics against real deliberative data
- **Propose alternatives** where our choices are suboptimal
- **Collaborate** on developing this preliminary work into a rigorous, peer-reviewed contribution

The goal of the Freedi project is to advance open, transparent, and statistically grounded tools for collective decision-making. We would rather publish an imperfect starting point and benefit from collective wisdom than wait for a polished result that never receives outside examination.

Inquiries and contributions are welcome via the [Freedi project on GitHub](https://github.com/delib-org/FreeDi-sign).

---

## Appendix A: Mathematical Notation Summary

| Symbol | Definition |
|--------|------------|
| $A_p$ | Agreement Index for proposal $p$: $1 - \sigma_p$ |
| $\Gamma_p$ | Confidence Index for proposal $p$ |
| $\sigma_p$ | Sample standard deviation of evaluations for $p$ |
| $\sigma_{max}$ | Maximum possible standard deviation on $[-1, +1]$: equals 1 |
| $n_p$ | Number of evaluators for proposal $p$ |
| $N$ | Target population size |
| $q$ | Sampling quality coefficient, $q \in (0, 1]$ |
| $c$ | Calibration constant (default: 5) |
| $k_{eff}$ | Effective half-confidence parameter: $c \cdot \ln(N) \cdot \frac{N - n_p}{N - 1}$ |
| $FPC$ | Finite Population Correction: $\sqrt{\frac{N - n}{N - 1}}$ |
| $n_{eff}$ | Effective sample size: $n \cdot q$ |

## Appendix B: Implementation Reference

The confidence index can be computed efficiently from three stored values:

```
function confidenceIndex(n, N, q, c = 5):
    if n <= 0: return 0
    if n >= N: return 1

    n_eff = n * q
    fpc_squared = (N - n) / (N - 1)
    k_eff = c * ln(N) * fpc_squared

    return n_eff / (n_eff + k_eff)
```

The agreement index requires only the standard deviation, which is already computed for the consensus score:

```
function agreementIndex(sigma):
    return max(0, 1 - sigma)
```

Both functions are $O(1)$ given precomputed summary statistics ($\sigma$, $n$), adding negligible computational overhead to the existing consensus scoring pipeline.

## Appendix C: Sensitivity Analysis

### C.1 Sensitivity to Calibration Constant $c$

| $c$ | $\Gamma(1500, 2M, 1)$ | $\Gamma(50, 200, 1)$ | $\Gamma(25, 30, 1)$ |
|-----|------------------------|----------------------|---------------------|
| 3 | 0.972 | 0.806 | 0.927 |
| 4 | 0.963 | 0.759 | 0.912 |
| **5** | **0.954** | **0.714** | **0.895** |
| 6 | 0.945 | 0.673 | 0.877 |
| 7 | 0.936 | 0.635 | 0.858 |

The formula is moderately sensitive to $c$ for small samples and relatively insensitive for large samples, which is desirable: the calibration primarily affects edge cases rather than well-sampled results.

### C.2 Sensitivity to Population Misestimation

For $n = 100$, $q = 1$, varying assumed $N$ versus true $N = 10{,}000$:

| Assumed $N$ | $\ln(N)$ | $\Gamma$ | Error vs. truth |
|-------------|----------|----------|----------------|
| 1,000 | 6.91 | 0.743 | +0.07 |
| 5,000 | 8.52 | 0.701 | +0.03 |
| **10,000** | **9.21** | **0.685** | **0** |
| 50,000 | 10.82 | 0.649 | −0.04 |
| 100,000 | 11.51 | 0.635 | −0.05 |

A 10× overestimate or underestimate of $N$ shifts confidence by approximately $\pm 5$ percentage points, confirming the robustness conferred by logarithmic scaling.

---

## References

- Cochran, W. G. (1977). *Sampling Techniques* (3rd ed.). John Wiley & Sons.
- Groves, R. M., Fowler Jr., F. J., Couper, M. P., Lepkowski, J. M., Singer, E., & Tourangeau, R. (2009). *Survey Methodology* (2nd ed.). John Wiley & Sons.
- Herrera-Viedma, E., Cabrerizo, F. J., Kacprzyk, J., & Pedrycz, W. (2014). A review of soft consensus models in a fuzzy environment. *Information Fusion*, 17, 4–13.
- Kish, L. (1965). *Survey Sampling*. John Wiley & Sons.
- Lohr, S. L. (2021). *Sampling: Design and Analysis* (3rd ed.). CRC Press.
- Yaron, T. (2025). Scalable Deliberative Democracy: A Confidence-Adjusted Method for Collective Preference Aggregation. *Unpublished manuscript*.

---

*Working Draft v0.1 — March 2025*
