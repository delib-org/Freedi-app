# Heat Maps Feature Plan - Sign App

## Overview

Implement heat map visualizations for document paragraphs to show user engagement metrics. Heat maps will be displayed directly on paragraphs and activated by users.

## Heat Map Types

1. **Approval Heat Map** - Shows approval rate percentage for each paragraph
2. **Comments Heat Map** - Shows comment count/activity per paragraph
3. **Rating Heat Map** - Shows average evaluation score per paragraph
4. **Viewership Heat Map** - Shows percentage of users who viewed the paragraph (5+ seconds in viewport)

---

## UX Design Decisions

### Color Palette

| Heat Map | Low Intensity | High Intensity | Design Rationale |
|----------|---------------|----------------|------------------|
| **Approval** | `--disagree` (pink) | `--agree` (green) | Existing semantic colors |
| **Comments** | `--card-question-added` (light blue) | `--btn-primary` (blue) | Blue = communication |
| **Rating** | `--range-objections-30` (light purple) | `--group` (purple) | Purple = collective judgment |
| **Viewership** | `#fffdf5` (cream) | `--option` (gold) | Warm = attention/engagement |

### Intensity Levels (5 levels each)

**Approval:**
- Level 5: 90-100% (green, opacity 0.15)
- Level 4: 70-89%
- Level 3: 50-69% (neutral yellow)
- Level 2: 30-49%
- Level 1: 0-29% (pink, opacity 0.12)

**Comments:**
- Level 5: 20+ comments
- Level 4: 10-19 comments
- Level 3: 5-9 comments
- Level 2: 2-4 comments
- Level 1: 1 comment

**Rating:**
- Level 5: 4.5-5.0
- Level 4: 3.5-4.4
- Level 3: 2.5-3.4
- Level 2: 1.5-2.4
- Level 1: 0-1.4

**Viewership:**
- Level 5: 80%+ users viewed
- Level 4: 60-79%
- Level 3: 40-59%
- Level 2: 20-39%
- Level 1: <20%

### Activation UI

**Floating Toolbar** (bottom-right corner, above sign button):
- Collapsed state: Single 48x48px button with heat/layers icon
- Expanded state: Pill-shaped toolbar with 4 heat map options + Off button
- Each active type shows its color as indicator
- Smooth animations (300ms ease-out)

### Visual Representation on Paragraphs

1. **Background Color** - Subtle tint based on heat level (primary indicator)
2. **Left Border** - Width varies by intensity (2-5px)
3. **Badge** - Small value indicator in top-right corner (e.g., "87%", "12", "4.2")

---

## Technical Architecture

### File Structure

```
apps/sign/src/
├── components/
│   └── heatMap/
│       ├── HeatMapToolbar/
│       │   ├── HeatMapToolbar.tsx
│       │   └── HeatMapToolbar.module.scss
│       ├── HeatMapLegend/
│       │   ├── HeatMapLegend.tsx
│       │   └── HeatMapLegend.module.scss
│       ├── HeatMapProvider/
│       │   └── HeatMapProvider.tsx
│       └── index.ts
├── hooks/
│   ├── useHeatMap.ts
│   └── useViewportTracking.ts
├── store/
│   └── heatMapStore.ts
├── types/
│   └── heatMap.ts
└── app/api/
    └── heatmap/
        └── [docId]/
            └── route.ts

# Backend (for viewership tracking)
apps/sign/app/api/
└── views/
    └── [paragraphId]/
        └── route.ts
```

### Data Models

```typescript
// types/heatMap.ts
export type HeatMapType = 'approval' | 'comments' | 'rating' | 'viewership' | 'none';
export type HeatLevel = 1 | 2 | 3 | 4 | 5;

export interface HeatMapValue {
  type: HeatMapType;
  level: HeatLevel;
  rawValue: number;
  displayValue: string;
}

export interface HeatMapData {
  approval: Record<string, number>;    // paragraphId -> percentage (0-100)
  comments: Record<string, number>;    // paragraphId -> count
  rating: Record<string, number>;      // paragraphId -> average (0-5)
  viewership: Record<string, number>;  // paragraphId -> percentage (0-100)
}

// Viewership tracking
export interface ParagraphView {
  viewId: string;           // `${visitorId}--${paragraphId}`
  paragraphId: string;
  visitorId: string;        // anonymous or user ID
  documentId: string;
  viewedAt: number;         // timestamp
  duration: number;         // seconds in viewport (minimum 5)
}
```

### Firestore Collections

```
// New collection for viewership tracking
paragraphViews/
  └── {viewId}/
      ├── paragraphId: string
      ├── visitorId: string
      ├── documentId: string
      ├── viewedAt: number
      └── duration: number
```

### State Management (Zustand)

```typescript
// store/heatMapStore.ts
interface HeatMapState {
  config: {
    type: HeatMapType;
    isEnabled: boolean;
    showBadges: boolean;
    showLegend: boolean;
  };
  data: HeatMapData | null;
  isLoading: boolean;

  setHeatMapType: (type: HeatMapType) => void;
  toggleHeatMap: () => void;
  loadHeatMapData: (documentId: string) => Promise<void>;
}
```

---

## Implementation Todo List

