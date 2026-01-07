/**
 * Heat Map Type Definitions
 * Types for paragraph heat map visualization feature
 */

/**
 * Available heat map types
 * - approval: Shows approval rate percentage for each paragraph
 * - comments: Shows comment count/activity per paragraph
 * - rating: Shows average evaluation score per paragraph
 * - viewership: Shows percentage of users who viewed the paragraph (5+ seconds)
 * - none: Heat map disabled
 */
export type HeatMapType = 'approval' | 'comments' | 'rating' | 'viewership' | 'none';

/**
 * Heat intensity levels (1-5)
 * Used for visual representation scaling
 */
export type HeatLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Heat map value for a single paragraph
 */
export interface HeatMapValue {
  type: HeatMapType;
  level: HeatLevel;
  rawValue: number;
  displayValue: string;
}

/**
 * Complete heat map data for a document
 * Maps paragraphId to their respective values
 */
export interface HeatMapData {
  approval: Record<string, number>;    // paragraphId -> score (-1 to 1)
  comments: Record<string, number>;    // paragraphId -> count
  rating: Record<string, number>;      // paragraphId -> average (0-5)
  viewership: Record<string, number>;  // paragraphId -> percentage (0-100) - used for heat level calculation
  viewershipCount: Record<string, number>;  // paragraphId -> viewer count - used for display
}

/**
 * Paragraph view record for viewership tracking
 */
export interface ParagraphView {
  viewId: string;           // `${visitorId}--${paragraphId}`
  paragraphId: string;
  visitorId: string;        // anonymous or user ID
  documentId: string;
  viewedAt: number;         // timestamp in milliseconds
  duration: number;         // seconds in viewport (minimum 5)
}

/**
 * Heat map configuration
 */
export interface HeatMapConfig {
  type: HeatMapType;
  isEnabled: boolean;
  showBadges: boolean;
  showLegend: boolean;
}

/**
 * Heat map thresholds for level calculation
 */
export interface HeatMapThresholds {
  approval: readonly [number, number, number, number]; // [level2, level3, level4, level5]
  comments: readonly [number, number, number, number];
  rating: readonly [number, number, number, number];
  viewership: readonly [number, number, number, number];
}

/**
 * Default thresholds for heat level calculation
 */
export const HEAT_MAP_THRESHOLDS: HeatMapThresholds = {
  // Approval (-1 to 1 scale): L1=-1 to -0.5 (red), L2=-0.5 to -0.1, L3=-0.1 to 0.1 (yellow), L4=0.1 to 0.5, L5=0.5 to 1 (green)
  approval: [-0.5, -0.1, 0.1, 0.5],
  // Comments: 1 = L1, 2-4 = L2, 5-9 = L3, 10-19 = L4, 20+ = L5
  comments: [2, 5, 10, 20],
  // Rating: 0-1.4 = L1, 1.5-2.4 = L2, 2.5-3.4 = L3, 3.5-4.4 = L4, 4.5-5.0 = L5
  rating: [1.5, 2.5, 3.5, 4.5],
  // Viewership: <20% = L1, 20-39% = L2, 40-59% = L3, 60-79% = L4, 80%+ = L5
  viewership: [20, 40, 60, 80],
} as const;

/**
 * Calculate heat level from raw value
 */
export function calculateHeatLevel(
  value: number,
  type: Exclude<HeatMapType, 'none'>
): HeatLevel {
  const thresholds = HEAT_MAP_THRESHOLDS[type];

  if (value >= thresholds[3]) return 5;
  if (value >= thresholds[2]) return 4;
  if (value >= thresholds[1]) return 3;
  if (value >= thresholds[0]) return 2;
  return 1;
}

/**
 * Format raw value to display string
 */
export function formatHeatValue(
  value: number,
  type: Exclude<HeatMapType, 'none'>,
  viewerCount?: number
): string {
  switch (type) {
    case 'approval':
      // Show as signed decimal (-1 to +1)
      const sign = value > 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}`;
    case 'viewership':
      // Display actual viewer count instead of percentage
      return viewerCount !== undefined ? viewerCount.toString() : Math.round(value).toString();
    case 'comments':
      return value.toString();
    case 'rating':
      return value.toFixed(1);
  }
}

/**
 * Get heat map value for a paragraph
 */
export function getHeatMapValue(
  paragraphId: string,
  type: Exclude<HeatMapType, 'none'>,
  data: HeatMapData
): HeatMapValue | null {
  const rawValue = data[type][paragraphId];

  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  // For viewership, get the viewer count for display
  const viewerCount = type === 'viewership' ? data.viewershipCount?.[paragraphId] : undefined;

  return {
    type,
    level: calculateHeatLevel(rawValue, type),
    rawValue,
    displayValue: formatHeatValue(rawValue, type, viewerCount),
  };
}

/**
 * Heat map color configuration
 * Maps heat types to their color CSS variables
 */
export const HEAT_MAP_COLORS = {
  approval: {
    low: 'var(--heat-approval-low)',
    high: 'var(--heat-approval-high)',
    border: 'var(--heat-approval-border)',
  },
  comments: {
    low: 'var(--heat-comments-low)',
    high: 'var(--heat-comments-high)',
    border: 'var(--heat-comments-border)',
  },
  rating: {
    low: 'var(--heat-rating-low)',
    high: 'var(--heat-rating-high)',
    border: 'var(--heat-rating-border)',
  },
  viewership: {
    low: 'var(--heat-viewership-low)',
    high: 'var(--heat-viewership-high)',
    border: 'var(--heat-viewership-border)',
  },
} as const;

// ============================================
// Demographic Filter Types (Admin-only feature)
// ============================================

/**
 * Demographic filter state for heatmap
 */
export interface DemographicFilter {
  /** ID of the demographic question being filtered on */
  questionId: string | null;
  /** Label of the question for display */
  questionLabel: string | null;
  /** Value of the selected segment */
  segmentValue: string | null;
  /** Label of the segment for display */
  segmentLabel: string | null;
}

/**
 * Initial/empty demographic filter state
 */
export const EMPTY_DEMOGRAPHIC_FILTER: DemographicFilter = {
  questionId: null,
  questionLabel: null,
  segmentValue: null,
  segmentLabel: null,
};

/**
 * Segment metadata returned from API
 */
export interface SegmentMetadata {
  questionId: string;
  questionLabel: string;
  segmentValue: string;
  segmentLabel: string;
  respondentCount: number;
}

/**
 * Extended heatmap data with demographic segment info
 */
export interface DemographicHeatMapData extends HeatMapData {
  segment: SegmentMetadata | null;
}

/**
 * Available demographic option for filtering
 */
export interface DemographicFilterOption {
  questionId: string;
  question: string;
  options: Array<{
    value: string;
    label: string;
    count: number;
  }>;
}

/**
 * Check if a demographic filter is active
 */
export function isDemographicFilterActive(filter: DemographicFilter): boolean {
  return filter.questionId !== null && filter.segmentValue !== null;
}
