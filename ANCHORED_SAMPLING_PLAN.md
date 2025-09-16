# Anchored Random Sampling Implementation Plan

## Overview
Anchored Random Sampling is a two-phase evaluation mechanism for MassConsensus that ensures critical options receive evaluation while maintaining diversity through random sampling.

## Architecture

### Phase 1: Option Collection
- Users submit solutions/options to questions
- Admin reviews submissions and marks high-priority options as "anchored"
- Admin specifies how many anchored options to include in evaluations (numberOfAnchoredStatements)

### Phase 2: Backend Processing & Distribution
The backend API (`getRandomStatements`):
1. Fetches all anchored statements from the database
2. Randomly selects N anchored statements (where N = numberOfAnchoredStatements)
3. Fetches random non-anchored statements to fill remaining slots
4. Combines both sets and shuffles them together
5. Returns the mixed, randomized array to the client

### Phase 3: Frontend Display
The frontend receives and displays:
- A pre-mixed, pre-shuffled array of statements
- No client-side knowledge of which statements are anchored
- Uniform presentation for all statements (no visual distinction)

## Implementation Specifications

### 1. Admin Interface Components

#### MassConsensusAdmin Component Updates
**File**: `src/view/pages/statement/components/statementTypes/question/massConsesusQuestion/MassConsensusAdmin.tsx`

**UI Elements**:
- Add anchor toggle button in each OptionMCCard
- Display anchored count indicator
- Visual badge for anchored statements (⚓ icon)

#### OptionMCCard Component Updates
**File**: `src/view/pages/statement/components/statementTypes/question/massConsesusQuestion/components/deleteCard/OptionMCCard.tsx`

```tsx
// New props
interface Props {
  statement: Statement;
  isDelete?: boolean;
  onToggleAnchor?: (statementId: string) => void;
}

// UI additions:
- Anchor toggle button (admin only)
- Anchored status indicator
- Click handler for anchoring
```

### 2. Settings Configuration

#### QuestionSettings Component Updates
**File**: `src/view/pages/statement/components/settings/components/QuestionSettings/QuestionSettings.tsx`

**New Settings Section**:
```tsx
// Anchored Evaluation Settings
<CustomSwitchSmall
  label={t('Enable Anchored Sampling')}
  checked={statement.evaluationSettings?.anchored?.anchored || false}
  setChecked={handleAnchoredToggle}
  textChecked={t('Anchored')}
  textUnchecked={t('Standard')}
  imageChecked={<AnchorIcon />}
  imageUnchecked={<RandomIcon />}
/>

// Number of anchored statements input (shown when enabled)
{isAnchoredEnabled && (
  <div className={styles.anchoredCount}>
    <label>{t('Number of anchored options in evaluation')}</label>
    <input
      type="number"
      min="1"
      max="10"
      value={statement.evaluationSettings?.anchored?.numberOfAnchoredStatements || 3}
      onChange={handleAnchoredCountChange}
    />
  </div>
)}
```

### 3. Backend API Modifications

#### getRandomStatements Function Update
**File**: `functions/src/fn_httpRequests.ts`

