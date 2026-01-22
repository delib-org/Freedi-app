# Demographic Heatmap Filtering Implementation Plan

**Feature**: Demographic-based filtering and analysis for Freedi Sign app
**Based on**: `/papers/demographic-heatmap-filtering.md`
**Date**: December 2024

---

## Table of Contents

1. [Overview](#overview)
2. [Phase 1: Single-Segment Heatmap Filter](#phase-1-single-segment-heatmap-filter)
3. [Phase 2: Demographic-Filtered CSV Export](#phase-2-demographic-filtered-csv-export)
4. [Phase 3: Polarization Index for Sign](#phase-3-polarization-index-for-sign)
5. [Phase 4: Divergence Heatmap Mode](#phase-4-divergence-heatmap-mode)
6. [Phase 5: 2D Polarization Map Visualization](#phase-5-2d-polarization-map-visualization)
7. [Phase 6: Multi-Segment Comparison View](#phase-6-multi-segment-comparison-view)
8. [Phase 7: Full DCI Collaboration Matrix](#phase-7-full-dci-collaboration-matrix)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Plan](#deployment-plan)

---

## Overview

### Current State

The Sign app already has:
- **Heatmap system** with 4 metrics: approval, comments, rating, viewership (`apps/sign/app/api/heatmap/[docId]/route.ts`)
- **Demographic collection** via DemographicSurveyModal (`apps/sign/src/store/demographicStore.ts`)
- **Zustand stores** for heatmap and demographics state management

The main Freedi app has:
- **Polarization Index** with MAD calculations (`functions/src/fn_polarizationIndex.ts`)
- **2D visualization** component (`src/view/components/maps/polarizationIndex/`)
- **Data models** in `packages/shared-types/src/models/polarizationIndex/`

### Goal

Enable administrators to:
1. Filter heatmaps by demographic segments
2. See where demographics agree/disagree (groupsMAD)
3. Export demographic breakdowns to CSV
4. Visualize collaboration patterns between demographic groups

---

## Phase 1: Single-Segment Heatmap Filter

**Priority**: High | **Effort**: Medium | **Impact**: High

### 1.1 Objective

Allow filtering any heatmap type (approval, comments, rating, viewership) by a single demographic segment (e.g., "Age: 18-25").

### 1.2 Tasks

#### 1.2.1 Extend Heatmap API

**File**: `apps/sign/app/api/heatmap/[docId]/route.ts`

```typescript
// Add query parameter handling
GET /api/heatmap/{docId}?demographic={questionId}&segment={optionValue}

// New helper function
async function getUsersInSegment(
  docId: string,
  questionId: string,
  segmentValue: string
): Promise<Set<string>>

// Update aggregation functions to accept optional userFilter
async function aggregateHeatmapForUsers(
  docId: string,
  userIds: Set<string> | null
): Promise<HeatMapData>
```

**Steps**:
1. Parse `demographic` and `segment` query params from request
2. Query `usersData` collection: `where userQuestionId == {questionId}` AND `where answer == {segmentValue}`
3. Extract user IDs from results
4. Pass user IDs to existing aggregation functions as filter
5. Modify each aggregation query to include `where userId IN userIds`
6. Add segment metadata to response

#### 1.2.2 New Types

**File**: `apps/sign/src/types/heatMap.ts`

```typescript
export interface DemographicFilter {
  questionId: string | null;
  questionLabel: string | null;
  segmentValue: string | null;
  segmentLabel: string | null;
}

export interface DemographicHeatMapData extends HeatMapData {
  segment: {
    questionId: string;
    questionLabel: string;
    segmentValue: string;
    segmentLabel: string;
    respondentCount: number;
  } | null;
}
```

#### 1.2.3 Extend Heatmap Store

**File**: `apps/sign/src/store/heatMapStore.ts`

```typescript
interface HeatMapState {
  // ... existing state

  // New demographic filtering
  demographicFilter: DemographicFilter;
  availableDemographics: SignDemographicQuestion[];

  // Actions
  setDemographicFilter: (filter: DemographicFilter) => void;
  clearDemographicFilter: () => void;
  loadAvailableDemographics: (docId: string) => Promise<void>;
}
```

**New methods**:
- `setDemographicFilter(filter)` - Update filter and reload data
- `clearDemographicFilter()` - Reset to show all users
- `loadAvailableDemographics(docId)` - Fetch available demographic questions

#### 1.2.4 Create Demographic Filter UI Component

**File**: `apps/sign/src/components/heatMap/DemographicFilter/DemographicFilter.tsx`

```typescript
interface DemographicFilterProps {
  documentId: string;
}

export const DemographicFilter: FC<DemographicFilterProps> = ({ documentId }) => {
  // UI with:
  // - Dropdown: Select demographic question (Age, Location, etc.)
  // - Dropdown: Select segment value (18-25, Urban, etc.)
  // - Clear filter button
  // - Badge showing current filter + respondent count
};
```

**SCSS**: `apps/sign/src/components/heatMap/DemographicFilter/DemographicFilter.module.scss`

#### 1.2.5 Integrate Filter into HeatMapToolbar

**File**: `apps/sign/src/components/heatMap/HeatMapToolbar/HeatMapToolbar.tsx`

- Add DemographicFilter component to toolbar
- Show filter indicator when active
- Update loading state when filter changes

### 1.3 Database Queries

**Collection**: `usersData`
**Index needed**: `(statementId, userQuestionId, answer)` - composite index

```typescript
// Query to get users in segment
const usersQuery = query(
  collection(db, Collections.usersData),
  where('statementId', '==', topParentId),
  where('userQuestionId', '==', questionId)
);
// Then filter in code by answer === segmentValue
```

### 1.4 Acceptance Criteria

- [ ] Admin can select a demographic question from dropdown
- [ ] Admin can select a segment value from second dropdown
- [ ] Heatmap updates to show only data from users in that segment
- [ ] UI shows "Filtered by: {question} = {value} ({N} users)"
- [ ] Clear filter button resets to all users
- [ ] Works for all 4 heatmap types

---

## Phase 2: Demographic-Filtered CSV Export

**Priority**: High | **Effort**: Low | **Impact**: High

### 2.1 Objective

Extend the existing CSV export to support demographic filtering.

### 2.2 Tasks

#### 2.2.1 Extend Export API

**File**: `apps/sign/app/api/admin/export-detailed/[docId]/route.ts`

```typescript
// Add query parameters
GET /api/admin/export-detailed/{docId}?demographic={questionId}&segment={value}

// Response includes additional columns:
// - Filter Applied
// - Segment Size
// - Segment Percentage
```

**Steps**:
1. Parse demographic filter params
2. Apply same filtering logic as heatmap API
3. Add filter metadata to CSV header
4. Calculate segment statistics

#### 2.2.2 Create Demographic Comparison Export

**New File**: `apps/sign/app/api/admin/export-demographic/[docId]/route.ts`

```typescript
GET /api/admin/export-demographic/{docId}?demographic={questionId}&matrix=true

// CSV Structure:
// Section 1: Per-Paragraph Demographic Breakdown
// Paragraph ID | Content | Demographic | Segment | Approval | Comments | Rating | Views

// Section 2 (if matrix=true): Collaboration Index Summary
// Paragraph ID | Most Agreeing Segments | Most Disagreeing Segments | Max Divergence
```

#### 2.2.3 Add Export Button to Demographic Filter

**File**: `apps/sign/src/components/heatMap/DemographicFilter/DemographicFilter.tsx`

- Add "Export Current Filter" button
- Add "Export All Segments Comparison" button

### 2.3 Acceptance Criteria

- [ ] Filtered export includes filter metadata
- [ ] Comparison export shows all segments side by side
- [ ] CSV properly escaped and formatted
- [ ] Downloads trigger correctly

---

## Phase 3: Polarization Index for Sign

**Priority**: High | **Effort**: Medium | **Impact**: High

### 3.1 Objective

Calculate and store MAD-based polarization metrics for Sign document paragraphs.

### 3.2 Tasks

#### 3.2.1 Create Shared Utility Function

**File**: `packages/shared-types/src/utils/madCalculation.ts`

```typescript
/**
 * Calculate Mean Absolute Deviation (MAD) and Mean for a set of values
 * Reused from fn_polarizationIndex.ts
 */
export function calcMadAndMean(values: number[]): {
  mad: number;
  mean: number;
  n: number;
} {
  if (values.length === 0) return { mad: 0, mean: 0, n: 0 };
  if (values.length === 1) return { mad: 0, mean: values[0], n: 1 };

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const mad = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length;

  return { mad, mean, n: values.length };
}
```

#### 3.2.2 Create Types for Sign Polarization

**File**: `packages/shared-types/src/models/signPolarization/signPolarizationModel.ts`

```typescript
export interface ParagraphPolarization {
  paragraphId: string;
  documentId: string;
  content: string;

  // Overall metrics (all users)
  overallMAD: number;
  overallMean: number;
  overallN: number;

  // Demographic breakdown
  axes: ParagraphDemographicAxis[];

  lastUpdated: number;
}

export interface ParagraphDemographicAxis {
  axId: string;           // demographicQuestionId
  question: string;       // e.g., "Age Group"
  groupsMAD: number;      // MAD of group means (between-group divergence)
  groups: ParagraphDemographicGroup[];
}

export interface ParagraphDemographicGroup {
  option: string;         // e.g., "18-25"
  color?: string;
  mad: number;            // Within-group polarization
  mean: number;           // Group average approval (-1 to +1)
  n: number;              // Group size
}
```

#### 3.2.3 Create Firebase Function for Sign Polarization

**File**: `functions/src/sign/fn_signPolarization.ts`

```typescript
/**
 * Triggered when approval is created/updated in Sign app
 * Calculates paragraph polarization with demographic breakdown
 */
export const updateParagraphPolarization = functions.firestore
  .document('approval/{approvalId}')
  .onWrite(async (change, context) => {
    // 1. Get approval data and paragraph info
    // 2. Fetch user's demographic answers
    // 3. Save to signApprovalWithDemographics collection
    // 4. Fetch all approvals for the paragraph
    // 5. Calculate overall MAD and Mean
    // 6. Group by demographic answers, calculate per-group metrics
    // 7. Calculate groupsMAD for each axis
    // 8. Save to paragraphPolarization collection
  });
```

**New Collections**:
- `signApprovalWithDemographics` - Approvals with demographic info (doc ID: `{paragraphId}--{userId}`)
- `paragraphPolarization` - Calculated polarization data (doc ID: `{paragraphId}`)

#### 3.2.4 Create API to Fetch Polarization Data

**File**: `apps/sign/app/api/polarization/[docId]/route.ts`

```typescript
GET /api/polarization/{docId}

// Response
interface PolarizationResponse {
  paragraphs: ParagraphPolarization[];
  documentStats: {
    averageGroupsMAD: number;
    mostDivisiveParagraphs: string[];
    mostUnifiedParagraphs: string[];
  };
}
```

#### 3.2.5 Create Polarization Store

**File**: `apps/sign/src/store/polarizationStore.ts`

```typescript
interface PolarizationState {
  paragraphs: ParagraphPolarization[];
  selectedAxisId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPolarizationData: (docId: string) => Promise<void>;
  setSelectedAxis: (axisId: string | null) => void;
}
```

### 3.3 Acceptance Criteria

- [ ] Polarization calculated on approval events
- [ ] Each paragraph has MAD/Mean for overall and per-demographic
- [ ] groupsMAD shows divergence between demographic groups
- [ ] Data accessible via API
- [ ] Store manages state correctly

---

## Phase 4: Divergence Heatmap Mode

**Priority**: High | **Effort**: Medium | **Impact**: High

### 4.1 Objective

Add new heatmap type that shows groupsMAD (demographic divergence) per paragraph.

### 4.2 Tasks

#### 4.2.1 Add Divergence Type to Heatmap

**File**: `apps/sign/src/types/heatMap.ts`

```typescript
// Update HeatMapType
export type HeatMapType =
  | 'approval'
  | 'comments'
  | 'rating'
  | 'viewership'
  | 'divergence'  // NEW
  | 'none';

// Add divergence thresholds
export const HEAT_MAP_THRESHOLDS = {
  // ... existing
  divergence: [0.2, 0.4, 0.6, 0.8], // groupsMAD thresholds
};

// Divergence-specific labels
export const DIVERGENCE_LABELS = {
  1: 'All groups agree',
  2: 'Minor differences',
  3: 'Moderate divergence',
  4: 'Significant divergence',
  5: 'Strong disagreement',
};
```

#### 4.2.2 Update Heatmap API

**File**: `apps/sign/app/api/heatmap/[docId]/route.ts`

```typescript
// Add divergence data aggregation
async function aggregateDivergenceData(
  docId: string,
  demographicAxisId: string
): Promise<Record<string, number>> {
  // Fetch from paragraphPolarization collection
  // Return { paragraphId: groupsMAD }
}
```

#### 4.2.3 Update Heatmap Store

**File**: `apps/sign/src/store/heatMapStore.ts`

```typescript
interface HeatMapConfig {
  // ... existing
  selectedAxisId: string | null; // For divergence mode
}

// When type === 'divergence', also need to select which demographic axis
```

#### 4.2.4 Update HeatMapToolbar

**File**: `apps/sign/src/components/heatMap/HeatMapToolbar/HeatMapToolbar.tsx`

- Add divergence icon (e.g., split arrows)
- When divergence selected, show axis selector dropdown
- Show legend with divergence-specific colors

#### 4.2.5 Create Divergence Legend

**File**: `apps/sign/src/components/heatMap/DivergenceLegend/DivergenceLegend.tsx`

- Show 5-level scale from "All agree" to "Strong disagreement"
- Use distinctive color scheme (green to red)
- Show currently selected demographic axis

### 4.3 Color Variables

**File**: `apps/sign/src/styles/variables.scss`

```scss
// Divergence color scale
--divergence-low: #4caf50;         // Green - all agree
--divergence-medium-low: #8bc34a;  // Light green
--divergence-medium: #ffeb3b;      // Yellow
--divergence-medium-high: #ff9800; // Orange
--divergence-high: #f44336;        // Red - strong disagreement
```

### 4.4 Acceptance Criteria

- [ ] Divergence appears as 5th heatmap type option
- [ ] When selected, shows axis selector for demographic question
- [ ] Paragraphs colored by groupsMAD value
- [ ] Hovering shows detailed breakdown per demographic group
- [ ] Legend shows divergence scale

---

## Phase 5: 2D Polarization Map Visualization

**Priority**: Medium | **Effort**: High | **Impact**: Medium

### 5.1 Objective

Adapt the main app's 2D Polarization Index visualization for Sign documents.

### 5.2 Tasks

#### 5.2.1 Create SignPolarizationMap Component

**File**: `apps/sign/src/components/polarization/SignPolarizationMap/SignPolarizationMap.tsx`

Adapt from: `src/view/components/maps/polarizationIndex/PolarizationIndex.tsx`

```typescript
interface SignPolarizationMapProps {
  documentId: string;
}

// Features:
// - 2D scatter plot: X = Mean (-1 to +1), Y = MAD (0 to 1)
// - Large dots: Paragraph overall position
// - Small colored dots: Demographic group positions (on click)
// - Interactive: click paragraph to show demographic breakdown
// - Axis selector: switch between demographic questions
```

#### 5.2.2 Create Canvas Rendering Component

**File**: `apps/sign/src/components/polarization/SignPolarizationMap/SignPolarizationChart.tsx`

Adapt from: `src/view/components/maps/polarizationIndex/components/PolarizationChart.tsx`

- Render 2D coordinate system
- Draw triangle boundary
- Plot paragraph and group points
- Handle click/hover interactions

#### 5.2.3 Create Supporting Components

```
apps/sign/src/components/polarization/SignPolarizationMap/
├── SignPolarizationMap.tsx       # Main component
├── SignPolarizationMap.module.scss
├── SignPolarizationChart.tsx     # Canvas rendering
├── ParagraphSelector.tsx         # Select paragraph to focus
├── DemographicAxisSelector.tsx   # Select demographic axis
├── GroupDetails.tsx              # Show selected group info
└── StatsPanel.tsx                # Overall statistics
```

#### 5.2.4 Create Custom Hook

**File**: `apps/sign/src/hooks/useSignPolarization.ts`

```typescript
export function useSignPolarization(documentId: string) {
  // Returns:
  // - polarizationData
  // - selectedParagraph
  // - selectedAxis
  // - selectedGroup
  // - setSelectedParagraph
  // - setSelectedAxis
  // - setSelectedGroup
}
```

#### 5.2.5 Add to Admin View

**File**: `apps/sign/app/[docId]/admin/page.tsx`

- Add tab or section for "Polarization Analysis"
- Include SignPolarizationMap component

### 5.3 Acceptance Criteria

- [ ] 2D visualization renders correctly
- [ ] Paragraphs plotted based on overall MAD/Mean
- [ ] Clicking paragraph reveals demographic group dots
- [ ] Groups colored by demographic option
- [ ] Tooltips show MAD, Mean, N
- [ ] Can switch between demographic axes

---

## Phase 6: Multi-Segment Comparison View

**Priority**: Medium | **Effort**: High | **Impact**: Medium

### 6.1 Objective

Side-by-side comparison of heatmaps for different demographic segments.

### 6.2 Tasks

#### 6.2.1 Create Comparison API

**File**: `apps/sign/app/api/heatmap/[docId]/compare/route.ts`

```typescript
GET /api/heatmap/{docId}/compare?demographic={questionId}

// Response
interface HeatMapComparison {
  demographicQuestion: string;
  segments: Array<{
    value: string;
    label: string;
    count: number;
    data: HeatMapData;
  }>;
  divergence: DivergenceAnalysis;
}
```

#### 6.2.2 Create Comparison Store

**File**: `apps/sign/src/store/comparisonStore.ts`

```typescript
interface ComparisonState {
  isCompareMode: boolean;
  selectedDemographic: string | null;
  comparisonData: HeatMapComparison | null;
  isLoading: boolean;

  // Actions
  enableCompareMode: (demographic: string) => void;
  disableCompareMode: () => void;
  loadComparison: (docId: string, demographic: string) => Promise<void>;
}
```

#### 6.2.3 Create Comparison View Component

**File**: `apps/sign/src/components/heatMap/HeatMapComparison/HeatMapComparison.tsx`

```typescript
// Features:
// - Grid of mini-heatmaps, one per segment
// - Each shows segment name and respondent count
// - Color-coded by average approval/rating
// - Click segment to focus on it
// - Summary showing highest/lowest divergence paragraphs
```

#### 6.2.4 Integrate into HeatMapToolbar

- Add "Compare Segments" toggle
- When enabled, show demographic selector
- Switch main view to comparison mode

### 6.3 Acceptance Criteria

- [ ] Can enable comparison mode from toolbar
- [ ] Shows grid of all segments for selected demographic
- [ ] Each segment shows mini-heatmap
- [ ] Can click segment to filter main view
- [ ] Shows summary of highest divergence areas

---

## Phase 7: Full DCI Collaboration Matrix

**Priority**: Medium | **Effort**: High | **Impact**: Medium

### 7.1 Objective

Calculate and display pairwise Demographic Collaboration Index (DCI) between all demographic groups.

### 7.2 Tasks

#### 7.2.1 Create DCI Calculation Utility

**File**: `packages/shared-types/src/utils/dciCalculation.ts`

```typescript
/**
 * Calculate Demographic Collaboration Index between two groups
 * DCI = 1 - (|meanA - meanB| / 2)
 * Returns 0-1 where 1 = perfect agreement, 0 = maximum disagreement
 */
export function calculateDCI(meanA: number, meanB: number): number {
  const divergence = Math.abs(meanA - meanB) / 2;
  return 1 - divergence;
}

/**
 * Calculate full DCI matrix for all segment pairs
 */
export function calculateDCIMatrix(
  segments: Array<{ value: string; mean: number }>
): DCIMatrix {
  const matrix: number[][] = [];
  for (let i = 0; i < segments.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < segments.length; j++) {
      matrix[i][j] = calculateDCI(segments[i].mean, segments[j].mean);
    }
  }
  return { segments: segments.map(s => s.value), matrix };
}
```

#### 7.2.2 Create Types

**File**: `packages/shared-types/src/models/signPolarization/dciModel.ts`

```typescript
export interface DCIMatrix {
  segments: string[];
  matrix: number[][];
}

export interface DemographicCollaboration {
  documentId: string;
  demographicQuestionId: string;
  calculatedAt: number;
  matrix: DCIMatrix;
  topAgreeing: Array<{ pair: [string, string]; dci: number }>;
  topDiverging: Array<{ pair: [string, string]; dci: number }>;
  clusters?: CollaborationCluster[];
}

export interface CollaborationCluster {
  position: 'support' | 'oppose' | 'neutral';
  segments: string[];
  averageMean: number;
  internalDCI: number;
}
```

#### 7.2.3 Create Collaboration Matrix API

**File**: `apps/sign/app/api/collaboration/[docId]/route.ts`

```typescript
GET /api/collaboration/{docId}?demographic={questionId}

// Response: DemographicCollaboration
```

#### 7.2.4 Create Collaboration Matrix Component

**File**: `apps/sign/src/components/collaboration/CollaborationMatrix/CollaborationMatrix.tsx`

```typescript
// Features:
// - N x N grid of DCI values
// - Color-coded: green (high DCI) to red (low DCI)
// - Row/column labels: demographic segment names
// - Highlight clusters of agreement
// - Show top agreeing and diverging pairs
```

#### 7.2.5 Create Cluster Detection

**File**: `apps/sign/src/utils/clusterDetection.ts`

```typescript
/**
 * Detect clusters of demographically similar groups
 * Using simple threshold-based clustering
 */
export function detectClusters(
  dciMatrix: DCIMatrix,
  threshold: number = 0.7
): CollaborationCluster[] {
  // Group segments with DCI > threshold
  // Identify position based on average mean
}
```

#### 7.2.6 Add to Admin View

- Add "Collaboration Analysis" section
- Show matrix visualization
- Show cluster summary
- Allow exporting matrix data

### 7.3 Acceptance Criteria

- [ ] DCI calculated for all segment pairs
- [ ] Matrix displayed with color coding
- [ ] Clusters identified and highlighted
- [ ] Top agreeing/diverging pairs listed
- [ ] Can export matrix to CSV

---

## Testing Strategy

### Unit Tests

#### Phase 1 Tests
```typescript
// apps/sign/src/__tests__/heatmap/demographicFilter.test.ts
describe('Demographic Filter', () => {
  it('should filter users by demographic segment');
  it('should aggregate heatmap data for filtered users');
  it('should return correct respondent count');
  it('should handle empty segments gracefully');
});
```

#### Phase 3 Tests
```typescript
// packages/shared-types/src/__tests__/madCalculation.test.ts
describe('calcMadAndMean', () => {
  it('should return 0 MAD for identical values');
  it('should return correct MAD for distributed values');
  it('should handle empty array');
  it('should handle single value');
});
```

#### Phase 7 Tests
```typescript
// packages/shared-types/src/__tests__/dciCalculation.test.ts
describe('calculateDCI', () => {
  it('should return 1 for identical means');
  it('should return 0 for opposite means (-1 and +1)');
  it('should return 0.5 for means at half distance');
});
```

### Integration Tests

```typescript
// apps/sign/src/__tests__/integration/demographicHeatmap.test.ts
describe('Demographic Heatmap Integration', () => {
  it('should load demographic questions on mount');
  it('should update heatmap when filter changes');
  it('should preserve filter across heatmap type changes');
  it('should export filtered data correctly');
});
```

### E2E Tests

```typescript
// apps/sign/e2e/demographicHeatmap.spec.ts
describe('Demographic Heatmap E2E', () => {
  it('should filter heatmap by demographic segment');
  it('should show divergence heatmap');
  it('should display polarization map');
  it('should export comparison CSV');
});
```

---

## Deployment Plan

### Phase 1 Deployment (Single-Segment Filter)

1. **Database**:
   - Create composite index: `usersData(statementId, userQuestionId, answer)`

2. **Backend**:
   - Deploy updated heatmap API
   - Test with staging document

3. **Frontend**:
   - Deploy new DemographicFilter component
   - Feature flag: `ENABLE_DEMOGRAPHIC_FILTER`

### Phase 3 Deployment (Polarization Index)

1. **Database**:
   - Create collections: `signApprovalWithDemographics`, `paragraphPolarization`
   - Create indexes for efficient queries

2. **Functions**:
   - Deploy `updateParagraphPolarization` function
   - Backfill existing approvals (one-time script)

3. **Frontend**:
   - Deploy polarization store and API integration

### Performance Monitoring

- Monitor Firestore read costs for demographic queries
- Set up alerts for slow API responses (>2s)
- Track cache hit rates for demographic heatmap data

### Rollback Plan

Each phase has independent feature flags:
- `ENABLE_DEMOGRAPHIC_FILTER` - Phase 1
- `ENABLE_DEMOGRAPHIC_EXPORT` - Phase 2
- `ENABLE_POLARIZATION_INDEX` - Phase 3
- `ENABLE_DIVERGENCE_HEATMAP` - Phase 4
- `ENABLE_POLARIZATION_MAP` - Phase 5
- `ENABLE_SEGMENT_COMPARISON` - Phase 6
- `ENABLE_DCI_MATRIX` - Phase 7

---

## File Summary

### New Files to Create

| Phase | File | Purpose |
|-------|------|---------|
| 1 | `apps/sign/src/components/heatMap/DemographicFilter/DemographicFilter.tsx` | Filter UI |
| 1 | `apps/sign/src/components/heatMap/DemographicFilter/DemographicFilter.module.scss` | Styles |
| 2 | `apps/sign/app/api/admin/export-demographic/[docId]/route.ts` | Comparison export |
| 3 | `packages/shared-types/src/utils/madCalculation.ts` | MAD calculation |
| 3 | `packages/shared-types/src/models/signPolarization/signPolarizationModel.ts` | Types |
| 3 | `functions/src/sign/fn_signPolarization.ts` | Firebase function |
| 3 | `apps/sign/app/api/polarization/[docId]/route.ts` | Polarization API |
| 3 | `apps/sign/src/store/polarizationStore.ts` | State management |
| 4 | `apps/sign/src/components/heatMap/DivergenceLegend/DivergenceLegend.tsx` | Legend |
| 5 | `apps/sign/src/components/polarization/SignPolarizationMap/` | Visualization |
| 5 | `apps/sign/src/hooks/useSignPolarization.ts` | Custom hook |
| 6 | `apps/sign/app/api/heatmap/[docId]/compare/route.ts` | Comparison API |
| 6 | `apps/sign/src/store/comparisonStore.ts` | Comparison state |
| 6 | `apps/sign/src/components/heatMap/HeatMapComparison/` | Comparison view |
| 7 | `packages/shared-types/src/utils/dciCalculation.ts` | DCI calculation |
| 7 | `packages/shared-types/src/models/signPolarization/dciModel.ts` | DCI types |
| 7 | `apps/sign/app/api/collaboration/[docId]/route.ts` | Collaboration API |
| 7 | `apps/sign/src/components/collaboration/CollaborationMatrix/` | Matrix view |
| 7 | `apps/sign/src/utils/clusterDetection.ts` | Cluster detection |

### Files to Modify

| Phase | File | Changes |
|-------|------|---------|
| 1 | `apps/sign/app/api/heatmap/[docId]/route.ts` | Add demographic filter params |
| 1 | `apps/sign/src/types/heatMap.ts` | Add DemographicFilter type |
| 1 | `apps/sign/src/store/heatMapStore.ts` | Add demographic filter state |
| 1 | `apps/sign/src/components/heatMap/HeatMapToolbar/HeatMapToolbar.tsx` | Integrate filter |
| 2 | `apps/sign/app/api/admin/export-detailed/[docId]/route.ts` | Add filter support |
| 4 | `apps/sign/src/types/heatMap.ts` | Add divergence type |
| 4 | `apps/sign/src/styles/variables.scss` | Add divergence colors |

---

## Dependencies

### External Packages (Already Installed)
- `zustand` - State management
- `firebase-admin` - Firebase functions
- `next` - API routes

### Internal Dependencies
- `packages/shared-types` - Shared type definitions
- `delib-npm` - Existing types (UserDemographicQuestion, etc.)

---

## Estimated Effort per Phase

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| 1 | 3-4 days | None |
| 2 | 1-2 days | Phase 1 |
| 3 | 3-4 days | None |
| 4 | 2-3 days | Phase 3 |
| 5 | 4-5 days | Phase 3 |
| 6 | 3-4 days | Phase 1 |
| 7 | 3-4 days | Phase 3, 6 |

**Total**: ~20-26 days

---

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Privacy threshold** | 5+ users | Standard k-anonymity, balances privacy and utility |
| **Update strategy** | Real-time | Firebase trigger on each approval, always current data |
| **Access control** | Demographic features admin-only | Base heatmap available to all users, demographic filtering/analysis admin-only |
| **Mobile support** | Responsive | Full mobile support with simplified visualizations on small screens |

### Implementation Notes from Decisions

#### Privacy (k-anonymity = 5)

```typescript
// constants/demographics.ts
export const DEMOGRAPHIC_CONSTANTS = {
  MIN_SEGMENT_SIZE: 5, // k-anonymity threshold
};

// In API responses, filter out small segments
function filterSmallSegments<T extends { n: number }>(
  groups: T[]
): T[] {
  return groups.filter(g => g.n >= DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE);
}
```

#### Real-time Updates

```typescript
// Firebase function trigger
export const updateParagraphPolarization = functions.firestore
  .document('approval/{approvalId}')
  .onWrite(async (change, context) => {
    // Recalculate on every approval change
  });
```

#### Access Control

**Available to ALL users:**
- `/api/heatmap/[docId]` - Base heatmap (approval, comments, rating, viewership)
- Heatmap visualization on document page

**Admin-only (new demographic features):**
- `/api/heatmap/[docId]?demographic=...` - Filtered heatmap by demographic
- `/api/heatmap/[docId]/compare` - Multi-segment comparison
- `/api/polarization/[docId]` - Polarization index data
- `/api/collaboration/[docId]` - DCI collaboration matrix
- `/api/admin/export-demographic/[docId]` - Demographic exports
- Divergence heatmap mode
- 2D Polarization Map visualization
- Collaboration Matrix view

```typescript
// API route middleware for demographic features
async function requireAdminForDemographicFeatures(
  request: NextRequest,
  docId: string
) {
  const demographic = request.nextUrl.searchParams.get('demographic');

  // Base heatmap (no demographic filter) is available to all
  if (!demographic) {
    return null; // No admin check needed
  }

  // Demographic filtering requires admin
  const user = await getAuthenticatedUser(request);
  const isAdmin = await checkAdminAccess(user.uid, docId);
  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Admin access required for demographic filtering' },
      { status: 403 }
    );
  }
  return null;
}
```

```typescript
// UI: Hide demographic filter for non-admins
const DemographicFilter: FC<Props> = ({ documentId }) => {
  const { isAdmin } = useDocumentPermissions(documentId);

  // Only render for admins
  if (!isAdmin) return null;

  return (
    <div className="demographic-filter">
      {/* Filter UI */}
    </div>
  );
};
```

#### Responsive Design

```scss
// Polarization map - simplified on mobile
.polarization-map {
  @media (max-width: 768px) {
    // Show list view instead of 2D scatter plot
    &__chart { display: none; }
    &__list { display: block; }
  }
}

// DCI matrix - scrollable on mobile
.collaboration-matrix {
  @media (max-width: 768px) {
    overflow-x: auto;
    font-size: 0.875rem;
  }
}
```

---

*Plan created: December 2024*
*Based on: demographic-heatmap-filtering.md paper*
*Decisions confirmed: December 2024*
