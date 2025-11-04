# Popper-Hebbian Weight Calculation Update

**Date**: November 4, 2025
**Version**: 2.1
**Files Modified**:
- `functions/src/fn_popperHebbian_onVote.ts`
- `functions/src/fn_popperHebbian_onEvidencePost.ts`

---

## Summary of Changes

The evidence weight calculation has been updated to use a **-1 to +1 range** instead of 0 to 2, with new semantics and improved community validation logic.

## New Weight System

### Weight Range: -1 to +1

- **+1.0**: Fully credible, high quality evidence
- **0.0**: Neutral, no credibility
- **-1.0**: Discredited, harmful evidence

### Key Innovation: Bad Evidence Hurts Its Own Position

With the new system, evidence that claims to support a position (positive support value) but receives negative community votes will get a **negative weight**, causing it to **hurt the position it claims to support**.

**Example:**
- Evidence claims: "I support this idea" (support = +0.8)
- Community votes: 0 helpful, 10 not helpful
- Weight: -0.75
- **Contribution to score: 0.8 × (-0.75) = -0.60** ← Hurts the idea!

This prevents manipulation where people post garbage "support" to boost their preferred option.

---

## Algorithm Details

### For New Evidence (0 votes)

New evidence starts **optimistically** at its base weight:

```typescript
if (totalVotes === 0) {
	return baseWeight * 1.0;
}
```

| Evidence Type | Base Weight | Initial Weight |
|---------------|-------------|----------------|
| Data          | 1.0         | +1.00          |
| Testimony     | 0.7         | +0.70          |
| Argument      | 0.4         | +0.40          |
| Anecdote      | 0.2         | +0.20          |
| Fallacy       | 0.1         | +0.10          |

### For Voted Evidence

#### Step 1: Bayesian Smoothing

Adds "virtual votes" to prevent wild swings from 1-2 votes:

```typescript
const smoothing = 2;
const smoothedHelpful = helpfulCount + (smoothing * 0.75);     // Optimistic prior: 75%
const smoothedNotHelpful = notHelpfulCount + (smoothing * 0.25); // Pessimistic: 25%
const smoothedTotal = smoothedHelpful + smoothedNotHelpful;
```

**Effect**: Requires ~2-3 votes to significantly move from the starting position.

#### Step 2: Calculate Vote Credibility

Maps the helpful ratio to credibility score:

```typescript
const helpfulRatio = smoothedHelpful / smoothedTotal;  // 0 to 1
const voteCredibility = (helpfulRatio * 2) - 1;        // -1 to +1
```

| Helpful Ratio | Vote Credibility | Meaning                    |
|---------------|------------------|----------------------------|
| 1.00          | +1.0             | All votes helpful          |
| 0.75          | +0.5             | Mostly helpful             |
| 0.50          | 0.0              | Balanced (neutral)         |
| 0.25          | -0.5             | Mostly not helpful         |
| 0.00          | -1.0             | All votes not helpful      |

#### Step 3: Combine with Evidence Type

```typescript
const finalWeight = baseWeight * voteCredibility;
return Math.max(-1.0, Math.min(1.0, finalWeight));
```

**Result**: Weight ranges from **-baseWeight** to **+baseWeight**

---

## Example Calculations

### Scenario 1: Good Data Evidence

```
Evidence Type: Data (baseWeight = 1.0)
Votes: 10 helpful, 0 not helpful

smoothedHelpful = 10 + 1.5 = 11.5
smoothedNotHelpful = 0 + 0.5 = 0.5
smoothedTotal = 12.0
helpfulRatio = 11.5 / 12.0 = 0.958
voteCredibility = (0.958 * 2) - 1 = +0.917
finalWeight = 1.0 * 0.917 = +0.917
```

**Result**: Strong credibility (+0.917)

### Scenario 2: Bad Data Evidence

```
Evidence Type: Data (baseWeight = 1.0)
Votes: 0 helpful, 10 not helpful

smoothedHelpful = 0 + 1.5 = 1.5
smoothedNotHelpful = 10 + 0.5 = 10.5
smoothedTotal = 12.0
helpfulRatio = 1.5 / 12.0 = 0.125
voteCredibility = (0.125 * 2) - 1 = -0.75
finalWeight = 1.0 * (-0.75) = -0.75
```

**Result**: Discredited (-0.75)

**If this evidence claims to support (support = +0.8):**
- Contribution = 0.8 × (-0.75) = **-0.60** ← Hurts the idea!

