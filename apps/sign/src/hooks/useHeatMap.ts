/**
 * useHeatMap Hook
 * Custom hook for accessing heat map data and utilities
 */

import { useEffect, useMemo } from 'react';
import {
  useHeatMapStore,
  selectHeatMapConfig,
  selectHeatMapData,
  selectIsHeatMapLoading,
  selectParagraphHeatValue,
} from '@/store/heatMapStore';
import { HeatMapType, HeatMapValue, HeatLevel } from '@/types/heatMap';

interface UseHeatMapOptions {
  documentId?: string;
  autoLoad?: boolean;
}

interface UseHeatMapReturn {
  // State
  config: {
    type: HeatMapType;
    isEnabled: boolean;
    showBadges: boolean;
    showLegend: boolean;
  };
  isLoading: boolean;
  error: string | null;

  // Actions
  setHeatMapType: (type: HeatMapType) => void;
  toggleHeatMap: () => void;
  toggleBadges: () => void;
  toggleLegend: () => void;
  reload: () => Promise<void>;

  // Utilities
  getParagraphHeatValue: (paragraphId: string) => HeatMapValue | null;
  getHeatLevelClass: (level: HeatLevel) => string;
}

/**
 * Hook for heat map functionality
 * Use at document level to initialize, and at paragraph level to get values
 */
export function useHeatMap(options: UseHeatMapOptions = {}): UseHeatMapReturn {
  const { documentId, autoLoad = true } = options;

  // Store state
  const config = useHeatMapStore(selectHeatMapConfig);
  const data = useHeatMapStore(selectHeatMapData);
  const isLoading = useHeatMapStore(selectIsHeatMapLoading);
  const error = useHeatMapStore((state) => state.error);
  const storedDocId = useHeatMapStore((state) => state.documentId);

  // Store actions
  const setHeatMapType = useHeatMapStore((state) => state.setHeatMapType);
  const toggleHeatMap = useHeatMapStore((state) => state.toggleHeatMap);
  const toggleBadges = useHeatMapStore((state) => state.toggleBadges);
  const toggleLegend = useHeatMapStore((state) => state.toggleLegend);
  const loadHeatMapData = useHeatMapStore((state) => state.loadHeatMapData);

  // Auto-load data when documentId changes
  useEffect(() => {
    if (autoLoad && documentId && documentId !== storedDocId) {
      loadHeatMapData(documentId);
    }
  }, [documentId, autoLoad, storedDocId, loadHeatMapData]);

  // Get heat value for a paragraph
  const getParagraphHeatValue = useMemo(() => {
    return (paragraphId: string): HeatMapValue | null => {
      return useHeatMapStore.getState().config.isEnabled && data
        ? selectParagraphHeatValue(paragraphId)(useHeatMapStore.getState())
        : null;
    };
  }, [data, config.isEnabled, config.type]);

  // Get CSS class for heat level
  const getHeatLevelClass = (level: HeatLevel): string => {
    return `heat-level-${level}`;
  };

  // Reload function
  const reload = async () => {
    if (documentId) {
      await loadHeatMapData(documentId);
    }
  };

  return {
    config,
    isLoading,
    error,
    setHeatMapType,
    toggleHeatMap,
    toggleBadges,
    toggleLegend,
    reload,
    getParagraphHeatValue,
    getHeatLevelClass,
  };
}

/**
 * Hook specifically for getting heat value for a single paragraph
 * More efficient than the full hook when only reading values
 */
export function useParagraphHeatValue(paragraphId: string): HeatMapValue | null {
  return useHeatMapStore(selectParagraphHeatValue(paragraphId));
}

/**
 * Hook for heat map toolbar controls
 */
export function useHeatMapControls() {
  const config = useHeatMapStore(selectHeatMapConfig);
  const isLoading = useHeatMapStore(selectIsHeatMapLoading);
  const setHeatMapType = useHeatMapStore((state) => state.setHeatMapType);
  const toggleHeatMap = useHeatMapStore((state) => state.toggleHeatMap);

  const selectType = (type: HeatMapType) => {
    setHeatMapType(type);
  };

  const disable = () => {
    setHeatMapType('none');
  };

  return {
    currentType: config.type,
    isEnabled: config.isEnabled,
    isLoading,
    selectType,
    disable,
    toggle: toggleHeatMap,
  };
}

export default useHeatMap;
