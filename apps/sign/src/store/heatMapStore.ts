/**
 * Zustand Heat Map Store
 * State management for heat map visualization feature
 */

import { create } from 'zustand';
import {
  HeatMapType,
  HeatMapData,
  HeatMapConfig,
  HeatMapValue,
  getHeatMapValue,
  DemographicFilter,
  DemographicFilterOption,
  EMPTY_DEMOGRAPHIC_FILTER,
  SegmentMetadata,
} from '@/types/heatMap';
import { logError } from '@/lib/utils/errorHandling';

interface HeatMapState {
  // Configuration
  config: HeatMapConfig;

  // Data
  data: HeatMapData | null;
  isLoading: boolean;
  error: string | null;
  documentId: string | null;

  // Demographic filtering (admin-only)
  demographicFilter: DemographicFilter;
  availableDemographics: DemographicFilterOption[];
  isDemographicsLoading: boolean;
  currentSegment: SegmentMetadata | null;

  // Actions
  setHeatMapType: (type: HeatMapType) => void;
  toggleHeatMap: () => void;
  toggleBadges: () => void;
  toggleLegend: () => void;
  setData: (data: HeatMapData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setDocumentId: (documentId: string) => void;
  loadHeatMapData: (documentId: string) => Promise<void>;
  /** Update approval values from real-time paragraph data */
  updateApprovalValues: (approvalMap: Record<string, number>) => void;
  reset: () => void;

  // Demographic filter actions (admin-only)
  setDemographicFilter: (filter: DemographicFilter) => void;
  clearDemographicFilter: () => void;
  loadAvailableDemographics: (documentId: string) => Promise<void>;
}

const initialConfig: HeatMapConfig = {
  type: 'none',
  isEnabled: false,
  showBadges: true,
  showLegend: true,
};

const initialData: HeatMapData = {
  approval: {},
  comments: {},
  rating: {},
  viewership: {},
  viewershipCount: {},
  suggestions: {},
};

export const useHeatMapStore = create<HeatMapState>((set, get) => ({
  // Initial state
  config: initialConfig,
  data: null,
  isLoading: false,
  error: null,
  documentId: null,

  // Demographic filter initial state
  demographicFilter: EMPTY_DEMOGRAPHIC_FILTER,
  availableDemographics: [],
  isDemographicsLoading: false,
  currentSegment: null,

  // Actions
  setHeatMapType: (type) =>
    set((state) => ({
      config: {
        ...state.config,
        type,
        isEnabled: type !== 'none',
      },
    })),

  toggleHeatMap: () =>
    set((state) => ({
      config: {
        ...state.config,
        isEnabled: !state.config.isEnabled,
        // Reset to 'none' if disabling
        type: state.config.isEnabled ? 'none' : state.config.type === 'none' ? 'approval' : state.config.type,
      },
    })),

  toggleBadges: () =>
    set((state) => ({
      config: {
        ...state.config,
        showBadges: !state.config.showBadges,
      },
    })),

  toggleLegend: () =>
    set((state) => ({
      config: {
        ...state.config,
        showLegend: !state.config.showLegend,
      },
    })),

  setData: (data) => set({ data }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setDocumentId: (documentId) => set({ documentId }),

  loadHeatMapData: async (documentId) => {
    const state = get();

    // Skip if already loading
    if (state.isLoading) return;

    set({ isLoading: true, error: null, documentId });

    try {
      // Build URL with demographic filter params if active
      let url = `/api/heatmap/${documentId}`;
      const { demographicFilter } = state;

      if (demographicFilter.questionId && demographicFilter.segmentValue) {
        const params = new URLSearchParams({
          demographic: demographicFilter.questionId,
          segment: demographicFilter.segmentValue,
        });
        url = `${url}?${params.toString()}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'SEGMENT_TOO_SMALL') {
          throw new Error('This segment has fewer than 5 respondents (privacy threshold)');
        }
        throw new Error(`Failed to fetch heat map data: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      // Extract segment metadata if present
      const segment = result.data?.segment || null;

      set({
        data: result.data || initialData,
        currentSegment: segment,
        isLoading: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logError(error, { operation: 'heatMapStore.loadHeatMapData', documentId });
      set({
        error: errorMessage,
        isLoading: false,
        data: initialData,
        currentSegment: null,
      });
    }
  },

  updateApprovalValues: (approvalMap) => {
    const state = get();
    if (!state.data) return;

    set({
      data: {
        ...state.data,
        approval: {
          ...state.data.approval,
          ...approvalMap,
        },
      },
    });
  },

  reset: () =>
    set({
      config: initialConfig,
      data: null,
      isLoading: false,
      error: null,
      documentId: null,
      demographicFilter: EMPTY_DEMOGRAPHIC_FILTER,
      availableDemographics: [],
      isDemographicsLoading: false,
      currentSegment: null,
    }),

  // Demographic filter actions (admin-only)
  setDemographicFilter: (filter) => {
    const state = get();
    set({ demographicFilter: filter });

    // Reload data with new filter if document is loaded
    if (state.documentId) {
      // Use setTimeout to ensure state is updated before reload
      setTimeout(() => {
        get().loadHeatMapData(state.documentId!);
      }, 0);
    }
  },

  clearDemographicFilter: () => {
    const state = get();
    set({
      demographicFilter: EMPTY_DEMOGRAPHIC_FILTER,
      currentSegment: null,
    });

    // Reload data without filter
    if (state.documentId) {
      setTimeout(() => {
        get().loadHeatMapData(state.documentId!);
      }, 0);
    }
  },

  loadAvailableDemographics: async (documentId) => {
    const state = get();

    // Skip if already loading
    if (state.isDemographicsLoading) return;

    set({ isDemographicsLoading: true });

    try {
      const response = await fetch(`/api/heatmap/${documentId}/demographics`);

      if (!response.ok) {
        throw new Error('Failed to fetch demographics');
      }

      const result = await response.json();

      set({
        availableDemographics: result.demographics || [],
        isDemographicsLoading: false,
      });
    } catch (error) {
      logError(error, { operation: 'heatMapStore.loadAvailableDemographics', documentId });
      set({
        availableDemographics: [],
        isDemographicsLoading: false,
      });
    }
  },
}));

// Selectors
export const selectHeatMapConfig = (state: HeatMapState) => state.config;
export const selectHeatMapType = (state: HeatMapState) => state.config.type;
export const selectIsHeatMapEnabled = (state: HeatMapState) => state.config.isEnabled;
export const selectHeatMapData = (state: HeatMapState) => state.data;
export const selectIsHeatMapLoading = (state: HeatMapState) => state.isLoading;
export const selectHeatMapError = (state: HeatMapState) => state.error;

// Demographic filter selectors
export const selectDemographicFilter = (state: HeatMapState) => state.demographicFilter;
export const selectAvailableDemographics = (state: HeatMapState) => state.availableDemographics;
export const selectIsDemographicsLoading = (state: HeatMapState) => state.isDemographicsLoading;
export const selectCurrentSegment = (state: HeatMapState) => state.currentSegment;
export const selectIsDemographicFilterActive = (state: HeatMapState) =>
  state.demographicFilter.questionId !== null && state.demographicFilter.segmentValue !== null;

/**
 * Get heat map value for a specific paragraph
 */
export const selectParagraphHeatValue = (paragraphId: string) => (state: HeatMapState): HeatMapValue | null => {
  const { config, data } = state;

  if (!config.isEnabled || config.type === 'none' || !data) {
    return null;
  }

  return getHeatMapValue(paragraphId, config.type, data);
};
