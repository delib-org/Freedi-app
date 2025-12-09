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
  approval: Record<string, number>;    // paragraphId -> percentage (0-100)
  comments: Record<string, number>;    // paragraphId -> count
  rating: Record<string, number>;      // paragraphId -> average (0-5)
  viewership: Record<string, number>;  // paragraphId -> percentage (0-100)
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
  // Approval: 0-29% = L1, 30-49% = L2, 50-69% = L3, 70-89% = L4, 90-100% = L5
  approval: [30, 50, 70, 90],
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
  type: Exclude<HeatMapType, 'none'>
): string {
  switch (type) {
    case 'approval':
    case 'viewership':
      return `${Math.round(value)}%`;
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

  return {
    type,
    level: calculateHeatLevel(rawValue, type),
    rawValue,
    displayValue: formatHeatValue(rawValue, type),
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
