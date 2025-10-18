import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  FC,
  ReactNode,
  useMemo,
} from "react";
import {
  MassConsensusStageType,
  MassConsensusStage,
  ExplanationConfig,
  PostActionConfig,
} from "delib-npm";
import { useParams } from "react-router";
import { useSelector } from "react-redux";
import { massConsensusProcessSelector } from "@/redux/massConsensus/massConsensusSlice";
import RandomSuggestions from "@/view/pages/massConsensus/randomSuggestions/RandomSuggestions";

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

const ExplanationContext = createContext<ExplanationContextType | undefined>(
  undefined
);

interface ExplanationProviderProps {
  children: ReactNode;
}

const STORAGE_KEY_PREFIX = "mc_explanations_";

export const explanationTextList = {
  randomSuggestions: {
    titleText: "Why Random?",
    firstReason: "Ensures fair representation of all ideas",
    secondReason: "Prevents popularity bias",
    thirdReason: "Gives every suggestion equal chance",
  },
  topSuggestions: {
    titleText: "What are Top Suggestions?",
    firstReason: "Highest rated by the community",
    secondReason: "Based on collective evaluation",
    thirdReason: "Refined through peer review",
  },
  voting: {
    titleText: "Your Vote Matters",
    firstReason: "This is the final decision stage",
    secondReason: "Each vote has equal weight",
    thirdReason: "The result represents collective wisdom",
  },
};
// Default explanations for testing/demo purposes
const DEFAULT_EXPLANATIONS: Record<string, MassConsensusStage> = {
  introduction: {
    id: "introduction",
    type: "introduction" as MassConsensusStageType,
    order: 1,
    beforeStage: {
      enabled: true,
      content:
        "Welcome to the Mass Consensus process. We will guide you through several stages to reach a collective decision.",
      displayMode: "card",
      dismissible: true,
      showOnlyFirstTime: false,
    },
  },
  question: {
    id: "question",
    type: "question" as MassConsensusStageType,
    order: 2,
    beforeStage: {
      enabled: true,
      content:
        "Please read the question carefully and provide your thoughtful response.",
      displayMode: "inline",
      dismissible: true,
    },
    afterAction: {
      enabled: true,
      content: "Your suggestion has been successfully added",
      successMessage:
        "It will now be randomly shown to other participants for evaluation",
      buttons: [
        { label: "View My Suggestions", action: "viewMySuggestions" },
        { label: "Add Another", action: "addAnother" },
        { label: "Continue", action: "continue", primary: true },
      ],
      displayMode: "modal",
    },
  },
  randomSuggestions: {
    id: "randomSuggestions",
    type: "randomSuggestions" as MassConsensusStageType,
    order: 3,
    beforeStage: {
      enabled: true,
      title: "🎲 Random Suggestions Stage",
      content:
        "You will now evaluate random suggestions from other participants. This randomization ensures all voices are heard equally and prevents bias. Rate each suggestion based on its merit.",
      displayMode: "card",
      dismissible: true,
      showOnlyFirstTime: false,
    },
  },
  topSuggestions: {
    id: "topSuggestions",
    type: "topSuggestions" as MassConsensusStageType,
    order: 4,
    beforeStage: {
      enabled: true,
      title: "⭐ Top Suggestions",
      content:
        "These are the highest-rated suggestions based on community evaluations. Please review them carefully before proceeding to the final vote.",
      displayMode: "card",
      dismissible: true,
      showOnlyFirstTime: false,
    },
  },
  voting: {
    id: "voting",
    type: "voting" as MassConsensusStageType,
    order: 5,
    beforeStage: {
      enabled: true,
      title: "🗳️ Final Vote",
      content:
        "Time to cast your final vote! Choose the suggestion that best addresses the question. Your vote will help determine the collective decision.",
      displayMode: "card",
      dismissible: true,
      showOnlyFirstTime: false,
    },
  },
};

export const ExplanationProvider: FC<ExplanationProviderProps> = ({
  children,
}) => {
  const { statementId } = useParams<{ statementId: string }>();
  const process = useSelector(massConsensusProcessSelector(statementId));

  const [seenExplanations, setSeenExplanations] = useState<Set<string>>(
    new Set()
  );
  const [dontShowExplanations, setDontShow] = useState(false);
  const [currentStage, setCurrentStage] = useState<
    MassConsensusStage | undefined
  >();

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
        console.error("Error loading explanation preferences:", error);
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
      lastUpdated: Date.now(),
    };

    localStorage.setItem(storageKey, JSON.stringify(data));
  };

  // Update current stage based on URL
  useEffect(() => {
    const path = window.location.pathname;
    const pathSegments = path.split("/");
    const currentPath = pathSegments[pathSegments.length - 1];

    if (process?.stages) {
      const stage = process.stages.find(
        (s) => s.url === currentPath || s.type === currentPath
      );
      setCurrentStage(stage);
    }
  }, [process, window.location.pathname]);

  const getStageExplanation = (
    stageId: string
  ): ExplanationConfig | undefined => {
    if (dontShowExplanations) {
      return undefined;
    }

    // First try to get from process if it has stages
    let stage = process?.stages?.find((s) => s.id === stageId);

    // If no stages in process, use default explanations
    if (!stage && DEFAULT_EXPLANATIONS[stageId]) {
      stage = DEFAULT_EXPLANATIONS[stageId];
    }

    if (!stage?.beforeStage) {
      return undefined;
    }

    // Check if should show only first time
    if (stage.beforeStage.showOnlyFirstTime && seenExplanations.has(stageId)) {
      return undefined;
    }

    return stage.beforeStage;
  };

  const getPostActionConfig = (
    stageId: string
  ): PostActionConfig | undefined => {
    // First try to get from process if it has stages
    let stage = process?.stages?.find((s) => s.id === stageId);

    // If no stages in process, use default explanations
    if (!stage && DEFAULT_EXPLANATIONS[stageId]) {
      stage = DEFAULT_EXPLANATIONS[stageId];
    }

    return stage?.afterAction;
  };

  const markExplanationSeen = (stageId: string) => {
    setSeenExplanations((prev) => {
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

  const value = useMemo<ExplanationContextType>(
    () => ({
      getStageExplanation,
      getPostActionConfig,
      markExplanationSeen,
      hasSeenExplanation,
      setDontShowExplanations,
      getDontShowExplanations,
      currentStage,
      stages: process?.stages || Object.values(DEFAULT_EXPLANATIONS),
    }),
    [
      getStageExplanation,
      getPostActionConfig,
      markExplanationSeen,
      hasSeenExplanation,
      setDontShowExplanations,
      getDontShowExplanations,
      currentStage,
      process?.stages,
    ]
  );

  return (
    <ExplanationContext.Provider value={value}>
      {children}
    </ExplanationContext.Provider>
  );
};

export const useExplanations = () => {
  const context = useContext(ExplanationContext);
  if (!context) {
    throw new Error("useExplanations must be used within ExplanationProvider");
  }

  return context;
};
