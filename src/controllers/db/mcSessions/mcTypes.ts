import {
  MCSession,
  MCQuestion,
  MCSessionStatus,
  MCQuestionType,
  MCSessionSettings,
  MassConsensusPageUrls,
  MassConsensusStep
} from 'delib-npm';

// ============================================
// LOCAL TYPE DEFINITIONS
// Until these are exported from delib-npm
// ============================================

// For creating a new session
export type MCSessionCreate = Omit<MCSession, 'sessionId' | 'createdAt'>;

// For updating a session  
export type MCSessionUpdate = Partial<Omit<MCSession, 'sessionId' | 'createdAt' | 'createdBy'>>;

// For creating a new question
export type MCQuestionCreate = Omit<MCQuestion, 'questionId'>;

// For reordering questions
export type MCQuestionOrder = {
  questionId: string;
  order: number;
};

// ============================================
// DEFAULT VALUES (factory functions)
// ============================================

export const createDefaultMCSessionSettings = (): MCSessionSettings => ({
  randomizeQuestions: false,
  allowSkipping: true,
  showProgressBar: true,
  showIntermediateResults: false,
  sharedSteps: {
    introduction: true,
    userDemographics: false,
    feedback: true,
    thankYou: true
  }
});

export const createDefaultMCQuestion = (
  sessionId: string,
  order: number
): MCQuestionCreate => ({
  sessionId,
  order,
  content: {
    question: '',
    description: undefined
  },
  questionType: MCQuestionType.FULL_CONSENSUS,
  steps: [
    { screen: MassConsensusPageUrls.question, statementId: '', text: undefined },
    { screen: MassConsensusPageUrls.topSuggestions, statementId: '', text: undefined },
    { screen: MassConsensusPageUrls.randomSuggestions, statementId: '', text: undefined },
    { screen: MassConsensusPageUrls.topSuggestions, statementId: '', text: undefined },
    { screen: MassConsensusPageUrls.voting, statementId: '', text: undefined }
  ],
  required: true
});

// ============================================
// QUESTION TYPE TO STEPS MAPPING
// ============================================

export const getDefaultStepsForQuestionType = (
  type: MCQuestionType,
  statementId: string
): MassConsensusStep[] => {
  const createStep = (screen: MassConsensusPageUrls): MassConsensusStep => ({
    screen,
    statementId,
    text: undefined
  });

  switch (type) {
    case MCQuestionType.FULL_CONSENSUS:
      return [
        createStep(MassConsensusPageUrls.question),
        createStep(MassConsensusPageUrls.topSuggestions),
        createStep(MassConsensusPageUrls.randomSuggestions),
        createStep(MassConsensusPageUrls.topSuggestions),
        createStep(MassConsensusPageUrls.voting)
      ];

    case MCQuestionType.QUICK_VOTE:
      return [
        createStep(MassConsensusPageUrls.question),
        createStep(MassConsensusPageUrls.voting)
      ];

    case MCQuestionType.BRAINSTORM_ONLY:
      return [
        createStep(MassConsensusPageUrls.question),
        createStep(MassConsensusPageUrls.topSuggestions)
      ];

    case MCQuestionType.EVALUATE_ONLY:
      return [
        createStep(MassConsensusPageUrls.question),
        createStep(MassConsensusPageUrls.randomSuggestions),
        createStep(MassConsensusPageUrls.topSuggestions)
      ];

    case MCQuestionType.CUSTOM:
    default:
      return [createStep(MassConsensusPageUrls.question)];
  }
};