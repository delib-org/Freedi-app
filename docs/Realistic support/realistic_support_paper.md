# RealisticSupport: A Multi-Dimensional Scoring System for Collective Decision-Making

**Internal Working Paper**  
**FreeDi Project**  
**Date: November 4, 2025**

---

## Executive Summary

This paper introduces **RealisticSupport**, a novel scoring system for evaluating solution proposals in collective decision-making contexts. The system combines three dimensions of crowd wisdom—agreement, corroboration, and risk tolerance—into a single actionable score. This approach addresses a fundamental challenge in democratic deliberation: how to synthesize not just what people want, but also the epistemic quality of evidence supporting those solutions, and what risks they're willing to accept.

**Key Innovation**: Unlike traditional voting systems that rely on subjective confidence, RealisticSupport integrates with FreeDi's **Popper-Hebbian deliberation forum** to generate corroboration scores based on Popperian falsification criteria and Hebbian evidence weighting.

---

## 1. Introduction

### 1.1 The Problem

Traditional voting systems reduce complex collective preferences to binary or ordinal choices. They fail to capture:
- **Epistemic quality**: Popular solutions may lack evidential support
- **Evidence-based reasoning**: Votes don't distinguish between well-supported and poorly-supported claims
- **Risk preferences**: Communities vary in their willingness to take chances

### 1.2 The FreeDi Context

FreeDi facilitates collective decision-making and democratic deliberation. Our system needs to:
- Capture nuanced collective judgment
- Distinguish between "popular but unsupported" and "evidence-based and achievable" solutions
- Incorporate rigorous epistemic standards alongside democratic values
- Respect both majority preferences and the quality of supporting evidence
- Be transparent and explainable to participants

### 1.3 Integration with Popper-Hebbian Deliberation

RealisticSupport is designed to work synergistically with FreeDi's **Popper-Hebbian discussion system**, which:
- Ensures ideas are **falsifiable** (testable and clear) before entering discussion
- Collects **evidence-based arguments** supporting or challenging solutions
- **Weights evidence** by type (data > testimony > logical argument > anecdote)
- **Reinforces quality** through community voting on evidence helpfulness
- Generates a **corroboration score** reflecting how well a solution has survived rigorous testing

This integration means that the "corroboration" (c) dimension in RealisticSupport is not merely subjective confidence, but an **objective measure of epistemic quality** derived from community-validated evidence.

---

## 2. The RealisticSupport Framework

### 2.1 Three Dimensions of Evaluation

We propose that participants evaluate solutions along three independent dimensions:

#### Agreement (a)
- **Range**: -1 to 1
- **Meaning**: How much the participant likes/wants this solution
  - a = 1: Strongly support
  - a = 0: Neutral/indifferent
  - a = -1: Strongly oppose
- **Question to user**: "How much do you like this solution?"

#### Corroboration (c)
- **Range**: 0 to 1
- **Meaning**: The degree to which the solution has survived rigorous falsification attempts, based on the quality and weight of evidence collected through the Popper-Hebbian deliberation forum
  - c = 1: Highly corroborated (strong supporting evidence, successfully survived challenges)
  - c = 0.5: Mixed evidence (both supporting and challenging evidence)
  - c = 0: Strongly challenged (failed falsification tests, weak evidence)
- **Source**: Automatically calculated from:
  - **Evidence posts** (supporting/challenging arguments)
  - **Evidence quality** (data > testimony > argument > anecdote)
  - **Community validation** (helpful/not helpful votes on evidence)
  - **Weighted scoring** (see Section 2.4)

**Critical distinction**: Corroboration is NOT subjective confidence. It is an **epistemic measure** derived from:
1. **Popperian falsification**: Ideas must be testable and survive rigorous challenges
2. **Hebbian weighting**: Evidence quality is reinforced by community validation
3. **Transparent evidence**: All supporting/challenging arguments are visible and weighted

#### Risk Tolerance (r)
- **Range**: -1 to 1
- **Meaning**: Participant's willingness to take risks with this solution
  - r = 1: Risk-seeking (willing to try even if uncertain)
  - r = 0: Risk-neutral
  - r = -1: Risk-averse (only want sure things)
- **Question to user**: "How willing are you to take a chance on this solution?"

### 2.2 Why These Three Dimensions?

**Theoretical Justification:**

1. **Agreement (a)** captures **value alignment**: Does this solution align with our goals and values?

2. **Corroboration (c)** captures **epistemic warrant**: How well has this solution survived rigorous testing according to Popperian falsification criteria?

3. **Risk Tolerance (r)** captures **risk preferences**: Given the epistemic state, what's our appetite for proceeding?

These three factors represent distinct types of judgment:
- Agreement is **normative** (what should we do?)
- Corroboration is **epistemic** (what does the evidence show?)
- Risk tolerance is **dispositional** (how bold should we be given uncertainty?)

By separating these, we allow the crowd to express sophisticated, multi-dimensional wisdom while maintaining rigorous epistemic standards.

**Philosophical Foundation**:

This approach synthesizes three major traditions in epistemology and decision theory:

1. **Popperian Falsificationism** (Corroboration)
   - Karl Popper argued that scientific knowledge advances through attempts to falsify theories
   - Ideas that survive rigorous testing gain corroboration (not "confirmation")
   - Corroboration is a measure of past performance, not future certainty
   - FreeDi's deliberation forum operationalizes this through evidence collection and challenge

2. **Hebbian Learning** (Evidence Weighting)
   - "Neurons that fire together, wire together" - connections strengthen with use
   - Applied to evidence: Arguments repeatedly validated by community gain weight
   - Creates a self-reinforcing library of trusted knowledge
   - FreeDi implements this through vote-based evidence weight adjustment

3. **Democratic Legitimacy** (Agreement & Risk Tolerance)
   - Even well-corroborated solutions need democratic consent
   - Communities have legitimate authority to choose their risk tolerance
   - Epistemic quality doesn't override democratic values
   - The system respects both "what we know" and "what we want"

---

## 3. The Mathematical Model

### 3.1 Corroboration Calculation from Popper-Hebbian Forum

Before we can calculate RealisticSupport, we must understand how corroboration (c) is derived from the deliberation forum.

#### 3.1.1 Evidence Collection

Each solution in FreeDi can receive **evidence posts** from the community:
- Users submit arguments/data **supporting** or **challenging** the solution
- Each evidence post has a **support level**: -1 (strongly challenges) to 1 (strongly supports)
- AI classifies evidence into types with base weights:

| Evidence Type | Base Weight | Rationale |
|--------------|-------------|-----------|
| Data/Research | 3.0 | Empirical studies, peer-reviewed research |
| Testimony | 2.0 | Expert opinions, eyewitness accounts |
| Logical Argument | 1.0 | Reasoned argumentation, logical inference |
| Anecdote | 0.5 | Personal stories, single examples |
| Fallacy | 0.1 | Arguments containing logical errors |

#### 3.1.2 Hebbian Weight Adjustment

Evidence weight is dynamically adjusted based on community validation:

$$w_{\text{final}} = w_{\text{base}} \times \left(1 + \frac{v_{\text{helpful}} - v_{\text{not helpful}}}{10}\right)$$

where:
- $w_{\text{base}}$ is the base weight from evidence type
- $v_{\text{helpful}}$ is the count of "helpful" votes
- $v_{\text{not helpful}}$ is the count of "not helpful" votes
- Minimum final weight: 0.1

**Example**:
- Logical argument (base = 1.0) with 8 helpful, 2 not helpful votes
- Net score = 8 - 2 = 6
- Final weight = 1.0 × (1 + 6/10) = 1.6

This implements Hebbian reinforcement: good evidence gains strength through use.

#### 3.1.3 Weighted Corroboration Score

The total corroboration score for a solution is:

$$S_{\text{total}} = \sum_{i=1}^{n} w_i \times s_i$$

where:
- $w_i$ is the final weight of evidence post $i$
- $s_i$ is the support level of evidence post $i$ (from -1 to 1)
- $n$ is the number of evidence posts

#### 3.1.4 Normalization to [0, 1]

To convert the total score to corroboration value c ∈ [0, 1], we use a sigmoid-like normalization:

$$c = \frac{1}{1 + e^{-k \cdot S_{\text{total}}}}$$

where $k$ is a scaling parameter (typically 0.2) that determines the sensitivity.

**Properties**:
- $S_{\text{total}} = 0$ (neutral evidence) → $c = 0.5$
- $S_{\text{total}} > 0$ (supporting evidence) → $c > 0.5$
- $S_{\text{total}} < 0$ (challenging evidence) → $c < 0.5$
- High positive scores → $c → 1$ (well-corroborated)
- High negative scores → $c → 0$ (falsified/challenged)

**Alternative (Linear) Normalization** (if preferred for interpretability):

$$c = 0.5 + \frac{S_{\text{total}}}{2 \times S_{\text{max}}}$$

where $S_{\text{max}}$ is a calibration constant (e.g., 10) representing a "strongly corroborated" threshold.

**Why This Works**:
1. **Popperian**: Solutions that survive challenges gain high c scores
2. **Hebbian**: Quality evidence (validated by community) has more influence
3. **Transparent**: All evidence and weights are visible to participants
4. **Dynamic**: c updates in real-time as new evidence arrives
5. **Objective**: Not based on subjective feelings, but on evidence quality

### 3.2 Readiness Score

First, we combine corroboration and risk tolerance into a **Readiness** score:

$$\text{Readiness}(r,c) = c + (1-c) \cdot \frac{r+1}{2}$$

where:
- $r \in [-1, 1]$ is risk tolerance
- $c \in [0, 1]$ is corroboration (from Popper-Hebbian forum)
- $\text{Readiness}(r,c) \in [0, 1]$

**Intuition**: 
- If evidence is strong (c ≈ 1), readiness is high regardless of risk tolerance
- If evidence is weak (c ≈ 0), risk tolerance determines readiness
- This captures: "We're ready if evidence supports it OR if we're willing to take the chance"

**Boundary Conditions**:
- High corroboration + high risk tolerance: Readiness = 1
- High corroboration + low risk tolerance: Readiness = 1 (evidence dominates)
- Low corroboration + high risk tolerance: Readiness = 1 (risk tolerance compensates)
- Low corroboration + low risk tolerance: Readiness = 0 (neither factor supports proceeding)

### 3.3 RealisticSupport Score

The final **RealisticSupport** score combines agreement with readiness:

$$\text{RealisticSupport}(a,r,c) = \begin{cases} 
a \cdot \text{Readiness}(r,c) & \text{if } a > 0 \\
a & \text{if } a \leq 0
\end{cases}$$

Expanding the readiness term:

$$\text{RealisticSupport}(a,r,c) = \begin{cases} 
a \cdot \left[c + (1-c) \cdot \frac{r+1}{2}\right] & \text{if } a > 0 \\
a & \text{if } a \leq 0
\end{cases}$$

**Key Properties**:
- Range: [-1, 1]
- For positive agreement, the score is modulated by readiness
- For negative agreement (opposition), readiness is ignored

### 3.4 Normalization to [0, 1]

For display purposes, we can normalize to [0, 1]:

$$\text{RealisticSupport}_{\text{normalized}} = \frac{\text{RealisticSupport} + 1}{2}$$

This maps:
- -1 → 0 (complete opposition)
- 0 → 0.5 (neutral)
- 1 → 1 (complete support with full readiness)

---

## 4. Design Rationale

### 4.1 Why Ignore Readiness for Negative Agreement?

When $a \leq 0$ (people oppose a solution), we return simply $a$, ignoring corroboration and risk tolerance.

**Rationale**:
1. **Democratic principle**: If people don't want something, epistemic quality is irrelevant
2. **Prevents technocratic override**: A solution shouldn't gain legitimacy just because "the evidence supports it" if people oppose it on value grounds
3. **Simplicity**: Opposition is a clear signal that doesn't need nuance
4. **Avoids perverse incentives**: Otherwise, well-corroborated but unwanted solutions could score better than they should

**Example**: 
- A surveillance system (a = -0.8) with strong evidence it reduces crime (c = 0.9) should still score -0.8, not some tempered value
- The community may oppose it on privacy grounds regardless of its proven effectiveness
- Democratic values trump epistemic warrant

### 4.2 Why Corroboration Dominates Risk Tolerance?

In the readiness formula, when corroboration is high, risk tolerance becomes irrelevant.

**Rationale**:
1. **Evidence resolves uncertainty**: If evidence strongly supports something, risk preference doesn't apply
2. **Risk is about epistemic uncertainty**: Risk tolerance only matters when evidence is weak or mixed
3. **Prevents over-weighting risk seeking**: Without this, risk-seeking people could push through anything regardless of evidence

**Example**:
- If evidence strongly corroborates a solution (c = 0.9), it shouldn't matter if some people are risk-averse (r = -1)
- The risk-averse should be reassured by the evidence, not penalized for their disposition
- Epistemic warrant reduces perceived risk

### 4.3 Why Risk Tolerance Can Fully Compensate for Low Corroboration?

