import type { SurveyDemographicPage, SurveyExplanationPage, Survey } from '@freedi/shared-types';

// ============================================
// Flow Item Types
// ============================================

export type FlowItemType = 'question' | 'demographic' | 'explanation';

/**
 * Base interface for flow items
 */
export interface BaseFlowItem {
  /** Type of flow item */
  type: FlowItemType;
  /** Position in the unified flow (0-indexed) */
  flowIndex: number;
  /** Unique identifier for this item */
  id: string;
}

/**
 * Question flow item
 */
export interface QuestionFlowItem extends BaseFlowItem {
  type: 'question';
  /** The statement ID of the question */
  questionId: string;
  /** Index within just the questions (0-indexed) */
  questionIndex: number;
}

/**
 * Demographic page flow item
 */
export interface DemographicFlowItem extends BaseFlowItem {
  type: 'demographic';
  /** The demographic page configuration */
  demographicPage: SurveyDemographicPage;
}

/**
 * Explanation page flow item
 */
export interface ExplanationFlowItem extends BaseFlowItem {
  type: 'explanation';
  /** The explanation page configuration */
  explanationPage: SurveyExplanationPage;
}

/**
 * Union type for all flow items
 */
export type SurveyFlowItem = QuestionFlowItem | DemographicFlowItem | ExplanationFlowItem;

// ============================================
// Flow Builder Utility
// ============================================

/**
 * Builds a unified survey flow that interleaves questions, demographic pages,
 * and explanation pages based on their positions.
 *
 * Position logic:
 * - 0: Before all questions
 * - 1-n: After question at index n-1 (e.g., position 1 = after first question)
 * - -1: After all questions
 *
 * At each position, explanation pages are added first, then demographic pages.
 *
 * @param survey - The survey containing questionIds, demographicPages, and explanationPages
 * @returns Array of SurveyFlowItem in the correct order
 */
export function buildSurveyFlow(survey: Survey): SurveyFlowItem[] {
  const flow: SurveyFlowItem[] = [];
  const demographicPages = survey.demographicPages || [];
  const explanationPages = survey.explanationPages || [];
  const questionIds = survey.questionIds || [];

  // Group demographic pages by position
  const demographicsByPosition = new Map<number, SurveyDemographicPage[]>();
  for (const page of demographicPages) {
    const existing = demographicsByPosition.get(page.position) || [];
    existing.push(page);
    demographicsByPosition.set(page.position, existing);
  }

  // Group explanation pages by position
  const explanationsByPosition = new Map<number, SurveyExplanationPage[]>();
  for (const page of explanationPages) {
    const existing = explanationsByPosition.get(page.position) || [];
    existing.push(page);
    explanationsByPosition.set(page.position, existing);
  }

  let flowIndex = 0;

  // Helper function to add pages at a given position
  const addPagesAtPosition = (position: number) => {
    // Add explanation pages first
    const explanationsAtPosition = explanationsByPosition.get(position) || [];
    for (const page of explanationsAtPosition) {
      flow.push({
        type: 'explanation',
        flowIndex: flowIndex++,
        id: page.explanationPageId,
        explanationPage: page,
      });
    }

    // Then add demographic pages
    const demographicsAtPosition = demographicsByPosition.get(position) || [];
    for (const page of demographicsAtPosition) {
      flow.push({
        type: 'demographic',
        flowIndex: flowIndex++,
        id: page.demographicPageId,
        demographicPage: page,
      });
    }
  };

  // Add pages at position 0 (before all questions)
  addPagesAtPosition(0);

  // Interleave questions and pages
  for (let questionIndex = 0; questionIndex < questionIds.length; questionIndex++) {
    const questionId = questionIds[questionIndex];

    // Add the question
    flow.push({
      type: 'question',
      flowIndex: flowIndex++,
      id: questionId,
      questionId,
      questionIndex,
    });

    // Add any pages positioned after this question (position = questionIndex + 1)
    addPagesAtPosition(questionIndex + 1);
  }

  // Add pages at position -1 (after all questions)
  addPagesAtPosition(-1);

  return flow;
}

/**
 * Gets the total number of items in the survey flow
 *
 * @param survey - The survey to calculate flow length for
 * @returns Total number of flow items (questions + demographic pages + explanation pages)
 */
