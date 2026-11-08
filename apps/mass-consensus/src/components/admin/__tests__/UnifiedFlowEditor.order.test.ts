import type { Statement, SurveyDemographicPage, SurveyExplanationPage } from '@freedi/shared-types';
import { buildUnifiedFlow, recalculatePositions } from '../flowEditorOrder';

/**
 * A drag in the flow editor is applied by recalculating page positions from the
 * dropped order and then rebuilding the flow from those pages. Before `order`
 * existed, the rebuild always put explanations before demographics inside one
 * slot, so dropping a demographic page above an explanation page silently
 * snapped back. These tests pin the round trip.
 */

function question(id: string): Statement {
  return { statementId: id, statement: id } as Statement;
}

function demo(id: string, position: number, order?: number): SurveyDemographicPage {
  return { demographicPageId: id, title: id, position, order, required: false, customQuestionIds: [] };
}

function explanation(id: string, position: number, order?: number): SurveyExplanationPage {
  return { explanationPageId: id, title: id, content: '', position, order };
}

const ids = (flow: ReturnType<typeof buildUnifiedFlow>) => flow.map((item) => item.id);

describe('UnifiedFlowEditor ordering', () => {
  it('renders a legacy survey as it always did: explanations before demographics in a slot', () => {
    const flow = buildUnifiedFlow([question('q1')], [demo('about-you', 1)], [explanation('service', 1)]);

    expect(ids(flow)).toEqual(['q1', 'service', 'about-you']);
  });

  it('keeps a demographic page above an explanation page after the drop', () => {
    const questions = [question('q1')];
    const before = buildUnifiedFlow(questions, [demo('about-you', 1)], [explanation('service', 1)]);
    expect(ids(before)).toEqual(['q1', 'service', 'about-you']);

    // Admin drags "about-you" above "service"
    const dropped = [before[0], before[2], before[1]];
    const { questionOrder, demographicPages, explanationPages } = recalculatePositions(dropped, questions);

    // After the last question the editor stores position -1, never n
    expect(demographicPages[0]).toMatchObject({ demographicPageId: 'about-you', position: -1, order: 0 });
    expect(explanationPages[0]).toMatchObject({ explanationPageId: 'service', position: -1, order: 1 });

    const after = buildUnifiedFlow(questionOrder, demographicPages, explanationPages);
    expect(ids(after)).toEqual(['q1', 'about-you', 'service']);
  });

  it('restarts the order count in every slot', () => {
    const questions = [question('q1'), question('q2')];
    const flow = buildUnifiedFlow(
      questions,
      [demo('d0', 0), demo('d2', 2)],
      [explanation('e0', 0), explanation('e2', 2)]
    );
    const { demographicPages, explanationPages } = recalculatePositions(flow, questions);

    expect(explanationPages).toEqual([
      expect.objectContaining({ explanationPageId: 'e0', position: 0, order: 0 }),
      expect.objectContaining({ explanationPageId: 'e2', position: -1, order: 0 }),
    ]);
    expect(demographicPages).toEqual([
      expect.objectContaining({ demographicPageId: 'd0', position: 0, order: 1 }),
      expect.objectContaining({ demographicPageId: 'd2', position: -1, order: 1 }),
    ]);
  });

  it('is stable: rebuilding from recalculated pages reproduces the same flow', () => {
    const questions = [question('q1'), question('q2'), question('q3')];
    const flow = buildUnifiedFlow(
      questions,
      [demo('d-mid', 2, 0), demo('d-end', -1)],
      [explanation('e-start', 0), explanation('e-mid', 2, 1)]
    );
    const { questionOrder, demographicPages, explanationPages } = recalculatePositions(flow, questions);

    expect(ids(buildUnifiedFlow(questionOrder, demographicPages, explanationPages))).toEqual(ids(flow));
  });
});