When $c = 0$ and $r = 1$, readiness = 1.

**Rationale**:
1. **Innovation requires experimentation**: Some valuable solutions lack existing evidence
2. **Democratic right to experiment**: Communities should be able to choose bold experiments even without strong corroboration
3. **Prevents epistemic paralysis**: Without this, low corroboration always kills proposals
4. **Legitimate value pluralism**: Sometimes communities value trying new things over proven approaches

**Example**:
- A novel participatory budgeting approach (c = 0.2) in a community with high risk tolerance (r = 0.8) can still proceed
- Early-stage pilots often have weak corroboration but high community willingness to experiment
- Innovation requires accepting epistemic uncertainty

**Important caveat**: This assumes the solution has at least been refined through the Popper-Hebbian system to be testable and falsifiable. It's not about accepting vague or incoherent ideas, but about accepting testable ideas with limited evidence.

---

## 5. Behavioral Examples

### 5.1 Scenario Analysis

| Scenario | a | c | r | Readiness | RealisticSupport | Interpretation |
|----------|---|---|---|-----------|------------------|----------------|
| **Loved & Well-Corroborated** | 0.9 | 0.9 | 0.5 | 0.95 | 0.86 | Strong support for an evidence-backed solution |
| **Loved but Poorly Corroborated** | 0.9 | 0.3 | -0.5 | 0.39 | 0.35 | Popular idea but weak evidence and risk-averse → proceed cautiously |
| **Loved, Weak Evidence, Bold** | 0.9 | 0.3 | 0.9 | 0.96 | 0.86 | Popular idea, weak evidence, but risk-seeking → high support |
| **Moderately Liked & Well-Tested** | 0.5 | 0.8 | -0.8 | 0.82 | 0.41 | Modest support for a well-corroborated solution |
| **Disliked but Well-Corroborated** | -0.6 | 0.9 | 0.8 | 0.99 | -0.6 | Opposed despite evidence → rejected on value grounds |
| **Strongly Opposed** | -0.9 | 0.1 | -0.9 | 0.10 | -0.9 | Strong opposition → rejected regardless |
| **Neutral & Poorly Tested** | 0.1 | 0.2 | 0.0 | 0.60 | 0.06 | Weak support, little evidence, neutral risk → low priority |

### 5.2 Key Insights from Examples

1. **High agreement needs epistemic warrant**: Even loved solutions (a = 0.9) score poorly if both corroboration and risk tolerance are low
2. **Risk tolerance enables innovation**: Weak corroboration can be overcome by risk-seeking attitudes
3. **Opposition is decisive**: Negative agreement cannot be rescued by strong evidence
4. **Corroboration is reassuring**: Strong evidence elevates support even with risk aversion
5. **Evidence quality matters**: Unlike subjective confidence, corroboration reflects actual testing and validation

---

## 6. Aggregation Across Participants

### 6.1 The Complete Architecture

RealisticSupport operates within FreeDi's complete decision-making architecture:

```
┌──────────────────────────────────────────────┐
│         1. Question Posed                     │
│  "What should we do about X?"                 │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│    2. Solution Proposals (with AI Refinery)   │
│  - Ideas refined to be testable/falsifiable   │
│  - Clear, specific, and evaluable             │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│    3. Popper-Hebbian Deliberation Forum       │
│  - Evidence collection (support/challenge)    │
│  - Evidence type classification (AI)          │
│  - Community validation (helpful votes)       │
│  - Weighted scoring → Corroboration (c)       │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│    4. Participant Evaluation                  │
│  - Agreement (a): Do I want this?             │
│  - Risk Tolerance (r): Willing to try?        │
│  - Corroboration (c): From forum (automatic)  │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│    5. RealisticSupport Calculation            │
│  - Individual: RS(a_i, r_i, c)                │
│  - Aggregate: RS(ā, r̄, c)                     │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│    6. Decision & Implementation               │
│  - Solutions ranked by RealisticSupport       │
│  - Community chooses based on scores          │
│  - Transparent rationale for each solution    │
└──────────────────────────────────────────────┘
```

**Key Insight**: Corroboration (c) is **shared** across all participants because it derives from the collective deliberation forum. Agreement (a) and risk tolerance (r) are **individual** because they represent personal values and dispositions.

### 6.2 Individual vs. Collective Scores

**Option A: Aggregate Inputs, Then Calculate** (RECOMMENDED)
1. Corroboration (c) is already shared: derived from the deliberation forum
2. Calculate mean agreement: $\bar{a} = \frac{1}{n}\sum_i a_i$
3. Calculate mean risk tolerance: $\bar{r} = \frac{1}{n}\sum_i r_i$
4. Compute: $\text{RealisticSupport}(\bar{a}, \bar{r}, c)$

**Option B: Calculate Individual Scores, Then Aggregate**
1. For each person i: $\text{RealisticSupport}_i(a_i, r_i, c)$ (using shared c)
2. Aggregate: $\overline{\text{RealisticSupport}} = \frac{1}{n}\sum_i \text{RealisticSupport}_i$

**Recommendation**: **Option A** (aggregate inputs first)

**Rationale**:
- Preserves the semantic meaning of the crowd's collective judgment
- Corroboration is already collective (same c for everyone)
- Prevents edge cases where individual piecewise functions create artifacts
- More interpretable: "The crowd has mean agreement of 0.7 and mean risk tolerance of 0.3..."
- Simpler to explain and visualize

**Mathematical Equivalence Note**: When c is constant (shared), Options A and B are mathematically equivalent for positive agreement. However, the piecewise structure at a=0 can create slight differences, making Option A cleaner.

### 6.3 Weighted Aggregation

For some contexts, we may want to weight participants:

$$\bar{a} = \frac{\sum_i w_i \cdot a_i}{\sum_i w_i}$$

Where weights $w_i$ could be based on:
- **Stake**: Those more affected get higher weight
- **Expertise**: Domain knowledge for technical solutions
- **Participation**: Active participants vs. passive voters
- **Representation**: Ensuring minority voices aren't drowned out

**Default**: Equal weights ($w_i = 1$ for all i) unless context requires otherwise

---

## 7. Comparison to Alternative Approaches

### 7.1 Simple Majority Voting
**Limitation**: Doesn't capture epistemic quality or intensity of preference

**RealisticSupport advantage**: Distinguishes "enthusiastic with strong evidence" from "supportive but unproven"

### 7.2 Approval Voting
**Limitation**: Binary (approve/disapprove) without nuance or evidence

**RealisticSupport advantage**: Continuous scale capturing degrees of support, evidence quality, and readiness

### 7.3 Quadratic Voting
**Similarity**: Both capture intensity of preference