export function getTotalFlowLength(survey: Survey): number {
  const questionCount = survey.questionIds?.length || 0;
  const demographicPageCount = survey.demographicPages?.length || 0;
  const explanationPageCount = survey.explanationPages?.length || 0;

  return questionCount + demographicPageCount + explanationPageCount;
}

/**
 * Gets a flow item by its flow index
 *
 * @param survey - The survey containing the flow
 * @param flowIndex - The index in the flow
 * @returns The flow item at that index, or undefined if out of bounds
 */
export function getFlowItemByIndex(survey: Survey, flowIndex: number): SurveyFlowItem | undefined {
  const flow = buildSurveyFlow(survey);

  return flow[flowIndex];
}

/**
 * Finds the flow index for a given question ID
 *
 * @param survey - The survey containing the flow
 * @param questionId - The question ID to find
 * @returns The flow index, or -1 if not found
 */
export function findFlowIndexByQuestionId(survey: Survey, questionId: string): number {
  const flow = buildSurveyFlow(survey);

  return flow.findIndex(
    (item) => item.type === 'question' && item.questionId === questionId
  );
}

/**
 * Finds the flow index for a given demographic page ID
 *
 * @param survey - The survey containing the flow
 * @param demographicPageId - The demographic page ID to find
 * @returns The flow index, or -1 if not found
 */
export function findFlowIndexByDemographicPageId(
  survey: Survey,
  demographicPageId: string
): number {
  const flow = buildSurveyFlow(survey);

  return flow.findIndex(
    (item) =>
      item.type === 'demographic' &&
      item.demographicPage.demographicPageId === demographicPageId
  );
}

/**
 * Finds the flow index for a given explanation page ID
 *
 * @param survey - The survey containing the flow
 * @param explanationPageId - The explanation page ID to find
 * @returns The flow index, or -1 if not found
 */
export function findFlowIndexByExplanationPageId(
  survey: Survey,
  explanationPageId: string
): number {
  const flow = buildSurveyFlow(survey);

  return flow.findIndex(
    (item) =>
      item.type === 'explanation' &&
      item.explanationPage.explanationPageId === explanationPageId
  );
}

/**
 * Type guard to check if a flow item is a question
 */
export function isQuestionFlowItem(item: SurveyFlowItem): item is QuestionFlowItem {
  return item.type === 'question';
}

/**
 * Type guard to check if a flow item is a demographic page
 */
export function isDemographicFlowItem(item: SurveyFlowItem): item is DemographicFlowItem {
  return item.type === 'demographic';
}

/**
 * Type guard to check if a flow item is an explanation page
 */
export function isExplanationFlowItem(item: SurveyFlowItem): item is ExplanationFlowItem {
  return item.type === 'explanation';
}

/**
 * Calculates the question-only index from a flow index
 * (useful for displaying "Question 3 of 5" when there are demographics mixed in)
 *
 * @param survey - The survey containing the flow
 * @param flowIndex - The current flow index
 * @returns The question number (1-indexed) if at a question, or null if at a demographic page
 */
export function getQuestionNumber(survey: Survey, flowIndex: number): number | null {
  const flow = buildSurveyFlow(survey);
  const item = flow[flowIndex];

  if (!item || item.type !== 'question') {
    return null;
  }

  return (item as QuestionFlowItem).questionIndex + 1;
}

/**
 * Gets the total number of questions (excluding demographic pages)
 *
 * @param survey - The survey to count questions for
 * @returns Total number of questions
 */
export function getTotalQuestions(survey: Survey): number {
  return survey.questionIds?.length || 0;
}

/**
 * Gets available positions for demographic pages based on question count
 *
 * @param questionCount - Number of questions in the survey
 * @returns Array of position options with translation keys
 */
export function getDemographicPositionOptions(
  questionCount: number
): Array<{ value: number; labelKey: string; labelParams?: Record<string, number> }> {
  const options: Array<{ value: number; labelKey: string; labelParams?: Record<string, number> }> = [
    { value: 0, labelKey: 'beforeAllQuestions' },
  ];

  for (let i = 1; i <= questionCount; i++) {
    options.push({
      value: i,
      labelKey: 'afterQuestion',
      labelParams: { number: i },
    });
  }

  options.push({ value: -1, labelKey: 'afterAllQuestions' });

  return options;
}
