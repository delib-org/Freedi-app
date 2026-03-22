# Confidence Index & Agreement Index

Two metrics that give richer insight into evaluation results beyond the single consensus score.

---

## What They Measure

### Agreement Index (A)

**"How much do evaluators agree with each other?"**

- Range: 0% (total disagreement) to 100% (perfect agreement)
- Formula: `A = 1 - σ` (one minus the standard deviation)
- Independent of sample size — 5 evaluators who fully agree score the same as 500 who fully agree
- Always calculated after the first evaluation

| Example | Agreement Index |
|---------|----------------|
| Everyone votes +1 | 100% |
| Half vote +1, half vote -1 | 0% |
| Votes cluster around +0.5 with minor spread | ~75% |

### Confidence Index (Γ)

**"How representative is this sample of the target population?"**

- Range: 0% (no data) to 100% (complete census)
- Formula: `Γ = (n·q) / (n·q + 5·ln(N)·(N-n)/(N-1))`
- Depends on three inputs:
  - **n** — number of evaluators (automatic)
  - **N** — target population size (admin sets this)
  - **q** — sampling quality (admin sets this)
- Only shown when the admin sets a target population

| Evaluators (n) | Population (N) | Quality (q) | Confidence |
|----------------|----------------|-------------|------------|
| 1,500 | 2,000,000 | 1.0 | ~95% |
| 9 | 200,000 | 1.0 | ~13% |
| 25 | 30 | 1.0 | ~90% |
| 100 | 10,000 | 0.3 | lower than q=1 |

---

## Admin Setup (Main App)

1. Open the **question statement** you want to configure
2. Go to **Settings**
3. Scroll to the **"Sample Representativeness"** section (below Mass Consensus Settings)
4. Set:
   - **Target Population Size** — How many people are in the community this question represents (e.g., 500 for a school, 50,000 for a city neighborhood)
   - **Sampling Quality** — How the participants were recruited:

| Sampling Method | Quality Value | When to Use |
|-----------------|---------------|-------------|
| Stratified random sample | 1.0 | Participants selected randomly with demographic balancing |
| Simple random sample | 0.9 | Participants selected randomly from a list |
| Invited panel | 0.7 | Specific people were invited to participate |
| Open with balancing | 0.4 | Anyone can join, but demographic balancing is applied |
| Fully self-selected | 0.3 (default) | Open link, anyone can participate |

5. Save — the indices will be calculated on the next evaluation

**If you don't set a target population**, the Confidence Index is not shown. The Agreement Index is always available.

---

## Admin Setup (Sign App)

In the Sign app admin settings panel, the same two fields are available:
- **Target Population** and **Sampling Quality**

These are stored in the document's `signSettings` and used by Firebase Functions when evaluating suggestions under that document.

---

## Where the Indices Appear

### Main App
- In the **evaluation tooltip** (hover/tap the evaluator count on any option card)
- Shows: `Consensus: X. Agreement Index: Y%. Confidence Index: Z%`
- Confidence Index only appears when the admin has set a target population

### Mass Consensus App
- On the **results page** after evaluation is complete
- Two additional badges appear alongside "Voted", "Support", "Against":
  - **Agreement Index** badge with percentage
  - **Confidence Index** badge with percentage (only when configured)
- These are shown in results only, NOT during the evaluation phase

### Sign App
- Indices are calculated server-side for suggestion evaluations
- Available in Firestore on the statement's `evaluation` object

---

## How It Works (Technical)

1. Admin sets **N** (target population) and **q** (sampling quality) on a question statement
2. When any user submits an evaluation, Firebase Functions trigger:
   - `calculateEvaluation()` computes `agreementIndex = 1 - σ` from the evaluation data
   - If `targetPopulation` is configured, `calcConfidenceIndex(n, N, q)` computes the confidence
3. Both values are written to `statement.evaluation.agreementIndex` and `statement.evaluation.confidenceIndex` in Firestore
4. All apps read these values and display them

### Edge Cases
- **No evaluators**: Both indices = 0
- **N not set**: `confidenceIndex` is `undefined` (not displayed)
- **q not set**: Defaults to 0.3 (fully self-selected)
- **n >= N** (everyone participated): Confidence = 100%
- **N = 1**: Confidence = 100%
- **Changing N or q**: Takes effect on the next evaluation (no batch recalculation)

---

## Interpreting Results

| Agreement | Confidence | Interpretation |
|-----------|------------|----------------|
| High (>80%) | High (>70%) | Strong consensus from a representative sample |
| High (>80%) | Low (<30%) | People agree, but too few have participated to be sure |
| Low (<40%) | High (>70%) | The community is genuinely divided |
| Low (<40%) | Low (<30%) | Not enough data to draw conclusions |

### Tips
- A high consensus score with low agreement might mean a few strong supporters are skewing the average — check the Agreement Index
- If Confidence is low, encourage more participation before acting on results
- For important decisions, aim for both Agreement > 70% and Confidence > 60%
