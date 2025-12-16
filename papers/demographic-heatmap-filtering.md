# Demographic Heatmap Filtering and Collaboration Analysis in Freedi Sign

**Authors:** Freedi Development Team
**Date:** December 2024
**Version:** 1.0

---

## Abstract

This paper proposes a comprehensive system for demographic-based filtering and analysis in the Freedi Sign application. We introduce mechanisms to segment heatmap visualizations by demographic groups, enhance CSV exports with demographic breakdowns, and adapt the main Freedi app's **Polarization Index** (also known as "Collaboration Index") to identify points of agreement and disagreement between different demographic segments.

The main Freedi app already implements a sophisticated Polarization Index that uses **MAD (Mean Absolute Deviation)** to measure division within groups and **groupsMAD** to measure divergence between demographic groups. This paper documents how to adapt these proven concepts for Sign documents, enabling administrators to gain deeper insights into how different population segments engage with and respond to documents.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Current System Architecture](#2-current-system-architecture)
   - 2.1 Demographic Data Collection
   - 2.2 Current Heatmap System
   - 2.3 Consensus Scoring in Main Freedi App
   - 2.4 **Existing Polarization Index (Collaboration Index) in Main Freedi App**
3. [Proposed Demographic Heatmap Filtering](#3-proposed-demographic-heatmap-filtering)
4. [Enhanced CSV Export with Demographics](#4-enhanced-csv-export-with-demographics)
5. [Adapting Polarization Index for Sign App](#5-adapting-polarization-index-for-sign-app)
6. [Technical Implementation](#6-technical-implementation)
7. [User Interface Design](#7-user-interface-design)
8. [Performance Considerations](#8-performance-considerations)
9. [Future Work](#9-future-work)
10. [Conclusion](#10-conclusion)

---

## 1. Introduction

### 1.1 Motivation

The Freedi Sign application currently supports demographic surveys that collect user attributes such as age, gender, location, profession, or any custom-defined categories. While this data is collected and can be viewed in aggregate, there is currently no mechanism to:

1. **Filter heatmaps by demographic segments** - Administrators cannot see how different groups respond to specific paragraphs
2. **Compare engagement patterns** - No way to identify where demographics diverge in their opinions
3. **Export demographic-segmented data** - CSV exports don't support demographic filtering or comparison

Understanding demographic differences is crucial for:
- **Policy makers** who need to understand how different constituencies respond
- **Organizations** seeking to build consensus across diverse groups
- **Researchers** studying opinion patterns across demographics

### 1.2 Objectives

This paper proposes solutions to:

1. Enable demographic filtering on all four heatmap types (approval, comments, rating, viewership)
2. Introduce a **Demographic Collaboration Index** that adapts the main Freedi app's consensus scoring to compare demographic groups
3. Enhance CSV exports with demographic segmentation and comparative analysis
4. Provide clear visualizations showing where demographics agree and disagree

---

## 2. Current System Architecture

### 2.1 Demographic Data Collection

The Sign app collects demographics through the following structure:

```typescript
// Question Definition (userDemographicQuestions collection)
interface UserDemographicQuestion {
  userQuestionId: string;
  question: string;
  type: 'text' | 'textarea' | 'checkbox' | 'radio';
  options: DemographicOption[];
  statementId: string;
  scope: 'group' | 'statement' | 'sign';
  required: boolean;
}

// User Answer (usersData collection)
interface UserDemographicAnswer {
  userQuestionId: string;
  odlUserId: string;
  answer?: string;          // For text/radio
  answerOptions?: string[]; // For checkbox
  statementId: string;
}
```

**Collection Schema:**
- Document ID: `{userQuestionId}--{userId}`
- Enables efficient querying by question or by user

### 2.2 Current Heatmap System

The heatmap API aggregates data across four dimensions:

| Type | Source Collection | Metric | Scale |
|------|-------------------|--------|-------|
| Approval | `approvals` | Approve/reject ratio | -1 to +1 |
| Comments | `statements` | Comment count | 0 to N |
| Rating | `evaluations` | Average score | 0 to 5 |
| Viewership | `paragraphViews` | Unique viewers % | 0 to 100 |

**Current API Response:**
```typescript
interface HeatMapData {
  approval: Record<string, number>;   // paragraphId -> score
  comments: Record<string, number>;
  rating: Record<string, number>;
  viewership: Record<string, number>;
}
```

### 2.3 Consensus Scoring in Main Freedi App

The main Freedi app calculates individual statement consensus using:

```
Score = Mean - SEM
Where:
- Mean = Σevaluations / N
- SEM = σ / √N (Standard Error of Mean)
- σ = max(observed_std_dev, 0.5)  // Floor prevents false certainty
```

**Agreement Range:** -1 (full disagreement) to +1 (full agreement)

### 2.4 Existing Polarization Index (Collaboration Index) in Main Freedi App

The main Freedi app already includes a sophisticated **Polarization Index** visualization (labeled "Collaboration Index" in the UI) that shows how divided different demographic groups are on various topics. This existing system serves as the foundation for the Sign app implementation.

#### 2.4.1 Component Location

```
src/view/components/maps/polarizationIndex/
├── PolarizationIndex.tsx          # Main visualization component
├── PolarizationIndex.module.scss  # Styling
├── types/index.ts                 # Type definitions
├── hooks/                         # Custom hooks
│   ├── usePolarizationData.ts
│   ├── useCanvasInteractions.ts
│   └── useResponsiveDimensions.ts
├── components/                    # Sub-components
│   ├── PolarizationChart.tsx      # Canvas-based chart
│   ├── AllStatementsOverview.tsx  # Summary cards
│   ├── AxisSelector.tsx           # Demographic axis selector
│   ├── StatsPanel.tsx             # Metrics display
│   ├── GroupsList.tsx             # Demographic groups grid
│   └── GroupDetails.tsx           # Selected group details
└── utils/canvasUtils.ts           # Coordinate transformations
```

#### 2.4.2 MAD (Mean Absolute Deviation) - The Core Metric

The Polarization Index uses **MAD** as the primary measure of polarization/division:

```typescript
// From functions/src/fn_polarizationIndex.ts
function calcMadAndMean(values: number[]): { mad: number, mean: number, n: number } {
  if (values.length === 0) return { mad: 0, mean: 0, n: 0 };
  if (values.length === 1) return { mad: 0, mean: values[0], n: 1 };

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const mad = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length;

  return { mad, mean, n: values.length };
}
```

**MAD Formula:**
```
MAD = Σ|valueᵢ - mean| / n
```

**Interpretation:**
- **MAD = 0**: Complete consensus (all evaluations identical)
- **MAD = 1**: Maximum polarization (evaluations at opposite extremes)
- **MAD = 0.5**: Moderate division

#### 2.4.3 2D Triangle Visualization

The component plots data on a 2D coordinate system:

```
         MAD = 1 (High Polarization)
              ▲
              │      • Statement A
              │         (divided opinions)
              │
              │    • Group X
              │      • Group Y
              │
              │         • Statement B
              │           (broad consensus)
              │
         MAD = 0 ──────────────────────────────► Mean
           Mean = -1              Mean = 0              Mean = +1
         (Opposition)           (Neutral)            (Support)
```

**Coordinate Calculation:**
```typescript
// From PolarizationIndex.tsx
function calculatePosition(
  mad: number,
  mean: number,
  boardDimensions: { width: number; height: number }
): { x: number; y: number } {
  // Y: Inverted (high MAD at top, low MAD at bottom)
  const y = (1 - mad) * boardDimensions.height;

  // X: Normalized from [-1, 1] to [0, width]
  const x = (mean + 1) * boardDimensions.width / 2;

  return { x, y };
}
```

#### 2.4.4 Data Structure

```typescript
// From delib-npm/PolarizationIndex
interface PolarizationIndex {
  statementId: string;
  parentId: string;
  statement: string;           // Statement text

  // Overall metrics (all users)
  overallMAD: number;          // Polarization across all evaluators
  overallMean: number;         // Average agreement (-1 to +1)
  overallN: number;            // Number of evaluators
  averageAgreement: number;    // Same as overallMean

  lastUpdated: number;
  color: string;               // Statement color for visualization

  // Demographic breakdowns
  axes: AxesItem[];
}

interface AxesItem {
  axId: string;                // Demographic question ID
  question: string;            // e.g., "Age Group", "Location"
  groupsMAD: number;           // MAD of group MEANS (between-group variance)
  groups: DemographicGroup[];
}

interface DemographicGroup {
  option: {
    option: string;            // e.g., "18-25", "Urban"
    color?: string;            // Group color for visualization
  };
  mad: number;                 // Within-group polarization
  mean: number;                // Group average agreement
  n: number;                   // Group size
}
```

#### 2.4.5 Key Metrics Hierarchy

```
Statement Level
├── overallMAD: Polarization across ALL users
├── overallMean: Average agreement across ALL users
└── overallN: Total evaluators

Demographic Axis Level (e.g., "Age Group")
├── groupsMAD: Variance BETWEEN group means
│              High = groups disagree with each other
│              Low = groups align in their opinions
│
└── Groups (e.g., "18-25", "26-35", "36-50")
    ├── Group 1 (18-25)
    │   ├── mad: Within-group polarization
    │   ├── mean: Group average opinion
    │   └── n: Members in group
    │
    ├── Group 2 (26-35)
    │   ├── mad: Within-group polarization
    │   ├── mean: Group average opinion
    │   └── n: Members in group
    │
    └── ...
```

#### 2.4.6 GroupsMAD Calculation

The `groupsMAD` is calculated from the means of each demographic group, measuring **between-group divergence**:

```typescript
// From fn_polarizationIndex.ts
axes.forEach((ax: AxesItem) => {
  const values: number[] = [];
  ax.groups?.forEach((group: { mean: number; }) => {
    values.push(group.mean);  // Collect all group means
  });
  const { mad: groupMAD } = calcMadAndMean(values);
  ax.groupsMAD = groupMAD;  // MAD of the group means
});
```

**Interpretation of groupsMAD:**
- **groupsMAD ≈ 0**: All demographic groups have similar average opinions
- **groupsMAD ≈ 0.5**: Moderate divergence between groups
- **groupsMAD ≈ 1**: Demographic groups have opposing opinions

#### 2.4.7 Visualization Behavior

1. **Statement Points (Large Dots)**:
   - Position based on `overallMAD` (Y) and `overallMean` (X)
   - Click to reveal demographic group breakdown

2. **Group Points (Small Colored Dots)**:
   - Appear when a statement is selected
   - Each dot represents one demographic group (e.g., "18-25" age group)
   - Position based on group's `mad` (Y) and `mean` (X)
   - Color corresponds to demographic option color
   - Size can indicate group size (n)

3. **Interactive Features**:
   - Tooltips show: `{option} MAD: {mad}, Mean: {mean}, N: {n}`
   - Click statement → expand to show groups
   - Switch demographic axis to see different groupings

#### 2.4.8 Firebase Function Integration

The Polarization Index is updated automatically when users evaluate statements:

```typescript
// Trigger: User evaluation creates/updates
// Function: updateUserDemographicEvaluation()
// Collection: polarizationIndex

// Data flow:
1. User submits evaluation
2. Function fetches user's demographic answers
3. Function fetches all evaluations for the statement
4. Calculates overallMAD, overallMean, overallN
5. For each demographic axis:
   a. Groups evaluations by demographic option
   b. Calculates per-group mad, mean, n
   c. Calculates groupsMAD from group means
6. Saves to polarizationIndex collection
```

---

## 3. Proposed Demographic Heatmap Filtering

### 3.1 Filter Architecture

We propose extending the heatmap API to support demographic segmentation:

```typescript
// New API Request
GET /api/heatmap/[docId]?demographic={questionId}&segment={optionValue}

// Extended Response
interface DemographicHeatMapData extends HeatMapData {
  segment: {
    questionId: string;
    questionLabel: string;
    segmentValue: string;
    segmentLabel: string;
    respondentCount: number;
  };
}
```

### 3.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Request                               │
│  GET /api/heatmap/{docId}?demographic=age&segment=18-25         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   1. Identify Users in Segment                   │
│  Query usersData where userQuestionId = "age"                   │
│  Filter where answer = "18-25"                                   │
│  Result: Set<userId> of users aged 18-25                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              2. Filter Data Collections by Users                 │
│  - approvals WHERE userId IN segmentUsers                        │
│  - statements (comments) WHERE creatorId IN segmentUsers        │
│  - evaluations WHERE odlUserId IN segmentUsers                  │
│  - paragraphViews WHERE visitorId IN segmentUsers               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  3. Aggregate Filtered Data                      │
│  Calculate approval, comments, rating, viewership               │
│  using only filtered subset of data                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    4. Return Segmented Data                      │
│  HeatMapData + segment metadata (respondent count, labels)      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Multi-Segment Comparison Mode

For comparative analysis, we introduce a comparison mode:

```typescript
// Comparison API Request
GET /api/heatmap/[docId]/compare?demographic={questionId}

// Response with all segments
interface HeatMapComparison {
  segments: Array<{
    value: string;
    label: string;
    count: number;
    data: HeatMapData;
  }>;
  divergence: DivergenceAnalysis;
}
```

---

## 4. Enhanced CSV Export with Demographics

### 4.1 Demographic-Filtered Export

Extend the detailed export to support demographic filtering:

```typescript
// API Endpoint
GET /api/admin/export-detailed/[docId]?demographic={questionId}&segment={value}

// Additional columns in filtered export:
- Filter Applied: {question} = {value}
- Segment Size: N respondents
- Segment Percentage: X% of total
```

### 4.2 Comparative Export Format

A new export type specifically for demographic comparison:

```typescript
GET /api/admin/export-demographic/[docId]

// CSV Structure:
// Section 1: Per-Paragraph Demographic Breakdown
Paragraph ID | Content | Demographic | Segment | Approval | Comments | Rating | Views

// Example:
para_001 | "Introduction text..." | Age | 18-25 | 0.75 | 12 | 4.2 | 85%
para_001 | "Introduction text..." | Age | 26-35 | 0.82 | 8 | 4.5 | 78%
para_001 | "Introduction text..." | Age | 36-50 | 0.45 | 15 | 3.8 | 92%

// Section 2: Collaboration Index Summary
Paragraph ID | Most Agreeing Segments | Most Disagreeing Segments | Max Divergence

// Section 3: Cross-Demographic Collaboration Matrix
           | 18-25 | 26-35 | 36-50 | 51+ |
18-25      | 1.00  | 0.85  | 0.42  | 0.38 |
26-35      | 0.85  | 1.00  | 0.55  | 0.48 |
36-50      | 0.42  | 0.55  | 1.00  | 0.92 |
51+        | 0.38  | 0.48  | 0.92  | 1.00 |
```

### 4.3 Export API Design

```typescript
interface DemographicExportOptions {
  docId: string;
  demographic?: string;           // Filter by specific demographic
  segment?: string;               // Filter by specific segment value
  compareMode?: 'segments' | 'matrix';
  includeCollaborationIndex?: boolean;
  format?: 'csv' | 'json';
}
```

---

## 5. Adapting Polarization Index for Sign App

### 5.1 Foundation: Existing Polarization Index

The Sign app's demographic collaboration features are built upon the **existing Polarization Index** from the main Freedi app (documented in Section 2.4). The key concepts to adapt are:

| Main App Concept | Sign App Adaptation |
|------------------|---------------------|
| Statement evaluations (-1 to +1) | Paragraph approvals (-1 to +1) |
| `overallMAD` (statement polarization) | `paragraphMAD` (paragraph polarization) |
| `groupsMAD` (between-group divergence) | Same - measures demographic divergence |
| Per-group `mean` and `mad` | Same - per demographic segment metrics |
| 2D visualization (MAD vs Mean) | Same visualization for Sign documents |

### 5.2 MAD-Based Metrics for Sign

Using the same MAD calculation from the main app:

```typescript
// Reuse from main app: functions/src/fn_polarizationIndex.ts
function calcMadAndMean(values: number[]): { mad: number, mean: number, n: number } {
  if (values.length === 0) return { mad: 0, mean: 0, n: 0 };
  if (values.length === 1) return { mad: 0, mean: values[0], n: 1 };

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const mad = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length;

  return { mad, mean, n: values.length };
}
```

**Applied to Sign paragraphs:**

```typescript
interface ParagraphPolarization {
  paragraphId: string;
  content: string;

  // Overall metrics (all users)
  overallMAD: number;          // How divided are ALL users on this paragraph
  overallMean: number;         // Average approval (-1 reject, +1 approve)
  overallN: number;            // Total voters

  // Demographic breakdown
  axes: Array<{
    demographicQuestionId: string;
    question: string;          // e.g., "Age Group"
    groupsMAD: number;         // How much do demographic groups DIFFER
    groups: Array<{
      option: string;          // e.g., "18-25"
      color: string;
      mad: number;             // Within-group division
      mean: number;            // Group average approval
      n: number;               // Group size
    }>;
  }>;
}
```

### 5.3 Key Metrics Explained

#### 5.3.1 Paragraph-Level Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| **overallMean** | Σ(approvals) / N | Average approval: -1 to +1 |
| **overallMAD** | Σ\|approvalᵢ - mean\| / N | Overall division on paragraph |

#### 5.3.2 Demographic Axis Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| **groupsMAD** | MAD of group means | How much demographics DISAGREE with each other |
| **group.mean** | Σ(group approvals) / group.n | Group's average position |
| **group.mad** | MAD within group | Division WITHIN the demographic group |

#### 5.3.3 Interpreting groupsMAD (Between-Group Divergence)

This is the **key metric for demographic collaboration**:

```
groupsMAD = 0.0  → All demographics agree
groupsMAD = 0.3  → Minor differences between demographics
groupsMAD = 0.5  → Moderate divergence - some demographics differ
groupsMAD = 0.7  → Significant divergence - demographics disagree
groupsMAD = 1.0  → Maximum polarization - demographics at opposite poles
```

**Example:**
```
Paragraph: "Funding allocation should prioritize urban areas"

Age Group Analysis:
  groupsMAD: 0.72 (HIGH - age groups strongly disagree)

  18-25: mean = +0.65, mad = 0.12, n = 45  (strong support, unified)
  26-35: mean = +0.42, mad = 0.25, n = 78  (moderate support)
  36-50: mean = -0.15, mad = 0.35, n = 52  (slight opposition, divided)
  51+:   mean = -0.58, mad = 0.18, n = 31  (strong opposition, unified)

Insight: Clear generational divide - younger groups support, older oppose
```

### 5.4 Collaboration Index Calculation

For pairwise comparison between demographic groups, we introduce the **Demographic Collaboration Index (DCI)**:

```typescript
// Collaboration between two groups based on their means
function calculateDCI(groupA: { mean: number }, groupB: { mean: number }): number {
  // Difference in means, normalized to 0-1 scale
  const divergence = Math.abs(groupA.mean - groupB.mean) / 2;

  // DCI: 1 = perfect agreement, 0 = maximum disagreement
  return 1 - divergence;
}

// Example:
// Group A mean: +0.8, Group B mean: -0.6
// divergence = |0.8 - (-0.6)| / 2 = 0.7
// DCI = 1 - 0.7 = 0.3 (significant disagreement)
```

**DCI Matrix:**
```
             18-25  26-35  36-50   51+
18-25        1.00   0.89   0.60   0.39
26-35        0.89   1.00   0.71   0.50
36-50        0.60   0.71   1.00   0.79
51+          0.39   0.50   0.79   1.00

Clusters identified:
- Young cluster (18-35): High internal DCI (0.89)
- Older cluster (36+): High internal DCI (0.79)
- Cross-cluster DCI: 0.39-0.60 (significant divergence)
```

### 5.5 Visualization: 2D Polarization Map for Sign

Adapt the main app's visualization for Sign documents:

```
         MAD = 1 (High Polarization)
              ▲
              │    ○ Para 3 (controversial)
              │       • 18-25 (support)
              │                    • 51+ (oppose)
              │
              │
              │           ○ Para 1 (moderate)
              │             • All groups clustered
              │
              │                      ○ Para 5 (consensus)
              │                        • Groups aligned
         MAD = 0 ──────────────────────────────────────► Mean
           Mean = -1              Mean = 0              Mean = +1
            (Reject)            (Neutral)             (Approve)

Legend:
  ○ = Paragraph overall position
  • = Demographic group position (colored by group)
```

**Interactive Features:**
1. Click paragraph → reveal demographic group positions
2. Select demographic axis → switch between age/location/etc.
3. Hover group → show `{group}: MAD={mad}, Mean={mean}, N={n}`
4. Highlight high-divergence paragraphs (groupsMAD > 0.5)

### 5.6 Additional Metrics

#### 5.6.1 Document-Level Divergence Score

Average groupsMAD across all paragraphs:

```typescript
const documentDivergence = paragraphs.reduce(
  (sum, p) => sum + p.axes[selectedAxis].groupsMAD, 0
) / paragraphs.length;
```

#### 5.6.2 Most Divisive Paragraphs

Paragraphs ranked by groupsMAD:

```typescript
const mostDivisive = paragraphs
  .sort((a, b) => b.groupsMAD - a.groupsMAD)
  .slice(0, 5);
```

#### 5.6.3 Demographic Polarization Detection

Identify if demographics cluster into opposing camps:

```typescript
interface PolarizationAnalysis {
  isPolarized: boolean;         // True if bimodal distribution
  clusters: Array<{
    position: 'support' | 'oppose';
    segments: string[];         // Demographics in this cluster
    averageScore: number;
  }>;
  polarizationStrength: number; // 0-1 scale (groupsMAD)
}
```

### 5.7 Heatmap Integration

Combine the Polarization Index with heatmap visualization:

**Divergence Heatmap Mode:**
- Instead of showing approval/comments, show **groupsMAD** per paragraph
- High divergence = red (demographics disagree)
- Low divergence = green (demographics agree)

```
┌────────────────────────────────────────────────────────────────────────┐
│  Heatmap Mode: [Demographic Divergence ▼]  Axis: [Age Group ▼]         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Paragraph 1: "Introduction..."                                         │
│  ░░░░░░░░░░░░░░░░░░░░░░  groupsMAD: 0.12 (All ages agree)              │
│                                                                         │
│  Paragraph 3: "Funding allocation..."                                   │
│  ████████████████████████  groupsMAD: 0.72 (Age divide!)               │
│  18-25: +0.65 | 26-35: +0.42 | 36-50: -0.15 | 51+: -0.58              │
│                                                                         │
│  Paragraph 5: "Implementation timeline..."                              │
│  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒  groupsMAD: 0.35 (Minor differences)                  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Technical Implementation

### 6.1 Database Schema Extensions

#### 6.1.1 Pre-Aggregated Demographic Stats (Optional Optimization)

```typescript
// Collection: demographicHeatmapCache
interface DemographicHeatmapCache {
  documentId: string;
  demographicQuestionId: string;
  segmentValue: string;
  lastUpdated: number;
  data: {
    approval: Record<string, number>;
    comments: Record<string, number>;
    rating: Record<string, number>;
    viewership: Record<string, number>;
  };
  respondentCount: number;
}
```

#### 6.1.2 Collaboration Index Storage

```typescript
// Collection: demographicCollaboration
interface DemographicCollaboration {
  documentId: string;
  demographicQuestionId: string;
  calculatedAt: number;
  matrix: Record<string, Record<string, number>>; // segment -> segment -> DCI
  paragraphDivergence: Record<string, number>;
  topDivergentParagraphs: string[];
  topAligningParagraphs: string[];
}
```

### 6.2 API Endpoints

#### 6.2.1 Filtered Heatmap

```typescript
// apps/sign/app/api/heatmap/[docId]/route.ts

export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } }
) {
  const demographic = request.nextUrl.searchParams.get('demographic');
  const segment = request.nextUrl.searchParams.get('segment');

  if (demographic && segment) {
    // Get users in this demographic segment
    const segmentUsers = await getUsersInSegment(
      params.docId,
      demographic,
      segment
    );

    // Aggregate heatmap data for only these users
    return aggregateHeatmapForUsers(params.docId, segmentUsers);
  }

  // Default: return full heatmap
  return aggregateFullHeatmap(params.docId);
}
```

#### 6.2.2 Comparison API

```typescript
// apps/sign/app/api/heatmap/[docId]/compare/route.ts

export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } }
) {
  const demographic = request.nextUrl.searchParams.get('demographic');

  // Get all segments for this demographic question
  const segments = await getDemographicSegments(params.docId, demographic);

  // Calculate heatmap for each segment
  const segmentData = await Promise.all(
    segments.map(segment =>
      aggregateHeatmapForSegment(params.docId, demographic, segment)
    )
  );

  // Calculate collaboration indices
  const collaborationMatrix = calculateCollaborationMatrix(segmentData);
  const divergence = calculateDivergenceAnalysis(segmentData);

  return NextResponse.json({
    segments: segmentData,
    collaboration: collaborationMatrix,
    divergence
  });
}
```

#### 6.2.3 Demographic Export

```typescript
// apps/sign/app/api/admin/export-demographic/[docId]/route.ts

export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } }
) {
  const demographic = request.nextUrl.searchParams.get('demographic');
  const includeMatrix = request.nextUrl.searchParams.get('matrix') === 'true';

  // Build CSV with demographic breakdown
  const csv = await buildDemographicExport({
    docId: params.docId,
    demographic,
    includeMatrix,
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="demographic-analysis-${params.docId}.csv"`
    }
  });
}
```

### 6.3 Frontend State Management

```typescript
// apps/sign/src/store/heatMapStore.ts - Extensions

interface DemographicFilter {
  questionId: string | null;
  segmentValue: string | null;
  compareMode: boolean;
}

interface HeatMapState {
  // ... existing state

  // Demographic filtering
  demographicFilter: DemographicFilter;
  availableDemographics: DemographicQuestion[];
  comparisonData: HeatMapComparison | null;
  collaborationIndex: CollaborationMatrix | null;

  // Actions
  setDemographicFilter: (filter: DemographicFilter) => void;
  loadDemographicComparison: (docId: string, demographic: string) => Promise<void>;
  clearDemographicFilter: () => void;
}
```

### 6.4 Key Implementation Functions

```typescript
// Collaboration Index Calculation

function calculateCollaborationIndex(
  scoreA: number,
  scoreB: number
): number {
  const divergence = Math.abs(scoreA - scoreB) / 2;
  return 1 - divergence;
}

function calculateDivergenceScore(
  segmentScores: Record<string, number>
): number {
  const values = Object.values(segmentScores);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function identifyDivergentParagraphs(
  comparisonData: HeatMapComparison,
  metric: 'approval' | 'rating',
  threshold: number = 0.5
): string[] {
  const paragraphIds = Object.keys(comparisonData.segments[0].data[metric]);

  return paragraphIds.filter(paragraphId => {
    const scores = comparisonData.segments.map(
      s => s.data[metric][paragraphId] || 0
    );
    return calculateDivergenceScore(
      Object.fromEntries(scores.map((s, i) => [i.toString(), s]))
    ) >= threshold;
  });
}
```

---

## 7. User Interface Design

### 7.1 Demographic Filter Toolbar

Add demographic selection to the existing HeatMapToolbar:

```
┌──────────────────────────────────────────────────────────┐
│  Heatmap Type: [Approval ▼]                              │
│                                                          │
│  ┌─ Demographic Filter ─────────────────────────────┐   │
│  │  Question: [Age Group ▼]                         │   │
│  │  Segment:  [18-25     ▼]  [✓] Compare All       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [Apply Filter]  [Clear]  [Export Comparison]           │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Comparison View Layout

```
┌────────────────────────────────────────────────────────────────────────┐
│  Demographic Comparison: Age Group                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │    18-25        │  │    26-35        │  │    36-50        │        │
│  │    (42 users)   │  │    (78 users)   │  │    (35 users)   │        │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤        │
│  │ ████████░░      │  │ ██████████      │  │ ████░░░░░░      │        │
│  │ +0.65           │  │ +0.92           │  │ +0.28           │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                         │
│  Collaboration Index: 18-25 ↔ 26-35: 0.87 (High Agreement)             │
│                       18-25 ↔ 36-50: 0.42 (Moderate Divergence)        │
│                       26-35 ↔ 36-50: 0.48 (Moderate Divergence)        │
│                                                                         │
│  ⚠️ High Divergence Detected on: Paragraph 3, Paragraph 7              │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Divergence Heatmap Mode

A special heatmap mode showing where demographics diverge:

```
┌────────────────────────────────────────────────────────────────────────┐
│  View Mode: [Divergence Heatmap]                                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Paragraph 1: "Introduction to policy..."                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   │
│  │ Divergence: 0.12 (Low - All groups agree)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Paragraph 3: "Funding allocation..."                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ████████████████████████████████████████████████████████████████ │   │
│  │ Divergence: 0.89 (High - Significant disagreement)              │   │
│  │ 18-25: +0.72 | 26-35: +0.45 | 36-50: -0.35 | 51+: -0.62        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘

Legend: ░ Low Divergence ▒ Medium ▓ High █ Very High
```

### 7.4 Collaboration Matrix Panel

```
┌────────────────────────────────────────────────────────────────────────┐
│  Cross-Demographic Collaboration Matrix                                 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│              18-25   26-35   36-50    51+                              │
│         ┌────────────────────────────────┐                             │
│  18-25  │  1.00    0.87    0.42    0.38  │  ← Strong alignment        │
│  26-35  │  0.87    1.00    0.55    0.48  │    with 26-35              │
│  36-50  │  0.42    0.55    1.00    0.92  │  ← Strong alignment        │
│  51+    │  0.38    0.48    0.92    1.00  │    with 36-50              │
│         └────────────────────────────────┘                             │
│                                                                         │
│  Key Findings:                                                          │
│  • Younger groups (18-35) form one cluster                             │
│  • Older groups (36+) form another cluster                             │
│  • Maximum divergence: 18-25 ↔ 51+ (0.38)                              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Performance Considerations

### 8.1 Query Optimization

**Challenge:** Filtering by demographic requires joining user data with engagement data.

**Solutions:**

1. **Denormalization:** Store userId in all engagement collections (already done for most)

2. **Indexed Queries:** Ensure composite indexes exist:
   ```
   usersData: (statementId, userQuestionId, answer)
   approvals: (topParentId, odlUserId)
   statements: (topParentId, creatorId, hide)
   ```

3. **Caching:** Pre-compute demographic heatmaps for common filter combinations:
   ```typescript
   // Cache key format
   `heatmap:${docId}:${demographicId}:${segmentValue}`

   // Cache invalidation triggers
   - New approval/rejection
   - New comment
   - New evaluation
   - New view record
   ```

### 8.2 Real-time vs. Batch Processing

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| Real-time | Always current | High query cost | Small documents (<100 users) |
| Batch | Fast queries | Stale data | Large documents |
| Hybrid | Balanced | Complexity | Documents >100 users |

**Hybrid Implementation:**
```typescript
// Check cache freshness
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getHeatmapWithDemographic(
  docId: string,
  demographic: string,
  segment: string
): Promise<HeatMapData> {
  const cacheKey = `heatmap:${docId}:${demographic}:${segment}`;
  const cached = await cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Compute fresh data
  const data = await computeHeatmapForSegment(docId, demographic, segment);
  await cache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
}
```

### 8.3 Estimated Query Costs

| Operation | Firestore Reads | Estimated Cost |
|-----------|-----------------|----------------|
| Full heatmap | ~N paragraphs × 4 queries | Low |
| Single segment filter | + M users in segment | Low-Medium |
| All segments comparison | × K segments | Medium-High |
| Full matrix calculation | K² × N paragraphs | High (cache recommended) |

---

## 9. Future Work

### 9.1 Machine Learning Integration

- **Clustering Analysis:** Automatically detect demographic groups with similar opinions
- **Prediction Models:** Predict likely positions of users based on demographics
- **Anomaly Detection:** Flag unusual voting patterns within demographics

### 9.2 Advanced Visualizations

- **Sankey Diagrams:** Show flow of opinions across demographic dimensions
- **Radar Charts:** Compare multiple demographics across multiple metrics
- **Time-Series Analysis:** Track how demographic opinions evolve over document lifecycle

### 9.3 Cross-Document Analysis

- **Meta-Analysis:** Compare demographic patterns across multiple documents
- **Institutional Insights:** Aggregate findings for organizations with many documents
- **Trend Analysis:** Identify shifting demographic attitudes over time

### 9.4 Privacy Considerations

- **k-Anonymity:** Ensure segments have minimum size to prevent identification
- **Differential Privacy:** Add noise to small segments
- **Aggregation Thresholds:** Hide segment data if respondents < threshold

---

## 10. Conclusion

This paper presents a comprehensive framework for integrating demographic analysis into the Freedi Sign application's heatmap and export features. By adapting the main Freedi app's **existing Polarization Index** (labeled "Collaboration Index" in the UI), we leverage proven concepts including:

- **MAD (Mean Absolute Deviation)** for measuring polarization/division
- **groupsMAD** for measuring between-demographic divergence
- **2D visualization** (MAD vs Mean) for intuitive understanding

The Sign app adaptation enables administrators to:

1. **Understand demographic differences** in document engagement and opinions
2. **Identify points of consensus and divergence** across population segments using groupsMAD
3. **Export detailed demographic breakdowns** for further analysis
4. **Visualize collaboration patterns** through the adapted 2D polarization map

### Key Contributions

1. **Demographic Heatmap Filtering:** Filter any heatmap type by demographic segment
2. **Polarization Index Adaptation:** Reuse MAD-based metrics from main app for Sign paragraphs
3. **groupsMAD Integration:** Show where demographics agree vs. disagree per paragraph
4. **Demographic Collaboration Index (DCI):** Pairwise measure of cross-demographic agreement
5. **Enhanced CSV Export:** Demographic-segmented exports with polarization metrics
6. **Divergence Heatmap Mode:** New heatmap type showing groupsMAD per paragraph

### Implementation Priority

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| 1 | Single-segment heatmap filter | Medium | High |
| 2 | Demographic-filtered CSV export | Low | High |
| 3 | Polarization Index calculation for Sign | Medium | High |
| 4 | groupsMAD-based divergence heatmap | Medium | High |
| 5 | 2D Polarization Map visualization | High | Medium |
| 6 | Multi-segment comparison view | High | Medium |
| 7 | Full DCI collaboration matrix | High | Medium |

---

## Appendix A: API Reference

### A.1 Heatmap API with Demographics

```http
GET /api/heatmap/{docId}
Query Parameters:
  - demographic: string (question ID)
  - segment: string (segment value)

Response: HeatMapData | DemographicHeatMapData
```

### A.2 Comparison API

```http
GET /api/heatmap/{docId}/compare
Query Parameters:
  - demographic: string (question ID, required)
  - metric: 'approval' | 'comments' | 'rating' | 'viewership'

Response: HeatMapComparison
```

### A.3 Demographic Export API

```http
GET /api/admin/export-demographic/{docId}
Query Parameters:
  - demographic: string (filter by specific demographic)
  - segment: string (filter by specific segment)
  - matrix: boolean (include collaboration matrix)
  - format: 'csv' | 'json'

Response: CSV file or JSON data
```

---

## Appendix B: Type Definitions

```typescript
// Demographic Collaboration Types

interface CollaborationMatrix {
  demographicQuestion: string;
  segments: string[];
  matrix: number[][];  // Pairwise collaboration indices
  topAgreeing: Array<{ pair: [string, string]; index: number }>;
  topDiverging: Array<{ pair: [string, string]; index: number }>;
}

interface DivergenceAnalysis {
  paragraphScores: Record<string, number>;
  highDivergence: string[];  // Paragraph IDs with score > 0.5
  lowDivergence: string[];   // Paragraph IDs with score < 0.2
  overallDivergence: number;
}

interface PolarizationAnalysis {
  isPolarized: boolean;
  clusters: Array<{
    position: 'support' | 'oppose' | 'neutral';
    segments: string[];
    averageScore: number;
  }>;
  polarizationStrength: number;
}

interface DemographicHeatMapData extends HeatMapData {
  segment: {
    questionId: string;
    questionLabel: string;
    segmentValue: string;
    segmentLabel: string;
    respondentCount: number;
  };
}

interface HeatMapComparison {
  demographicQuestion: string;
  segments: Array<{
    value: string;
    label: string;
    count: number;
    data: HeatMapData;
  }>;
  collaboration: CollaborationMatrix;
  divergence: DivergenceAnalysis;
  polarization?: PolarizationAnalysis;
}
```

---

## Appendix C: Color Scales

### C.1 Divergence Color Scale

| Level | Divergence Range | Color Variable | Meaning |
|-------|------------------|----------------|---------|
| 1 | 0.00 - 0.20 | `--divergence-low` | High agreement |
| 2 | 0.20 - 0.40 | `--divergence-medium-low` | Slight differences |
| 3 | 0.40 - 0.60 | `--divergence-medium` | Moderate divergence |
| 4 | 0.60 - 0.80 | `--divergence-medium-high` | Significant divergence |
| 5 | 0.80 - 1.00 | `--divergence-high` | Strong disagreement |

### C.2 Collaboration Index Colors

| Range | Color | Meaning |
|-------|-------|---------|
| 0.80 - 1.00 | Green | Strong collaboration |
| 0.60 - 0.80 | Light Green | Good collaboration |
| 0.40 - 0.60 | Yellow | Moderate |
| 0.20 - 0.40 | Orange | Weak collaboration |
| 0.00 - 0.20 | Red | Opposing views |

---

## Appendix D: Main App Source File References

### D.1 Polarization Index Implementation

| File | Purpose |
|------|---------|
| `src/view/components/maps/polarizationIndex/PolarizationIndex.tsx` | Main visualization component |
| `src/view/components/maps/polarizationIndex/PolarizationIndex.module.scss` | Component styling |
| `src/view/components/maps/polarizationIndex/types/index.ts` | TypeScript type definitions |
| `functions/src/fn_polarizationIndex.ts` | Backend calculation engine with `calcMadAndMean()` |

### D.2 Data Models

| File | Purpose |
|------|---------|
| `packages/shared-types/src/models/polarizationIndex/` | `PolarizationIndex`, `AxesItem` types |
| `packages/shared-types/src/models/userDemographic/` | `UserDemographicQuestion` types |

### D.3 State Management

| File | Purpose |
|------|---------|
| `src/redux/userDemographic/userDemographicSlice.ts` | Redux state for polarization data |
| `src/controllers/db/polarizationIndex/getPolarizationIndex.ts` | Firebase listener |

### D.4 Sign App Files to Extend

| File | Purpose |
|------|---------|
| `apps/sign/app/api/heatmap/[docId]/route.ts` | Extend with demographic filtering |
| `apps/sign/app/api/admin/export-detailed/[docId]/route.ts` | Extend with demographic exports |
| `apps/sign/src/store/heatMapStore.ts` | Add demographic filter state |
| `apps/sign/src/components/heatMap/HeatMapToolbar/` | Add demographic filter UI |

### D.5 Key Functions to Reuse

```typescript
// From functions/src/fn_polarizationIndex.ts - Line 281
function calcMadAndMean(values: number[]): { mad: number, mean: number, n: number }

// From PolarizationIndex.tsx - Line 167
function calculatePosition(mad: number, mean: number, boardDimensions): { x: number, y: number }
```

---

*End of Document*