**RealisticSupport advantage**: Also captures epistemic quality through Popper-Hebbian forum and risk preferences

**Quadratic Voting advantage**: Has built-in mechanism against strategic voting (via cost)

### 7.4 Prediction Markets / Futarchy
**Similarity**: Both try to incorporate beliefs about outcomes

**RealisticSupport advantage**: 
- Simpler, doesn't require monetary stakes
- Captures values (agreement) not just predictions
- Transparent evidence base through deliberation forum
- Democratic participation without financial barriers

**Prediction Markets advantage**: 
- Incentivizes accurate forecasting through money
- Self-correcting through arbitrage

### 7.5 Delphi Method / Expert Panels
**Similarity**: Both use structured deliberation and evidence

**RealisticSupport advantage**:
- Democratic participation, not just experts
- Transparent evidence weighting
- Community validates evidence quality
- Respects both expertise (through evidence) and democratic values

**Delphi advantage**: 
- Can leverage deep expertise
- Less vulnerable to misinformation
- Faster for technical decisions

### 7.6 Deliberative Polling
**Similarity**: Both involve structured deliberation before voting

**RealisticSupport advantage**:
- Permanent evidence library (Hebbian reinforcement)
- Quantified corroboration scores
- Systematic falsification testing
- Risk tolerance as explicit input

**Deliberative Polling advantage**:
- Face-to-face deliberation can build trust
- Moderated to ensure quality discussion

**Key Differentiator**: RealisticSupport is the only system that combines:
1. Rigorous epistemic standards (Popperian falsification)
2. Evidence quality weighting (Hebbian reinforcement)
3. Democratic legitimacy (agreement and risk tolerance)
4. Transparent, algorithmic scoring

---

## 8. Implementation Considerations

### 8.1 User Interface Design

**Three-Input Approach**:
```
How much do you support this solution?
[Strongly Oppose] ←———————|———————→ [Strongly Support]
         -1              0              1

How willing are you to take a chance on it?
[Risk Averse] ←———————|———————→ [Risk Seeking]
     -1              0              1

Evidence Quality (Corroboration): 0.73
[Automatically calculated from deliberation forum]
└─ View Evidence → [links to Popper-Hebbian discussion]
```

**Corroboration Display**:
Instead of asking users about corroboration, **show** them:
- Current corroboration score (c = 0.73)
- Visual indicator (progress bar colored by quality)
- Link to view full evidence breakdown
- Number of supporting/challenging evidence posts
- Top-weighted evidence items

**Example Corroboration Panel**:
```
┌─────────────────────────────────────────┐
│ Evidence Quality: 73% Corroborated      │
│ ████████████████░░░░░░                  │
│                                         │
│ 5 Supporting Arguments (avg weight 2.1) │
│ 2 Challenging Arguments (avg weight 1.4)│
│                                         │
│ [View Full Evidence Discussion]         │
└─────────────────────────────────────────┘
```

**Alternative: Simplified Two-Factor**:
For simpler contexts without the Popper-Hebbian forum, could show just (a, r) and set c = 0.5 (neutral) for everyone.

### 8.2 Transparency and Explanation

**Show users**:
1. Their individual inputs: a, r
2. The shared corroboration score: c (with evidence breakdown)
3. Their personal RealisticSupport score
4. The crowd averages: $\bar{a}, \bar{r}, c$
5. The collective RealisticSupport score
6. A visual breakdown of how the score is calculated

**Example visualization**:
```
Your Support: ████████░░ 0.8
Crowd Support: ██████░░░░ 0.6

Evidence Corroboration: ███████░░░ 0.7
├─ 5 supporting arguments (weighted)
├─ 2 challenging arguments (weighted)
└─ Net corroboration score: 0.7

Risk Tolerance (You): ████░░░░░░ 0.4
Risk Tolerance (Crowd): ██████░░░░ 0.6

→ Your Readiness: ███████░░░ 0.74
→ Crowd Readiness: ████████░░ 0.76

Your RealisticSupport: ██████░░░░ 0.59
Collective RealisticSupport: █████░░░░░ 0.46
```

**Critical**: Always provide a link to the Popper-Hebbian deliberation forum so users can:
- See all evidence posts
- Understand why c has its current value  
- Contribute their own evidence
- Vote on evidence quality

### 8.3 Handling Edge Cases

**What if corroboration is very low (c < 0.3) because evidence strongly challenges the solution?**
- This is working as intended - the solution is being falsified
- Low c + low r → low readiness → low RealisticSupport
- System should prompt: "Strong challenges suggest reconsidering this solution"
- Option: Allow solution evolution (submit improved version)

**What if everyone is risk-averse (r < 0) and corroboration is mixed (c ≈ 0.5)?**
- Readiness will be moderate → RealisticSupport will depend on agreement
- Interpretation: Need either better evidence OR more risk appetite to proceed
- System should prompt: "Consider gathering more evidence or refining the solution"

**What if agreement is polarized (some high a, some low a)?**
- The mean $\bar{a}$ might be near zero
- RealisticSupport will be near zero
- Interpretation: No consensus → need more deliberation
- Consider: Also showing distribution/variance of a to reveal polarization

**What if corroboration is high (c > 0.8) but based on only a few evidence posts?**
- This could indicate insufficient challenge attempts
- Consider: Weight corroboration by number of independent evidence sources
- Alternative: Show "confidence interval" around c based on evidence count
- System prompt: "Invite more perspectives to strengthen this assessment"

**What if people try to game the system by posting fake evidence?**
- Hebbian weighting mitigates this: community votes determine evidence weight
- Fallacious arguments automatically get low weight (0.1 base)
- Pattern detection: Flag users who consistently post low-quality evidence
- Transparent attribution: All evidence is author-attributed and auditable

**What if no one has submitted evidence yet (empty deliberation forum)?**
- Default: c = 0.5 (neutral/unknown)
- System should prominently prompt: "This solution needs evidence - be the first to contribute!"
- Lower uncertainty bound on readiness calculation
- Consider: Require minimum evidence threshold before allowing votes

---

## 9. Validation and Testing

### 9.1 Proposed Pilot Approach

**Phase 1: Internal Testing**
- Use with FreeDi team for internal decisions
- Collect feedback on intuitiveness and trust
- Compare to simple majority voting

**Phase 2: Small Group Pilots**
- Deploy with 2-3 friendly communities (e.g., Karkur project)
- A/B test: RealisticSupport vs. traditional voting
- Measure: User comprehension, satisfaction, decision quality

**Phase 3: Refinement**
- Adjust based on feedback
- Consider simplifications (e.g., remove r dimension if too complex)
- Develop best practices for different contexts

