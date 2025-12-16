# Demographic Heatmap Filtering and Collaboration Analysis in Freedi Sign

**Authors:** Freedi Development Team
**Date:** December 2024
**Version:** 1.0

---

## Abstract

This paper proposes a comprehensive system for demographic-based filtering and analysis in the Freedi Sign application. We introduce mechanisms to segment heatmap visualizations by demographic groups, enhance CSV exports with demographic breakdowns, and adapt the main Freedi app's collaboration index to identify points of agreement and disagreement between different demographic segments. This approach enables administrators to gain deeper insights into how different population segments engage with and respond to documents.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Current System Architecture](#2-current-system-architecture)
3. [Proposed Demographic Heatmap Filtering](#3-proposed-demographic-heatmap-filtering)
4. [Enhanced CSV Export with Demographics](#4-enhanced-csv-export-with-demographics)
5. [Demographic Collaboration Index](#5-demographic-collaboration-index)
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

### 2.3 Collaboration Index in Main Freedi App

The main Freedi app calculates consensus using:

```
Score = Mean - SEM
Where:
- Mean = Σevaluations / N
- SEM = σ / √N (Standard Error of Mean)
- σ = max(observed_std_dev, 0.5)  // Floor prevents false certainty
```

**Agreement Range:** -1 (full disagreement) to +1 (full agreement)

**Key Insight:** This formula penalizes high variance and rewards consensus, making it ideal for measuring agreement within and between groups.

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

## 5. Demographic Collaboration Index

### 5.1 Core Concept

The **Demographic Collaboration Index (DCI)** measures how much two demographic segments agree or disagree on a specific topic. It adapts the Freedi consensus formula for between-group comparison.

### 5.2 Mathematical Foundation

For a given paragraph and metric (e.g., approval), comparing demographic groups A and B:

**Within-Group Scores:**
```
ScoreA = MeanA - SEMA
ScoreB = MeanB - SEMB
```

**Between-Group Agreement:**
```
DCI(A,B) = 1 - |ScoreA - ScoreB| / 2

Where:
- DCI = 1.0: Perfect agreement (both groups have identical scores)
- DCI = 0.5: Moderate divergence
- DCI = 0.0: Maximum disagreement (one group at -1, other at +1)
```

**Example:**
- Group A approval: +0.8 (strong support)
- Group B approval: -0.6 (strong opposition)
- Divergence: |0.8 - (-0.6)| / 2 = 0.7
- DCI: 1 - 0.7 = 0.3 (significant disagreement)

### 5.3 Extended Metrics

Beyond simple agreement, we calculate:

#### 5.3.1 Paragraph Divergence Score

Measures how controversial a paragraph is across demographics:

```typescript
DivergenceScore = standardDeviation(segmentScores)

// High divergence = controversial content
// Low divergence = consensus across demographics
```

#### 5.3.2 Demographic Polarization Index

Identifies if demographics cluster into opposing camps:

```typescript
interface PolarizationAnalysis {
  isPolarized: boolean;      // True if bimodal distribution
  clusters: Array<{
    position: 'support' | 'oppose';
    segments: string[];
    averageScore: number;
  }>;
  polarizationStrength: number; // 0-1 scale
}
```

#### 5.3.3 Cross-Demographic Correlation Matrix

Shows which demographic segments tend to agree:

```typescript
interface CorrelationMatrix {
  demographics: string[];
  correlations: number[][]; // Pearson correlation of approval patterns
}
```

### 5.4 Visualization Recommendations

**Triangle Map Adaptation:**

The main Freedi app uses a triangle map for consensus visualization. We can adapt this for demographic comparison:

```
                    ▲ Conflict (High Variance)
                   /\
                  /  \
                 /    \
                /      \
               /   •A   \     A = Group A position
              /          \    B = Group B position
             /    •B      \
            /              \
           /________________\
    Disagree              Agree

Distance A↔B indicates divergence between groups
```

**Heatmap Overlay Mode:**

Allow admin to select two demographic segments and view:
- **Side-by-side heatmaps** for direct comparison
- **Difference heatmap** showing divergence intensity
- **Color coding:** Green = agreement, Red = disagreement

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

This paper presents a comprehensive framework for integrating demographic analysis into the Freedi Sign application's heatmap and export features. By adapting the main Freedi app's collaboration index, we enable administrators to:

1. **Understand demographic differences** in document engagement and opinions
2. **Identify points of consensus and divergence** across population segments
3. **Export detailed demographic breakdowns** for further analysis
4. **Visualize collaboration patterns** through intuitive interfaces

The proposed implementation builds on existing infrastructure while introducing new capabilities that provide valuable insights for policy makers, organizations, and researchers.

### Key Contributions

1. **Demographic Heatmap Filtering:** Filter any heatmap type by demographic segment
2. **Demographic Collaboration Index (DCI):** Statistical measure of cross-demographic agreement
3. **Enhanced CSV Export:** Demographic-segmented exports with collaboration metrics
4. **Divergence Analysis:** Automatic identification of controversial content across demographics

### Implementation Priority

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| 1 | Single-segment heatmap filter | Medium | High |
| 2 | Demographic-filtered CSV export | Low | High |
| 3 | Multi-segment comparison view | High | High |
| 4 | Collaboration index calculation | Medium | Medium |
| 5 | Divergence heatmap mode | Medium | Medium |
| 6 | Full collaboration matrix | High | Medium |

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

*End of Document*