```typescript
export const getRandomStatements = async (req: Request, res: Response) => {
  const parentId = req.query.parentId;
  const limit = Number(req.query.limit) || 6;

  // Get parent statement to check if anchored evaluation is enabled
  const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
  const parentStatement = parentDoc.data();

  let statements = [];

  if (parentStatement?.evaluationSettings?.anchored?.anchored) {
    const numberOfAnchoredStatements = parentStatement.evaluationSettings.anchored.numberOfAnchoredStatements || 3;

    // Step 1: Get all anchored statements from pool
    const anchoredQuery = db.collection(Collections.statements)
      .where('parentId', '==', parentId)
      .where('statementType', '==', StatementType.option)
      .where('anchored', '==', true);

    const anchoredDocs = await anchoredQuery.get();
    const anchoredPool = anchoredDocs.docs.map(doc => doc.data());

    // Step 2: Randomly select N anchored statements from the pool
    const selectedAnchored = getRandomSample(anchoredPool, Math.min(numberOfAnchoredStatements, anchoredPool.length));

    // Step 3: Get random non-anchored statements to fill remaining slots
    const remainingSlots = Math.max(0, limit - selectedAnchored.length);

    if (remainingSlots > 0) {
      const randomQuery = db.collection(Collections.statements)
        .where('parentId', '==', parentId)
        .where('statementType', '==', StatementType.option)
        .where('anchored', '!=', true)
        .orderBy('evaluation.viewed', 'asc')
        .orderBy('evaluation.evaluationRandomNumber', 'desc')
        .limit(remainingSlots);

      const randomDocs = await randomQuery.get();
      const randomStatements = randomDocs.docs.map(doc => doc.data());

      // Step 4: Combine anchored and random statements
      statements = [...selectedAnchored, ...randomStatements];
    } else {
      statements = selectedAnchored;
    }

    // Step 5: Shuffle all statements together before sending
    statements = shuffleArray(statements);

    // Step 6: Update view counts for all selected statements
    await updateViewCounts(statements);

  } else {
    // Standard random selection (existing logic)
    const randomQuery = db.collection(Collections.statements)
      .where('parentId', '==', parentId)
      .where('statementType', '==', StatementType.option)
      .orderBy('evaluation.viewed', 'asc')
      .orderBy('evaluation.evaluationRandomNumber', 'desc')
      .limit(limit);

    const randomDocs = await randomQuery.get();
    statements = randomDocs.docs.map(doc => doc.data());

    await updateViewCounts(statements);
  }

  // API returns the mixed and shuffled array
  res.status(200).send({ statements, ok: true });
};

// Helper function to randomly sample from array
function getRandomSample<T>(array: T[], size: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, size);
}

// Helper function to shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Helper function to update view counts
async function updateViewCounts(statements: Statement[]): Promise<void> {
  const batch = db.batch();
  statements.forEach((statement) => {
    const ref = db.collection(Collections.statements).doc(statement.statementId);
    batch.update(ref, {
      'evaluation.viewed': FieldValue.increment(1),
      'evaluation.evaluationRandomNumber': Math.random(),
    });
  });
  await batch.commit();
}
```

### 4. Database Functions

#### New Function: toggleStatementAnchored
**File**: `src/controllers/db/statements/setStatements.ts`

```typescript
export async function toggleStatementAnchored(
  statementId: string,
  anchored: boolean,
  parentId: string
): Promise<void> {
  try {
    // Check if user is admin
    const role = store.getState().statements.subscriptions
      .find(sub => sub.statementId === parentId)?.role;

    if (role !== 'admin') {
      throw new Error('Only admins can anchor statements');
    }

    // Check current anchored count
    const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
    const maxAnchored = parentDoc.data()?.evaluationSettings?.anchored?.numberOfAnchoredStatements || 5;

    if (anchored) {
      const currentAnchored = await db.collection(Collections.statements)
        .where('parentId', '==', parentId)
        .where('anchored', '==', true)
        .get();

      if (currentAnchored.size >= maxAnchored) {
        throw new Error(`Maximum ${maxAnchored} anchored statements allowed`);
      }
    }

    // Update statement
    await db.collection(Collections.statements).doc(statementId).update({
      anchored: anchored
    });

  } catch (error) {
    console.error('Error toggling anchored status:', error);
    throw error;
  }
}
```

### 5. Frontend Updates

#### RandomSuggestionsVM - NO CHANGES NEEDED
**File**: `src/view/pages/massConsensus/randomSuggestions/RandomSuggestionsVM.tsx`

The frontend component doesn't need changes because:
- The API already returns the mixed and shuffled array
- The client receives and displays statements without knowing which are anchored
- Existing code will work seamlessly with the new backend logic

```typescript
// Existing code remains unchanged
const fetchRandomStatements = async () => {
  if (statementId) {
    try {
      const endPoint = APIEndPoint('getRandomStatements', {
        parentId: statementId,
        limit: 6, // API handles mixing anchored + random
      });

      const response = await fetch(endPoint);
      // ... existing code
      const { statements } = await response.json();
      // Statements are already mixed and shuffled by the backend
      setSubStatements(statements);
    }
  }
};
```

#### Redux Slice Updates
**File**: `src/redux/statements/statementsSlice.ts`

```typescript
// Add action for toggling anchored status (admin use)
toggleAnchoredStatus: (state, action: PayloadAction<{statementId: string, anchored: boolean}>) => {
  const statement = state.statements.find(s => s.statementId === action.payload.statementId);
  if (statement) {
    statement.anchored = action.payload.anchored;
  }
}
```

## Visual Design