### 9.2 Metrics for Evaluation

**Usability**:
- Can participants explain what a, c, r mean?
- Do they trust the resulting scores?
- How long does it take to input scores?

**Decision Quality**:
- Do decisions made with RealisticSupport lead to better outcomes?
- Are solutions that score high on RealisticSupport more likely to succeed?
- Do participants feel the system captured their preferences accurately?

**Comparison Benchmarks**:
- Agreement between RealisticSupport and simple majority
- Cases where they diverge and which led to better outcomes
- Participant satisfaction with decision process

---

## 10. Theoretical Foundations

### 10.1 Popperian Falsificationism and Corroboration

Karl Popper's philosophy of science provides the epistemic foundation for the corroboration dimension.

#### 10.1.1 Core Popperian Principles

**Falsifiability as Demarcation**:
- Scientific claims must be **testable** - they must make specific predictions that could be proven wrong
- Vague, unfalsifiable claims ("This will make things better") cannot accumulate knowledge
- FreeDi's AI Refinery ensures solutions are refined to be testable before entering discussion

**Corroboration vs. Confirmation**:
- Popper rejected "confirmation" - we never prove theories true
- Instead, theories gain **corroboration** by surviving rigorous falsification attempts
- Corroboration is a **historical record** of how well an idea has been tested, not a probability it's true
- FreeDi's deliberation forum tracks this testing history through evidence posts

**Critical Rationalism**:
- Knowledge grows through **conjecture and refutation**
- We propose bold ideas, then try to falsify them
- Ideas that survive become tentatively accepted (but always open to future challenge)
- This is operationalized through supporting/challenging evidence posts

#### 10.1.2 Application to Democratic Decision-Making

Traditional interpretations of Popper's work emphasize scientific theory-testing. FreeDi extends this to **practical proposals**:

**Solutions as Conjectures**:
- Each solution proposal is a conjecture: "This approach will address the problem"
- Must be specific enough to test (hence the AI Refinery)
- Must make predictions that could be challenged with evidence

**Evidence as Falsification Attempts**:
- Challenging evidence tries to falsify the proposal
- Supporting evidence shows the proposal survives certain tests
- Both types accumulate to form corroboration score

**Community as Critical Community**:
- Popper emphasized the social nature of science - knowledge grows through critical discussion
- FreeDi implements this through the deliberation forum
- Voting on evidence quality implements peer review

**Key Insight**: Democratic decisions can and should be subject to the same epistemic standards as scientific knowledge. Communities deserve evidence-based decision-making, not just preference aggregation.

### 10.2 Connection to Decision Theory

RealisticSupport can be viewed as a sophisticated form of **Expected Value** calculation under uncertainty with epistemic grounding:

Traditional expected value: $EV = p \cdot V$

RealisticSupport for positive agreement: $RS = a \cdot \text{Readiness}(r,c)$

**Differences**:
1. **Probability vs. Corroboration**: Traditional EV uses subjective probability; RealisticSupport uses Popperian corroboration derived from evidence
2. **Risk Attitude**: Traditional EV assumes risk neutrality; RealisticSupport explicitly incorporates risk preferences
3. **Value vs. Agreement**: Traditional EV uses outcome utility; RealisticSupport uses democratic agreement

**Advantages**:
- More epistemically rigorous than subjective probability
- Respects both evidence quality and democratic values  
- Transparent evidence basis for "probability" assessment
- Adaptive to community risk culture

### 10.3 Hebbian Reinforcement Learning

The evidence weighting system implements principles from Hebbian learning theory:

**"Neurons that fire together, wire together"**:
- Donald Hebb's principle: Neural connections strengthen through repeated activation
- Applied to evidence: Arguments repeatedly validated by community gain weight
- Creates self-reinforcing library of trusted knowledge

**Application in FreeDi**:

$$w_{\text{final}} = w_{\text{base}} \times \left(1 + \frac{v_{\text{net}}}{10}\right)$$