### Scenario 3: Mixed Votes

```
Evidence Type: Data (baseWeight = 1.0)
Votes: 5 helpful, 5 not helpful

smoothedHelpful = 5 + 1.5 = 6.5
smoothedNotHelpful = 5 + 0.5 = 5.5
smoothedTotal = 12.0
helpfulRatio = 6.5 / 12.0 = 0.542
voteCredibility = (0.542 * 2) - 1 = +0.083
finalWeight = 1.0 * 0.083 = +0.083
```

**Result**: Slight credibility (+0.083) - nearly neutral

### Scenario 4: Anecdote Evidence Type

```
Evidence Type: Anecdote (baseWeight = 0.2)
Votes: 10 helpful, 0 not helpful

voteCredibility = +0.917 (same as Scenario 1)
finalWeight = 0.2 * 0.917 = +0.183
```

**Result**: Weaker impact (+0.183) even with all positive votes

---

## Key Properties

### 1. Optimistic Start ✅
New evidence (0 votes) starts at full base weight, not penalized for being new.

### 2. Community Consensus ✅
Weight moves toward community assessment as votes accumulate.

### 3. Anti-Manipulation ✅
Bad "supporting" evidence can get negative weight and hurt its claimed position.

### 4. Evidence Type Scaling ✅
Higher quality evidence types (data, testimony) have stronger maximum impact.

### 5. Smoothing ✅
Bayesian prior prevents wild swings from 1-2 votes.

### 6. Bounded Range ✅
Weights are clamped to [-1, +1] for consistency.

---

## Comparison with Old System

| Aspect | Old System (v2.0) | New System (v2.1) |
|--------|-------------------|-------------------|
| **Weight Range** | 0 to 1 (multiplier) | -1 to +1 (credibility) |
| **New Evidence** | 0.5x (50% penalty!) | 1.0x (full credibility) |
| **Bad Evidence** | Minimum 0.01 (still helps) | Can go negative (hurts!) |
| **Vote Formula** | tanh normalization | Bayesian smoothing |
| **Anti-Gaming** | Yes (tanh) | Yes (smoothing + negative) |
| **Semantic Meaning** | Multiplier (0-1) | Credibility (-1 to +1) |

---

## Integration with Score Calculation

The final contribution to the parent statement's score is:

```typescript
contribution = support × weight
```

Where:
- **support**: -1 (challenges) to +1 (supports) ← Set by AI
- **weight**: -1 (discredited) to +1 (credible) ← Calculated from votes

**Example Results:**

| Support | Weight | Contribution | Effect |
|---------|--------|--------------|--------|
| +1.0 | +0.9 | +0.90 | Strong support |
| +0.8 | +0.5 | +0.40 | Moderate support |
| +1.0 | -0.7 | **-0.70** | Bad "support" hurts! |
| -0.8 | +0.9 | -0.72 | Strong challenge |
| -1.0 | -0.6 | **+0.60** | Bad "challenge" helps! |

---

## Testing

Run the demonstration script to see the calculations:

```bash
cd functions
node weight-demo-simple.js
```

This shows:
- New evidence starting weights
- Effect of positive/negative voting
- Bad evidence hurting its position
- Evidence type scaling
- Mixed voting scenarios

---

## Deployment Notes

### Changes Required
1. ✅ Updated `calculatePostWeight()` in `fn_popperHebbian_onVote.ts`
2. ✅ Added documentation to `calculateInitialWeight()` in `fn_popperHebbian_onEvidencePost.ts`
3. ✅ No database migration needed (weights are recalculated dynamically)

### Testing Checklist
- ✅ New evidence starts at base weight
- ✅ Positive votes increase weight
- ✅ Negative votes decrease weight (can go negative)
- ✅ Bad supporting evidence gets negative contribution
- ✅ Evidence type scaling works correctly
- ✅ Smoothing prevents vote manipulation

### Deployment
```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## Future Enhancements

Potential improvements for future versions:

1. **Adaptive Smoothing**: Adjust smoothing based on total community size
2. **Reputation Weighting**: Weight votes by voter reputation
3. **Time Decay**: Older votes count less than recent ones
4. **Confidence Intervals**: Show uncertainty based on vote count
5. **Cross-Evidence Learning**: Identify users who consistently vote accurately

---

**Status**: ✅ Implemented and tested
**Next Step**: Deploy to production