### Phase 1: Foundation (Types & Store)
- [ ] Create `apps/sign/src/types/heatMap.ts` with type definitions
- [ ] Create `apps/sign/src/store/heatMapStore.ts` Zustand store
- [ ] Create `apps/sign/src/hooks/useHeatMap.ts` custom hook
- [ ] Add heat map CSS variables to global styles

### Phase 2: Viewership Tracking
- [ ] Create Intersection Observer hook `useViewportTracking.ts`
- [ ] Implement 5-second viewport timer logic
- [ ] Create API route `POST /api/views/[paragraphId]` to record views
- [ ] Create Firestore collection `paragraphViews`
- [ ] Add visitor ID generation/retrieval (anonymous or authenticated)

### Phase 3: Heat Map Data API
- [ ] Create API route `GET /api/heatmap/[docId]` to aggregate all heat map data
- [ ] Aggregate approval data from `approval` collection
- [ ] Count comments from `statements` collection (by parentId)
- [ ] Calculate viewership percentage from `paragraphViews` collection
- [ ] Implement rating system if not already present (or use existing evaluation)

### Phase 4: UI Components
- [ ] Create `HeatMapToolbar` component with expand/collapse
- [ ] Create `HeatMapLegend` component
- [ ] Create `HeatMapProvider` context wrapper
- [ ] Add toolbar icons (approval, comments, rating, views, off)

### Phase 5: Paragraph Integration
- [ ] Update `ParagraphCard.tsx` to consume heat map data
- [ ] Add heat map background overlay styles (::after pseudo-element)
- [ ] Add heat map badge component
- [ ] Add border width variation by heat level
- [ ] Integrate viewport tracking in ParagraphCard

### Phase 6: SCSS Styling
- [ ] Create `HeatMapToolbar.module.scss`
- [ ] Create `HeatMapLegend.module.scss`
- [ ] Add heat map classes to `ParagraphCard.module.scss`
- [ ] Add global CSS variables for heat map colors
- [ ] Add staggered animation transitions

### Phase 7: Accessibility
- [ ] Add ARIA labels to all interactive elements
- [ ] Implement keyboard navigation for toolbar
- [ ] Add screen reader announcements for heat map values
- [ ] Test and ensure WCAG AA color contrast
- [ ] Add `prefers-reduced-motion` support

### Phase 8: Translations
- [ ] Add heat map labels to all language files:
  - `en.json`: Approval, Comments, Rating, Views, Off, Legend titles
  - `he.json`
  - `ar.json`
  - `de.json`
  - `es.json`
  - `nl.json`

### Phase 9: Testing
- [ ] Unit tests for `useHeatMap` hook
- [ ] Unit tests for heat level calculations
- [ ] Unit tests for Zustand store
- [ ] Integration tests for API endpoints
- [ ] E2E test for toolbar interaction
- [ ] Accessibility audit

### Phase 10: Admin Features (Optional)
- [ ] Add heat map settings to document admin panel
- [ ] Allow admin to enable/disable specific heat map types
- [ ] Add export heat map data functionality

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/heatmap/[docId]` | Get all heat map data for document |
| POST | `/api/views/[paragraphId]` | Record paragraph view (5+ seconds) |
| GET | `/api/views/[paragraphId]` | Get view count for paragraph |

---

## Component Integration Points

### DocumentClient.tsx
```typescript
// Wrap with HeatMapProvider
<HeatMapProvider documentId={docId}>
  <DocumentClient ... />
</HeatMapProvider>
```

### ParagraphCard.tsx
```typescript
// Add heat map visualization
const heatMapValue = useHeatMap(paragraph.paragraphId);
useViewportTracking(paragraphId, cardRef); // Track 5+ second views
```

### Layout (page.tsx or DocumentView.tsx)
```typescript
// Add toolbar and legend
<HeatMapToolbar />
<HeatMapLegend />
```

---

## Dependencies

- No new npm packages required
- Uses existing: Zustand, clsx, React Intersection Observer (may need to add)

---

## Estimated Complexity

| Phase | Complexity | Files to Create/Modify |
|-------|------------|------------------------|
| Phase 1 | Low | 4 new files |
| Phase 2 | Medium | 3 new files, 1 modified |
| Phase 3 | Medium | 1 new API route |
| Phase 4 | Medium | 4 new files |
| Phase 5 | Medium | 2 modified files |
| Phase 6 | Low | 3 new/modified SCSS |
| Phase 7 | Low | Modifications only |
| Phase 8 | Low | 6 JSON files |
| Phase 9 | Medium | Test files |
| Phase 10 | Optional | Admin panel additions |

---

## Notes

- Viewership tracking should use visitor ID (cookie-based for anonymous, userId for authenticated)
- Heat map data should be cached/memoized to avoid excessive API calls
- Consider real-time updates via Firestore listeners for live collaboration scenarios
- Rating heat map can leverage existing evaluation system if comments have ratings

---

## References

- Current sign components: `apps/sign/src/components/`
- Existing approval API: `apps/sign/app/api/approvals/`
- Existing comments API: `apps/sign/app/api/comments/`
- Existing evaluations: `apps/sign/app/api/evaluations/`
- UI Store: `apps/sign/src/store/uiStore.ts`
- Design guide: `docs/design-guide.md`
