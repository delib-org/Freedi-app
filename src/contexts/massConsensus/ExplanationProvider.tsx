import React, { createContext, useContext, useState, useEffect, FC, ReactNode } from 'react';
import { MassConsensusStageType, MassConsensusStage, ExplanationConfig, PostActionConfig } from 'delib-npm';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { massConsensusProcessSelector } from '@/redux/massConsensus/massConsensusSlice';

interface ExplanationContextType {
  // Get explanation for current stage
  getStageExplanation: (stageId: string) => ExplanationConfig | undefined;
  getPostActionConfig: (stageId: string) => PostActionConfig | undefined;

  // Track what user has seen
  markExplanationSeen: (stageId: string) => void;
  hasSeenExplanation: (stageId: string) => boolean;

  // User preferences
  setDontShowExplanations: (value: boolean) => void;
  getDontShowExplanations: () => boolean;

  // Current stage info
  currentStage: MassConsensusStage | undefined;
  stages: MassConsensusStage[];
}

const ExplanationContext = createContext<ExplanationContextType | undefined>(undefined);

interface ExplanationProviderProps {
  children: ReactNode;
}

const STORAGE_KEY_PREFIX = 'mc_explanations_';

export const ExplanationProvider: FC<ExplanationProviderProps> = ({ children }) => {
  const { statementId } = useParams<{ statementId: string }>();
  const process = useSelector(massConsensusProcessSelector(statementId));

  const [seenExplanations, setSeenExplanations] = useState<Set<string>>(new Set());
  const [dontShowExplanations, setDontShow] = useState(false);
  const [currentStage, setCurrentStage] = useState<MassConsensusStage | undefined>();

  // Load preferences from localStorage
  useEffect(() => {
    if (!statementId) return;

    const storageKey = `${STORAGE_KEY_PREFIX}${statementId}`;
    const stored = localStorage.getItem(storageKey);

    if (stored) {
      try {
        const data = JSON.parse(stored);
        setSeenExplanations(new Set(data.seenExplanations || []));
        setDontShow(data.dontShowExplanations || false);
      } catch (error) {
        console.error('Error loading explanation preferences:', error);
      }
    }
  }, [statementId]);

  // Save preferences to localStorage
  const savePreferences = () => {
    if (!statementId) return;

    const storageKey = `${STORAGE_KEY_PREFIX}${statementId}`;
    const data = {
      seenExplanations: Array.from(seenExplanations),
      dontShowExplanations,
      lastUpdated: Date.now()
    };

    localStorage.setItem(storageKey, JSON.stringify(data));
  };

  // Update current stage based on URL
  useEffect(() => {
    const path = window.location.pathname;
    const pathSegments = path.split('/');
    const currentPath = pathSegments[pathSegments.length - 1];

    if (process?.stages) {
      const stage = process.stages.find(s =>
        s.url === currentPath || s.type === currentPath
      );
      setCurrentStage(stage);
    }
  }, [process, window.location.pathname]);

  const getStageExplanation = (stageId: string): ExplanationConfig | undefined => {
    if (dontShowExplanations) return undefined;

    const stage = process?.stages?.find(s => s.id === stageId);
    if (!stage?.beforeStage) return undefined;

    // Check if should show only first time
    if (stage.beforeStage.showOnlyFirstTime && seenExplanations.has(stageId)) {
      return undefined;
    }

    return stage.beforeStage;
  };

  const getPostActionConfig = (stageId: string): PostActionConfig | undefined => {
    const stage = process?.stages?.find(s => s.id === stageId);
    return stage?.afterAction;
  };

  const markExplanationSeen = (stageId: string) => {
    setSeenExplanations(prev => {
      const newSet = new Set(prev);
      newSet.add(stageId);
      return newSet;
    });
    savePreferences();
  };

  const hasSeenExplanation = (stageId: string): boolean => {
    return seenExplanations.has(stageId);
  };

  const setDontShowExplanations = (value: boolean) => {
    setDontShow(value);
    savePreferences();
  };

  const getDontShowExplanations = () => dontShowExplanations;

  const value: ExplanationContextType = {
    getStageExplanation,
    getPostActionConfig,
    markExplanationSeen,
    hasSeenExplanation,
    setDontShowExplanations,
    getDontShowExplanations,
    currentStage,
    stages: process?.stages || []
  };

  return (
    <ExplanationContext.Provider value={value}>
      {children}
    </ExplanationContext.Provider>
  );
};

export const useExplanations = () => {
  const context = useContext(ExplanationContext);
  if (!context) {
    throw new Error('useExplanations must be used within ExplanationProvider');
  }
  return context;
};