### Admin View
- Anchored statements show ⚓ icon
- Toggle button in admin interface
- Counter showing "3/5 anchored" in settings
- Different background color (subtle) for anchored items

### User View
- No visual distinction between anchored and random
- All statements presented uniformly
- Random order presentation

## Database Schema (Already in delib-npm)

```typescript
// Statement Schema additions
anchored: optional(boolean()) // Marks statement as anchored

// StatementEvaluationSettings additions
anchored: optional(object({
  anchored: optional(boolean()), // Enable anchored sampling
  numberOfAnchoredStatements: optional(number()) // Max anchored in evaluation
}))
```

## TODO List

### Phase 1: Admin Interface (Frontend)
- [ ] Update OptionMCCard component
  - [ ] Add anchor toggle button (admin only)
  - [ ] Add anchored status indicator (⚓ icon)
  - [ ] Implement onClick handler for toggling
  - [ ] Add visual styling for anchored items
- [ ] Update MassConsensusAdmin component
  - [ ] Add anchored counter display
  - [ ] Implement batch anchor/unanchor functionality
  - [ ] Add "Clear all anchors" button
- [ ] Create anchor icon SVG asset

### Phase 2: Settings Configuration
- [ ] Update QuestionSettings component
  - [ ] Add CustomSwitchSmall for enabling anchored sampling
  - [ ] Add number input for max anchored statements
  - [ ] Implement handlers for settings changes
- [ ] Create database update functions for settings
  - [ ] setAnchoredEvaluationSettings function
  - [ ] Validation for max anchored count

### Phase 3: Backend Implementation
- [ ] Update getRandomStatements API endpoint
  - [ ] Check if parent has anchored evaluation enabled
  - [ ] Fetch all anchored statements into pool
  - [ ] Randomly select N anchored from pool (N = numberOfAnchoredStatements)
  - [ ] Fetch random non-anchored to fill remaining slots
  - [ ] Implement array shuffling
  - [ ] Implement getRandomSample utility for selecting N random items from anchored pool
  - [ ] Update view counts appropriately
- [ ] Create toggleStatementAnchored function
  - [ ] Admin permission check
  - [ ] Max anchored validation
  - [ ] Database update logic
- [ ] Add shuffleArray utility function

### Phase 4: State Management
- [ ] Update Redux statements slice
  - [ ] Add toggleAnchoredStatus action
  - [ ] Add anchored status to statement selectors
  - [ ] Update statement subscription handling
- [ ] Create hooks for anchored functionality
  - [ ] useAnchoredStatements hook
  - [ ] useCanAnchor hook (permission check)

### Phase 5: Frontend Components
- [ ] Create AnchoredBadge component (admin view only)
- [ ] No changes needed to RandomSuggestions component
  - [ ] API returns already mixed and shuffled statements
  - [ ] Frontend displays them as-is without distinction
- [ ] No changes needed to SuggestionCard for users
  - [ ] Users see all statements uniformly
  - [ ] No visual indication of anchored status

### Phase 6: Testing & Validation
- [ ] Test anchoring toggle functionality
- [ ] Test max anchored limit enforcement
- [ ] Test random + anchored distribution
- [ ] Test permission checks (admin only)
- [ ] Test shuffling algorithm
- [ ] Test backwards compatibility

### Phase 7: UI Visual Testing with MCP Playwright

#### Prerequisites for Testing Mass Consensus
1. **Switch to Advanced User Mode**:
   - Navigate to user profile
   - Change to "Advanced User" mode
   - This enables creating groups and Mass Consensus questions

2. **Create Test Mass Consensus Question**:
   - Click the plus (+) button (only visible in advanced mode)
   - Create a new group
   - Create a Mass Consensus question within the group

- [ ] Use MCP Playwright to verify UI consistency
  - [ ] Navigate to user profile and switch to advanced mode
  - [ ] Create a new group
  - [ ] Create a Mass Consensus question
  - [ ] Navigate to MassConsensus admin page
  - [ ] Take screenshots of current design (baseline)
  - [ ] Implement anchored options UI
  - [ ] Compare new UI with baseline screenshots
- [ ] Test admin interface changes
  - [ ] Verify anchor toggle button appears only for admins
  - [ ] Check anchored badge visibility (⚓ icon)
  - [ ] Confirm anchored counter display
  - [ ] Test CustomSwitchSmall component integration
