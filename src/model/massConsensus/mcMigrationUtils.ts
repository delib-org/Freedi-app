import { 
  MassConsensusStep, 
  MassConsensusPageUrls,
  MCSession,
  MCQuestion,
  MCSessionStatus,
  MCQuestionType,
  createDefaultMCSessionSettings,
  getDefaultStepsForQuestionType
} from 'delib-npm';

/**
 * Converts a single-question Mass Consensus setup to a multi-question session
 * This maintains backward compatibility by wrapping existing setups in a session
 */
export function convertSingleToMultiQuestion(
  statementId: string,
  title: string,
  steps: MassConsensusStep[] | MassConsensusPageUrls[],
  createdBy: string
): MCSession {
  // Convert steps to new format if needed
  const formattedSteps = isLegacyStepFormat(steps) 
    ? convertLegacyStepsToNew(steps as MassConsensusPageUrls[], statementId)
    : steps as MassConsensusStep[];

  // Create a single question from the existing setup
  const question: MCQuestion = {
    questionId: `q_${Date.now()}_0`,
    sessionId: `session_${statementId}_${Date.now()}`,
    order: 0,
    content: {
      question: title,
      description: undefined
    },
    questionType: determineQuestionType(formattedSteps),
    steps: formattedSteps,
    required: true
  };

  // Create the session wrapper
  const session: MCSession = {
    sessionId: question.sessionId,
    statementId,
    title: title,
    description: undefined,
    createdAt: Date.now(),
    createdBy,
    questions: [question],
    settings: createDefaultMCSessionSettings(),
    status: MCSessionStatus.ACTIVE
  };

  return session;
}

/**
 * Checks if steps are in legacy format (array of strings)
 */
export function isLegacyStepFormat(steps: unknown[]): boolean {
  if (!steps || steps.length === 0) return false;
  return typeof steps[0] === 'string';
}

/**
 * Converts legacy step format to new MassConsensusStep format
 */
export function convertLegacyStepsToNew(
  steps: MassConsensusPageUrls[], 
  statementId: string
): MassConsensusStep[] {
  return steps.map(step => ({
    screen: step,
    statementId,
    text: undefined
  }));
}

/**
 * Determines the question type based on the steps configuration
 */
export function determineQuestionType(steps: MassConsensusStep[]): MCQuestionType {
  const screens = steps.map(s => s.screen);
  
  // Check for full consensus pattern
  if (
    screens.includes(MassConsensusPageUrls.question) &&
    screens.includes(MassConsensusPageUrls.suggestions) &&
    screens.includes(MassConsensusPageUrls.voting)
  ) {
    return MCQuestionType.FULL_CONSENSUS;
  }
  
  // Check for quick vote pattern
  if (
    screens.includes(MassConsensusPageUrls.question) &&
    screens.includes(MassConsensusPageUrls.voting) &&
    !screens.includes(MassConsensusPageUrls.suggestions)
  ) {
    return MCQuestionType.QUICK_VOTE;
  }
  
  // Check for brainstorm only pattern
  if (
    screens.includes(MassConsensusPageUrls.suggestions) &&
    !screens.includes(MassConsensusPageUrls.voting)
  ) {
    return MCQuestionType.BRAINSTORM_ONLY;
  }
  
  // Check for evaluate only pattern
  if (
    (screens.includes(MassConsensusPageUrls.randomSuggestions) ||
     screens.includes(MassConsensusPageUrls.topSuggestions)) &&
    !screens.includes(MassConsensusPageUrls.voting) &&
    !screens.includes(MassConsensusPageUrls.suggestions)
  ) {
    return MCQuestionType.EVALUATE_ONLY;
  }
  
  // Default to custom
  return MCQuestionType.CUSTOM;
}

/**
 * Checks if a Mass Consensus setup is already in multi-question format
 */
export function isMultiQuestionFormat(data: any): boolean {
  return data && 
         typeof data === 'object' && 
         'sessionId' in data && 
         'questions' in data &&
         Array.isArray(data.questions);
}

/**
 * Migrates existing Mass Consensus data to multi-question format
 * Handles both database migration and runtime conversion
 */
export async function migrateMassConsensusData(
  statementId: string,
  existingData: any,
  createdBy: string
): Promise<MCSession | null> {
  try {
    // Already in new format
    if (isMultiQuestionFormat(existingData)) {
      return existingData as MCSession;
    }
    
    // Extract steps from existing data
    let steps: MassConsensusStep[] | MassConsensusPageUrls[] = [];
    let title = 'Consensus Question';
    
    // Handle different existing data structures
    if (existingData?.loginTypes?.default?.steps) {
      steps = existingData.loginTypes.default.steps;
    } else if (existingData?.steps) {
      steps = existingData.steps;
    } else if (Array.isArray(existingData)) {
      steps = existingData;
    }
    
    if (existingData?.title) {
      title = existingData.title;
    }
    
    // Convert to multi-question format
    return convertSingleToMultiQuestion(
      statementId,
      title,
      steps,
      createdBy
    );
  } catch (error) {
    console.error('Error migrating Mass Consensus data:', error);
    return null;
  }
}

/**
 * Creates a compatibility wrapper for existing Mass Consensus components
 * This allows old components to work with new data structure
 */
export function createCompatibilityWrapper(session: MCSession): any {
  // If there's only one question, unwrap it for backward compatibility
  if (session.questions.length === 1) {
    const question = session.questions[0];
    return {
      statementId: session.statementId,
      steps: question.steps,
      title: question.content.question,
      // Preserve any existing login types structure
      loginTypes: {
        default: {
          steps: question.steps,
          processName: session.title
        }
      }
    };
  }
  
  // For multi-question sessions, return as-is
  return session;
}

/**
 * Validates if a session can be safely migrated
 */
export function canMigrate(data: any): boolean {
  // Check if data exists and has necessary fields
  if (!data) return false;
  
  // Already migrated
  if (isMultiQuestionFormat(data)) return true;
  
  // Check for legacy format indicators
  const hasSteps = 
    data?.steps ||
    data?.loginTypes?.default?.steps ||
    Array.isArray(data);
    
  return Boolean(hasSteps);
}

/**
 * Creates a migration report for debugging
 */
export function createMigrationReport(
  originalData: any,
  migratedData: MCSession | null
): {
  success: boolean;
  originalFormat: string;
  newFormat: string;
  questionsCount: number;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!migratedData) {
    errors.push('Migration failed - no output data');
  }
  
  let originalFormat = 'unknown';
  if (Array.isArray(originalData)) {
    originalFormat = 'array of steps';
  } else if (originalData?.loginTypes) {
    originalFormat = 'login types structure';
  } else if (originalData?.steps) {
    originalFormat = 'direct steps';
  } else if (isMultiQuestionFormat(originalData)) {
    originalFormat = 'already multi-question';
  }
  
  return {
    success: Boolean(migratedData),
    originalFormat,
    newFormat: 'multi-question session',
    questionsCount: migratedData?.questions.length || 0,
    errors
  };
}