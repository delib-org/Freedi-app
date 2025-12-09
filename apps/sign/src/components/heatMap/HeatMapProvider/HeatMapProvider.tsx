'use client';

import { useEffect, ReactNode } from 'react';
import { useHeatMapStore } from '@/store/heatMapStore';

interface HeatMapProviderProps {
  documentId: string;
  children: ReactNode;
}

/**
 * HeatMapProvider
 * Initializes heat map data loading for a document
 * Wrap document views with this component to enable heat maps
 */
export default function HeatMapProvider({ documentId, children }: HeatMapProviderProps) {
  const loadHeatMapData = useHeatMapStore((state) => state.loadHeatMapData);
  const storedDocId = useHeatMapStore((state) => state.documentId);
  const reset = useHeatMapStore((state) => state.reset);

  // Load heat map data when document changes
  useEffect(() => {
    if (documentId && documentId !== storedDocId) {
      loadHeatMapData(documentId);
    }
  }, [documentId, storedDocId, loadHeatMapData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Only reset if we're unmounting and still have the same document
      // This prevents issues with hot reloading
      const currentDocId = useHeatMapStore.getState().documentId;
      if (currentDocId === documentId) {
        reset();
      }
    };
  }, [documentId, reset]);

  return <>{children}</>;
}