- [ ] Test user evaluation view
  - [ ] Navigate to random suggestions page
  - [ ] Verify no visual distinction between anchored/random
  - [ ] Confirm uniform presentation of all statements
  - [ ] Check that statements appear in random order
- [ ] Test settings page
  - [ ] Navigate to question settings
  - [ ] Verify anchored sampling toggle works
  - [ ] Check number input appears when enabled
  - [ ] Validate input constraints (min/max)
- [ ] Cross-browser testing
  - [ ] Test in Chrome
  - [ ] Test in Safari
  - [ ] Test in Firefox

#### MCP Playwright Test Script Example
```typescript
// Test: Admin can see and toggle anchored options
async function testAnchoredAdminUI() {
  // Navigate to admin page
  await mcp__playwright__browser_navigate({
    url: '/mass-consensus/{statementId}/admin'
  });

  // Take baseline screenshot
  await mcp__playwright__browser_take_screenshot({
    filename: 'admin-baseline.png',
    fullPage: true
  });

  // Get page snapshot to find anchor toggles
  await mcp__playwright__browser_snapshot();

  // Click anchor toggle on first option
  await mcp__playwright__browser_click({
    element: 'Anchor toggle button for first option',
    ref: '[data-cy="anchor-toggle-0"]'
  });

  // Verify anchored badge appears
  await mcp__playwright__browser_wait_for({
    text: '⚓'
  });

  // Take screenshot with anchored option
  await mcp__playwright__browser_take_screenshot({
    filename: 'admin-with-anchored.png',
    fullPage: true
  });
}

// Test: User evaluation view shows no distinction
async function testUserEvaluationView() {
  // Navigate to random suggestions
  await mcp__playwright__browser_navigate({
    url: '/mass-consensus/{statementId}/random-suggestions'
  });

  // Take screenshot of evaluation view
  await mcp__playwright__browser_take_screenshot({
    filename: 'user-evaluation-view.png',
    fullPage: true
  });

  // Get snapshot and verify no anchor indicators
  const snapshot = await mcp__playwright__browser_snapshot();

  // Verify no anchor badges visible to users
  // Check that all statement cards have same styling
}

// Test: Settings page anchored sampling toggle
async function testAnchoredSettings() {
  // Navigate to settings
  await mcp__playwright__browser_navigate({
    url: '/statement/{statementId}/settings'
  });

  // Find and click anchored sampling toggle
  await mcp__playwright__browser_click({
    element: 'Enable Anchored Sampling toggle',
    ref: '[data-cy="toggleSwitch-anchored-sampling"]'
  });

  // Verify number input appears
  await mcp__playwright__browser_wait_for({
    text: 'Number of anchored options'
  });

  // Type number in input
  await mcp__playwright__browser_type({
    element: 'Number of anchored options input',
    ref: '[data-cy="anchored-count-input"]',
    text: '5'
  });

  // Take screenshot of settings
  await mcp__playwright__browser_take_screenshot({
    filename: 'anchored-settings-enabled.png'
  });
}
```

### Phase 8: Documentation
- [ ] Update component documentation
- [ ] Add inline code comments
- [ ] Create user guide for admins
- [ ] Update API documentation

## Success Metrics
- N randomly selected anchored statements (from anchored pool) appear in evaluations
- Random distribution for non-anchored statements
- No user-facing indication of anchored status
- Admin can easily manage anchored statements
- Performance remains optimal with anchored sampling

## Rollback Plan
- Feature flag in evaluationSettings
- Backwards compatible with existing questions
- Can disable anchored sampling per question
- Existing evaluations unaffected

## Visual Testing Strategy

### Why MCP Playwright
- Ensures new UI elements match existing design system
- Automated visual regression testing
- Cross-browser compatibility verification
- Accessibility testing for new components

### Testing Approach
1. **Baseline Capture**: Screenshot current UI before changes
2. **Implementation**: Add anchored features with matching styles
3. **Comparison**: Use MCP Playwright to verify design consistency
4. **User Experience**: Confirm no visual leakage of anchored status to users

## Timeline Estimate
- Phase 1-2: 2 days (UI components)
- Phase 3-4: 2 days (Backend & State)
- Phase 5: 1 day (Frontend integration)
- Phase 6: 1 day (Testing & Validation)
- Phase 7: 1 day (MCP Playwright UI Testing)
- Phase 8: 1 day (Documentation)
- **Total: ~8 days**