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
} from '@/types/heatMap';

interface HeatMapState {
  // Configuration
  config: HeatMapConfig;

  // Data
  data: HeatMapData | null;
  isLoading: boolean;
  error: string | null;
  documentId: string | null;

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
  reset: () => void;
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
};

export const useHeatMapStore = create<HeatMapState>((set, get) => ({
  // Initial state
  config: initialConfig,
  data: null,
  isLoading: false,
  error: null,
  documentId: null,

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

    // Skip if already loading or same document is loaded
    if (state.isLoading) return;

    set({ isLoading: true, error: null, documentId });

    try {
      const response = await fetch(`/api/heatmap/${documentId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch heat map data: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      set({
        data: result.data || initialData,
        isLoading: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[HeatMapStore] Error loading data:', errorMessage);
      set({
        error: errorMessage,
        isLoading: false,
        data: initialData,
      });
    }
  },

  reset: () =>
    set({
      config: initialConfig,
      data: null,
      isLoading: false,
      error: null,
      documentId: null,
    }),
}));

// Selectors
export const selectHeatMapConfig = (state: HeatMapState) => state.config;
export const selectHeatMapType = (state: HeatMapState) => state.config.type;
export const selectIsHeatMapEnabled = (state: HeatMapState) => state.config.isEnabled;
export const selectHeatMapData = (state: HeatMapState) => state.data;
export const selectIsHeatMapLoading = (state: HeatMapState) => state.isLoading;
export const selectHeatMapError = (state: HeatMapState) => state.error;

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