- Evidence that receives positive validation (helpful votes) gains weight
- Weight increases are multiplicative, creating compounding returns
- High-quality evidence becomes more influential over time
- Poor evidence decays in influence (but doesn't disappear - transparency preserved)

**Epistemic Benefits**:
1. **Quality filtering**: Good arguments naturally rise to prominence
2. **Knowledge accumulation**: Evidence library grows in reliability
3. **Efficiency**: Repeated discussions benefit from past validated arguments
4. **Resilience**: Robust to individual bad actors (community vote aggregates)

**Differences from Neural Hebbian Learning**:
- Explicit, not implicit (all weights visible)
- Normative (community judges quality), not merely associative
- Preserves minority evidence (doesn't eliminate unpopular views)
- Bounded reinforcement (diminishing returns prevent runaway weights)

### 10.4 Connection to Collective Intelligence

RealisticSupport aggregates three types of collective wisdom:

1. **Normative consensus** (agreement): What should we do?
   - Reflects shared values and preferences
   - Democratic legitimacy requirement

2. **Epistemic consensus** (corroboration): What does evidence show?
   - Reflects quality of arguments and testing
   - Epistemic warrant requirement

3. **Risk culture consensus** (risk tolerance): What chances should we take?
   - Reflects community disposition toward uncertainty
   - Cultural/contextual appropriateness

This tripartite structure aligns with theories of collective intelligence that emphasize:
- **Diversity of perspectives**: Different people contribute to (a), (r), and forum evidence
- **Independence**: Corroboration derives from evidence, not votes
- **Aggregation mechanisms**: Mathematical combination preserves information
- **Decentralization**: No central authority determines what's corroborated

### 10.5 Democratic Theory Implications

**Deliberative Democracy**:
- System encourages reflection on multiple dimensions
- Evidence-based deliberation (Popper-Hebbian forum) precedes voting
- Visible corroboration scores facilitate informed discussion
- Participants must engage with evidence, not just express preferences

**Epistemic Democracy**:
- Treats crowd as having both value judgments AND knowledge
- Respects both "what we want" (agreement) and "what we know" (corroboration)
- Risk tolerance as legitimate democratic input, not expert determination
- Evidence quality matters, but doesn't override democratic values

**Responsive to Criticism**:
1. **"Experts should decide"**: RealisticSupport respects expertise (through evidence quality) while preserving democratic participation
2. **"Majority rule is tyranny"**: Opposition (a < 0) cannot be overridden by evidence
3. **"Evidence doesn't matter to voters"**: Corroboration is explicit and weighted in final scores
4. **"Communities are too risk-averse"**: Risk tolerance is an explicit, adjustable input

**Limitations**:
- Still relies on aggregation (less purely deliberative than consensus processes)
- May favor solutions with broad weak support over narrow strong support
- Doesn't capture complex trade-offs or conditional preferences
- Requires literacy in evidence evaluation
- Assumes participants act in good faith

---

## 11. Open Questions and Future Work

### 11.1 Unresolved Design Questions

1. **Corroboration normalization method**:
   - Current: Sigmoid function for smooth scaling
   - Alternative: Linear scaling with calibration constant
   - Alternative: Percentile-based (c = percentile rank among all solutions)
   - Trade-off: Interpretability vs. mathematical properties

2. **Should r be solution-specific or person-specific?**
   - Current model: r varies per solution (people can be risk-seeking for some, risk-averse for others)
   - Alternative: r is a person's trait (risk tolerance profile applied uniformly)
   - Trade-off: Flexibility vs. consistency

3. **Should we allow asymmetric readiness for positive/negative agreement?**
   - Current: Readiness only matters for a > 0
   - Alternative: Different readiness formulas for support vs. opposition
   - Example: Opposition with high corroboration might be stronger signal
   - Consideration: "I oppose this BECAUSE the evidence shows it fails"

4. **How to handle abstentions?**
   - Should non-voters be treated as a = 0, or excluded entirely?
   - Does abstention signal "don't know" or "don't care"?
   - Should there be explicit "abstain" option distinct from a = 0?

5. **Corroboration decay and updating**:
   - Should old evidence lose weight over time?
   - How to handle new evidence that contradicts old validated evidence?
   - Should corroboration be context-dependent (same solution, different community)?

6. **Minimum evidence threshold**:
   - Should solutions need minimum number of evidence posts before voting?
   - What's the default c when no evidence exists yet?
   - How to balance "need more evidence" vs. "innovation requires experimentation"?

7. **Evidence diversity**:
   - Should corroboration account for diversity of evidence sources?
   - Is 10 similar arguments better or worse than 3 diverse ones?
   - How to prevent echo chambers in evidence collection?

### 11.2 Extensions and Variations

**Conditional Corroboration**:
- Different c values for different success criteria (cost, timeline, impact)
- Solution might be well-corroborated for feasibility but not for desirability
- Multi-dimensional corroboration vector instead of single score

**Contextualized Evidence**:
- Evidence that's corroborated in one community may not transfer to another
- Need for context tags: "This evidence applies to [urban/rural/large/small] contexts"
- Adaptive corroboration based on similarity to current context

**Temporal Dynamics**:
- Short-term vs. long-term corroboration
- Evidence quality may change as circumstances evolve
- Need for evidence versioning and "as of date" corroboration

**Cross-Solution Evidence Library**:
- Evidence about "participatory budgeting" could apply to multiple budget solutions
- Build reusable evidence base across related solutions
- Requires evidence tagging and cross-referencing system

**Learning from Implementation**:
- When solutions are actually implemented, track outcomes
- Feedback loop: Did well-corroborated solutions actually work?
- Use real-world results to calibrate corroboration weights

**Integration with Prediction Markets**:
- Combine Popperian corroboration with monetary prediction markets
- Use market prices to weight evidence or validate corroboration scores
- Could provide additional epistemic warrant

### 11.3 Research Questions

1. **Empirical validation**: 
   - Do high RealisticSupport solutions actually succeed more often?
   - Correlation between corroboration score and real-world outcomes?
   - Comparison to expert predictions

2. **Strategic behavior**: 
   - How do participants game the system if at all?
   - Can coordinated groups manipulate corroboration through evidence flooding?
   - Effect of visible scoring on evidence submission patterns

3. **Cultural variation**: 
   - Does the formula work across different risk cultures?
   - Do Popperian falsification standards translate across epistemologies?
   - Eastern vs. Western vs. Indigenous knowledge frameworks

4. **Cognitive load**: 
   - Is three-dimensional rating too complex for most users?
   - Do users understand corroboration vs. personal confidence?
   - Optimal UI for displaying evidence and scores

5. **Comparison studies**: 
   - Head-to-head tests against other voting systems
   - Which types of decisions benefit most from RealisticSupport?
   - When is simpler voting sufficient?

6. **Evidence quality convergence**:
   - Do Hebbian weights converge to "true" quality over time?
   - How many votes needed for reliable evidence weighting?
   - Risk of early-mover advantage in evidence posting?

7. **Scalability**:
   - Does the system work with thousands of participants?
   - How to manage evidence overflow (hundreds of posts per solution)?
   - Need for evidence summarization or clustering?

8. **Epistemic diversity**:
   - Do minority perspectives get adequate weight?
   - Risk of epistemic injustice through majority evidence validation?
   - How to preserve heterodox evidence?

### 11.4 Technical Development Priorities

**Phase 1: Core Integration** (Q1 2026)
- Finalize corroboration calculation method
- Implement RealisticSupport in FreeDi with Popper-Hebbian forum
- Basic UI for displaying corroboration breakdown
- User testing with Karkur and Modesto pilots

**Phase 2: Refinement** (Q2 2026)
- Evidence diversity metrics
- Minimum evidence thresholds
- Improved corroboration visualization
- A/B testing different normalization methods

**Phase 3: Advanced Features** (Q3-Q4 2026)
- Cross-solution evidence library
- Temporal evidence tracking
- Outcome feedback loops
- Evidence summarization with AI

**Phase 4: Research & Validation** (2027+)
- Academic partnerships for rigorous evaluation
- Comparison studies with other voting systems
- Cultural adaptation research
- Publication of findings

---

## 12. Conclusion

RealisticSupport represents a fundamental advance in collective decision-making systems by synthesizing rigorous epistemology with democratic participation:

### 12.1 Key Innovations

1. **Epistemic Rigor**: Corroboration based on Popperian falsification criteria, not subjective confidence
2. **Evidence Quality**: Hebbian weighting ensures good arguments gain influence
3. **Democratic Values**: Agreement and risk tolerance preserve community autonomy
4. **Transparency**: All evidence, weights, and calculations visible to participants
5. **Integration**: Seamless connection with FreeDi's Popper-Hebbian deliberation forum

### 12.2 Theoretical Contributions

**To Epistemology**:
- Operationalizes Popperian falsification for practical decisions (not just scientific theories)
- Demonstrates collective evidence evaluation at scale
- Shows how Hebbian reinforcement can implement critical rationalism

**To Democratic Theory**:
- Reconciles epistemic standards with democratic legitimacy
- Respects both "what we know" and "what we want"
- Makes risk tolerance an explicit democratic input
- Prevents technocratic override of democratic values

**To Decision Science**:
- Three-dimensional evaluation more sophisticated than binary voting
- Evidence-based corroboration more rigorous than subjective confidence
- Risk preferences explicitly incorporated
- Maintains interpretability while capturing complexity

### 12.3 Success Criteria

**Technical**:
- Users understand corroboration scores (>80% comprehension)
- Evidence posting rate (>3 posts per solution on average)
- Corroboration calculation performance (<1s update time)

**Epistemic**:
- High-corroboration solutions have better outcomes (>60% success rate)
- Evidence quality improves over time (Hebbian weights converge)
- Diverse evidence perspectives represented (not echo chambers)

**Democratic**:
- Participant satisfaction with decision process (>70% positive)
- Perceived fairness (values and evidence both matter)
- Adoption rate in pilot communities (sustained use)

### 12.4 Vision

RealisticSupport aspires to become a new standard for democratic decision-making that:
- **Respects intelligence**: Communities are capable of evidence-based reasoning
- **Respects values**: Democracy isn't technocracy
- **Respects uncertainty**: Risk tolerance is a legitimate input
- **Respects transparency**: All reasoning is visible and contestable

By combining Popperian epistemology, Hebbian learning, and democratic participation, FreeDi can offer something genuinely new: **rational democracy** where evidence matters but doesn't dictate, where expertise informs but doesn't override, and where communities can make sophisticated decisions while remaining democratic.

**This is not just a voting system. It's a framework for collective rationality.**

---

## 13. References and Further Reading

### Primary Sources

**Karl Popper**:
- *The Logic of Scientific Discovery* (1959) - Falsificationism and corroboration
- *Conjectures and Refutations* (1963) - Growth of knowledge through criticism
- *Objective Knowledge* (1972) - Evolutionary epistemology
- *The Open Society and Its Enemies* (1945) - Democratic theory and critical rationalism

**Donald Hebb**:
- *The Organization of Behavior* (1949) - Hebbian learning principles
- Neural plasticity and reinforcement learning foundations

### Democratic Theory

- Landemore, H. *Democratic Reason* (2013) - Epistemic democracy
- Fishkin, J. *Democracy When the People Are Thinking* (2018) - Deliberative polling
- Estlund, D. *Democratic Authority* (2008) - Epistemic justification of democracy
- Gutmann, A. & Thompson, D. *Why Deliberative Democracy?* (2004)

### Decision Theory and Collective Intelligence

- Sunstein, C. *Infotopia* (2006) - Wisdom of crowds and information aggregation
- Page, S. *The Difference* (2007) - Diversity and collective intelligence
- Tetlock, P. *Superforecasting* (2015) - Accuracy in prediction
- Arrow, K. *Social Choice and Individual Values* (1951) - Impossibility theorem

### Relevant FreeDi Documentation

- *Popper-Hebbian Discussion System - Complete Guide* (2025) - Implementation details
- FreeDi MON/SON Algorithm Documentation - Hierarchical voting context
- FreeDi Vision and Mission Statements - Overall project goals

### Related Systems and Comparisons

- Quadratic Voting (Weyl & Posner)
- Futarchy and Prediction Markets (Hanson)
- Delphi Method (Rand Corporation)
- Deliberative Polling (Fishkin)
- Liquid Democracy (various implementations)
- Users understand and trust the system
- Decisions made lead to better outcomes than simple voting
- The system becomes a model for other democratic decision platforms

---

## Appendices

### Appendix A: Mathematical Proofs

**Theorem 1**: $\text{Readiness}(r,c) \in [0,1]$ for all $r \in [-1,1], c \in [0,1]$

*Proof*:
Let $\text{Readiness}(r,c) = c + (1-c) \cdot \frac{r+1}{2}$

Minimum: When $r = -1, c = 0$:
$$\text{Readiness} = 0 + 1 \cdot \frac{-1+1}{2} = 0$$

Maximum: When $r = 1$ or $c = 1$:
- If $c = 1$: $\text{Readiness} = 1 + 0 = 1$
- If $r = 1, c = 0$: $\text{Readiness} = 0 + 1 \cdot 1 = 1$

Monotonicity: $\frac{\partial \text{Readiness}}{\partial c} = 1 - \frac{r+1}{2} + \frac{r+1}{2} = 1 > 0$

Therefore Readiness is bounded in [0,1]. ∎

**Theorem 2**: $\text{RealisticSupport}(a,r,c) \in [-1,1]$ for all valid inputs

*Proof*:
For $a \leq 0$: $\text{RS} = a \in [-1, 0] \subset [-1,1]$ ✓

For $a > 0$: $\text{RS} = a \cdot \text{Readiness}(r,c)$
- Since $a \in (0, 1]$ and $\text{Readiness} \in [0,1]$
- We have $\text{RS} \in [0, 1] \subset [-1,1]$ ✓ ∎

### Appendix B: Alternative Readiness Formulas Considered

**1. Simple Maximum**:
$$\text{Readiness}_1 = \max(c, \frac{r+1}{2})$$

*Rejected because*: Treats c and r as substitutes; doesn't prioritize confidence

**2. Weighted Sum**:
$$\text{Readiness}_2 = \alpha \cdot c + (1-\alpha) \cdot \frac{r+1}{2}$$

*Rejected because*: No clear rationale for choosing α; treats factors as independent

**3. Multiplicative**:
$$\text{Readiness}_3 = c \cdot \frac{r+1}{2} + (1-c) \cdot \frac{r+1}{2}$$

*Simplifies to*: Just $\frac{r+1}{2}$, which ignores confidence entirely

**4. Selected Formula**:
$$\text{Readiness} = c + (1-c) \cdot \frac{r+1}{2}$$

*Advantages*:
- Confidence dominates when high
- Risk tolerance matters when confidence is low
- Intuitive interpretation
- Smooth transitions

### Appendix C: Notation Summary

| Symbol | Name | Range | Meaning |
|--------|------|-------|---------|
| $a$ | Agreement | $[-1, 1]$ | How much participant likes the solution |
| $c$ | Corroboration | $[0, 1]$ | Epistemic quality from Popper-Hebbian forum |
| $r$ | Risk Tolerance | $[-1, 1]$ | Willingness to take risks |
| $\text{Readiness}(r,c)$ | Readiness | $[0, 1]$ | Combined corroboration and risk appetite |
| $\text{RS}(a,r,c)$ | RealisticSupport | $[-1, 1]$ | Final evaluation score |
| $\bar{a}, \bar{r}$ | Mean values | — | Average across participants |
| $c$ | Corroboration | $[0, 1]$ | Shared across all participants (from forum) |
| $w_i$ | Weight | $[0, \infty)$ | Participant i's weight in aggregation |
| $w_{\text{evidence}}$ | Evidence Weight | $[0.1, \infty)$ | Weight of evidence post in forum |
| $S_{\text{total}}$ | Total Score | $\mathbb{R}$ | Weighted sum of evidence (before normalization) |

### Appendix D: Implementation Pseudocode

```python
def calculate_readiness(r: float, c: float) -> float:
    """
    Calculate readiness from risk tolerance and corroboration.
    
    Args:
        r: Risk tolerance in [-1, 1]
        c: Corroboration in [0, 1] (from Popper-Hebbian forum)
    
    Returns:
        Readiness in [0, 1]
    """
    assert -1 <= r <= 1, "Risk tolerance must be in [-1, 1]"
    assert 0 <= c <= 1, "Corroboration must be in [0, 1]"
    
    readiness = c + (1 - c) * (r + 1) / 2
    return readiness


def calculate_realistic_support(a: float, r: float, c: float) -> float:
    """
    Calculate RealisticSupport score.
    
    Args:
        a: Agreement in [-1, 1]
        r: Risk tolerance in [-1, 1]
        c: Corroboration in [0, 1] (from Popper-Hebbian forum)
    
    Returns:
        RealisticSupport in [-1, 1]
    """
    assert -1 <= a <= 1, "Agreement must be in [-1, 1]"
    
    if a > 0:
        readiness = calculate_readiness(r, c)
        return a * readiness
    else:
        return a


def calculate_corroboration_from_forum(
    evidence_posts: list[dict]
) -> float:
    """
    Calculate corroboration score from Popper-Hebbian forum evidence.
    
    Args:
        evidence_posts: List of evidence post dicts with keys:
            - support_level: float in [-1, 1]
            - evidence_type: str (data/testimony/argument/anecdote/fallacy)
            - helpful_votes: int
            - not_helpful_votes: int
    
    Returns:
        Corroboration score in [0, 1]
    """
    # Base weights by evidence type
    base_weights = {
        'data': 3.0,
        'testimony': 2.0,
        'argument': 1.0,
        'anecdote': 0.5,
        'fallacy': 0.1
    }
    
    total_score = 0.0
    
    for post in evidence_posts:
        # Get base weight from evidence type
        base_weight = base_weights.get(post['evidence_type'], 1.0)
        
        # Hebbian adjustment based on community validation
        net_votes = post['helpful_votes'] - post['not_helpful_votes']
        final_weight = max(0.1, base_weight * (1 + net_votes / 10))
        
        # Add weighted support to total
        total_score += final_weight * post['support_level']
    
    # Normalize to [0, 1] using sigmoid
    k = 0.2  # Sensitivity parameter
    corroboration = 1 / (1 + math.exp(-k * total_score))
    
    return corroboration


def aggregate_realistic_support(
    agreements: list[float],
    risk_tolerances: list[float],
    corroboration: float,  # Shared across all participants
    weights: list[float] = None
) -> float:
    """
    Aggregate RealisticSupport across multiple participants.
    
    Args:
        agreements: List of agreement values
        risk_tolerances: List of risk tolerance values
        corroboration: Shared corroboration from Popper-Hebbian forum
        weights: Optional weights for each participant
    
    Returns:
        Aggregate RealisticSupport score
    """
    n = len(agreements)
    assert n == len(risk_tolerances)
    
    if weights is None:
        weights = [1.0] * n
    
    assert len(weights) == n
    
    # Calculate weighted means (corroboration is already shared)
    total_weight = sum(weights)
    mean_a = sum(w * a for w, a in zip(weights, agreements)) / total_weight
    mean_r = sum(w * r for w, r in zip(weights, risk_tolerances)) / total_weight
    
    # Calculate collective RealisticSupport
    return calculate_realistic_support(mean_a, mean_r, corroboration)


def normalize_to_unit_interval(realistic_support: float) -> float:
    """
    Normalize RealisticSupport from [-1, 1] to [0, 1].
    
    Args:
        realistic_support: Score in [-1, 1]
    
    Returns:
        Normalized score in [0, 1]
    """
    return (realistic_support + 1) / 2
```

### Appendix E: Glossary

**Agreement (a)**: A participant's evaluation of how desirable or wanted a solution is, independent of its epistemic quality. Ranges from -1 (strong opposition) to 1 (strong support).

**Corroboration (c)**: An epistemic measure of how well a solution has survived rigorous falsification attempts in the Popper-Hebbian deliberation forum. Based on the quality and weight of evidence (supporting and challenging arguments) as validated by the community. Ranges from 0 (strongly challenged/falsified) to 1 (well-corroborated). This is NOT subjective confidence, but an objective measure derived from evidence.

**Risk Tolerance (r)**: A participant's willingness to proceed with a solution despite epistemic uncertainty. Ranges from -1 (risk-averse, only want well-corroborated solutions) to 1 (risk-seeking, willing to experiment with weak corroboration).

**Readiness**: A composite measure combining corroboration and risk tolerance, representing overall preparedness to proceed with a solution. Calculated as $c + (1-c) \cdot \frac{r+1}{2}$. When corroboration is high, readiness is high regardless of risk tolerance. When corroboration is low, risk tolerance determines readiness.

**RealisticSupport**: The final evaluation score combining agreement with readiness. For supported solutions (a > 0), it's the product of agreement and readiness. For opposed solutions (a ≤ 0), it's simply the agreement value, ignoring epistemic quality.

**Collective RealisticSupport**: The aggregate RealisticSupport score across all participants, calculated by first averaging individual a and r values (corroboration c is already shared from the forum), then computing RealisticSupport from these means.

**Popper-Hebbian Deliberation Forum**: FreeDi's evidence-based discussion system where solutions are tested through supporting and challenging evidence posts, with evidence quality weighted by type and community validation.

**Evidence Weight**: The influence an evidence post has on the corroboration score, determined by evidence type (data > testimony > argument > anecdote > fallacy) and community validation (helpful/not helpful votes). Implements Hebbian reinforcement where validated evidence gains strength.

**Falsifiability**: A solution's property of being testable and potentially refutable. Solutions must be refined to be falsifiable (clear, specific, testable) before entering the deliberation forum, ensuring they can be meaningfully evaluated with evidence.

---

**Document Version**: 2.0 (Updated with Popper-Hebbian Integration)  
**Authors**: FreeDi Team  
**Status**: Internal Working Paper  
**Next Review**: After Popper-Hebbian forum integration and pilot testing  
**Last Updated**: November 4, 2025
