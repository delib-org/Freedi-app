import type { Statement, SurveyDemographicPage, SurveyExplanationPage } from '@freedi/shared-types';
import { orderPagesAtPosition } from '@freedi/shared-types';

/**
 * Pure ordering logic behind UnifiedFlowEditor: the drag-and-drop list is this
 * flow, and a drop is applied by recalculating page positions from the dropped
 * order and rebuilding. Kept out of the component so it can be tested without
 * the Firebase client that the editor's children initialize on import.
 */

export type FlowItemData =
  | { type: 'question'; id: string; question: Statement }
  | { type: 'demographic'; id: string; page: SurveyDemographicPage }
  | { type: 'explanation'; id: string; page: SurveyExplanationPage };

/**
 * Builds a unified flow from questions, demographic pages, and explanation pages
 * based on their positions
 */
export function buildUnifiedFlow(
  questions: Statement[],
  demographicPages: SurveyDemographicPage[],
  explanationPages: SurveyExplanationPage[]
): FlowItemData[] {
  const flow: FlowItemData[] = [];

  // Same ordering the participant runtime uses, so the editor shows the real flow
  const addPagesAtPosition = (position: number) => {
    orderPagesAtPosition(position, explanationPages, demographicPages).forEach((item) => {
      if (item.type === 'explanation') {
        flow.push({ type: 'explanation', id: item.page.explanationPageId, page: item.page });
      } else {
        flow.push({ type: 'demographic', id: item.page.demographicPageId, page: item.page });
      }
    });
  };

  // Position 0: before all questions
  addPagesAtPosition(0);

  // Interleave questions and pages
  questions.forEach((question, index) => {
    flow.push({ type: 'question', id: question.statementId, question });
    addPagesAtPosition(index + 1);
  });

  // Position -1: after all questions
  addPagesAtPosition(-1);

  return flow;
}

/**
 * Recalculates positions for pages based on new flow order
 */
export function recalculatePositions(
  flow: FlowItemData[],
  _questions: Statement[]
): {
  demographicPages: SurveyDemographicPage[];
  explanationPages: SurveyExplanationPage[];
  questionOrder: Statement[];
} {
  const questionOrder: Statement[] = [];
  const demographicPages: SurveyDemographicPage[] = [];
  const explanationPages: SurveyExplanationPage[] = [];

  let lastQuestionIndex = -1;
  // Order within the current slot; the slot has no other order than the one the admin dragged
  let orderInSlot = 0;
  const totalQuestions = flow.filter((item) => item.type === 'question').length;

  flow.forEach((item) => {
    if (item.type === 'question') {
      questionOrder.push(item.question);
      lastQuestionIndex++;
      orderInSlot = 0;

      return;
    }

    const newPosition =
      lastQuestionIndex === totalQuestions - 1 && questionOrder.length === totalQuestions
        ? -1 // After all questions
        : lastQuestionIndex + 1; // After the last question we've seen
    const order = orderInSlot++;

    if (item.type === 'demographic') {
      demographicPages.push({ ...item.page, position: newPosition, order });
    } else {
      explanationPages.push({ ...item.page, position: newPosition, order });
    }
  });

  return { questionOrder, demographicPages, explanationPages };
}
