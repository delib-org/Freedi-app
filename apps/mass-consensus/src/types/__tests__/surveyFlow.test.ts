import type { Survey, SurveyDemographicPage } from '@freedi/shared-types';
import {
  buildSurveyFlow,
  getTotalFlowLength,
  getFlowItemByIndex,
  findFlowIndexByQuestionId,
  findFlowIndexByDemographicPageId,
  isQuestionFlowItem,
  isDemographicFlowItem,
  getQuestionNumber,
  getTotalQuestions,
  getDemographicPositionOptions,
  type QuestionFlowItem,
  type DemographicFlowItem,
  type SurveyFlowItem,
} from '../surveyFlow';

// ============================================
// Test Helpers
// ============================================

function createMockSurvey(overrides: Partial<Survey> = {}): Survey {
  return {
    surveyId: 'survey-1',
    title: 'Test Survey',
    creatorId: 'creator-1',
    questionIds: [],
    settings: {
      allowSkipping: false,
      allowReturning: true,
      minEvaluationsPerQuestion: 3,
    },
    status: 'active' as const,
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    ...overrides,
  };
}

function createMockDemographicPage(overrides: Partial<SurveyDemographicPage> = {}): SurveyDemographicPage {
  return {
    demographicPageId: 'demo-page-1',
    title: 'About You',
    position: 0,
    required: true,
    customQuestionIds: [],
    ...overrides,
  };
}

// ============================================
// buildSurveyFlow Tests
// ============================================

describe('buildSurveyFlow', () => {
  describe('with questions only (no demographics)', () => {
    it('should return empty flow for survey with no questions', () => {
      const survey = createMockSurvey({ questionIds: [] });
      const flow = buildSurveyFlow(survey);

      expect(flow).toEqual([]);
    });

    it('should return questions in order', () => {
      const survey = createMockSurvey({
        questionIds: ['q1', 'q2', 'q3'],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(3);
      expect(flow[0]).toMatchObject({
        type: 'question',
        flowIndex: 0,
        id: 'q1',
        questionId: 'q1',
        questionIndex: 0,
      });
      expect(flow[1]).toMatchObject({
        type: 'question',
        flowIndex: 1,
        id: 'q2',
        questionId: 'q2',
        questionIndex: 1,
      });
      expect(flow[2]).toMatchObject({
        type: 'question',
        flowIndex: 2,
        id: 'q3',
        questionId: 'q3',
        questionIndex: 2,
      });
    });
  });

  describe('with demographic pages at position 0 (before questions)', () => {
    it('should place demographic page before all questions', () => {
      const survey = createMockSurvey({
        questionIds: ['q1', 'q2'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-1', position: 0 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(3);
      expect(flow[0]).toMatchObject({
        type: 'demographic',
        flowIndex: 0,
        id: 'demo-1',
      });
      expect(flow[1]).toMatchObject({
        type: 'question',
        flowIndex: 1,
        id: 'q1',
      });
      expect(flow[2]).toMatchObject({
        type: 'question',
        flowIndex: 2,
        id: 'q2',
      });
    });

    it('should place multiple demographic pages at position 0 in order', () => {
      const survey = createMockSurvey({
        questionIds: ['q1'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-1', position: 0 }),
          createMockDemographicPage({ demographicPageId: 'demo-2', position: 0 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(3);
      expect(flow[0].id).toBe('demo-1');
      expect(flow[1].id).toBe('demo-2');
      expect(flow[2].id).toBe('q1');
    });
  });

  describe('with demographic pages at position -1 (after all questions)', () => {
    it('should place demographic page after all questions', () => {
      const survey = createMockSurvey({
        questionIds: ['q1', 'q2'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-end', position: -1 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(3);
      expect(flow[0].id).toBe('q1');
      expect(flow[1].id).toBe('q2');
      expect(flow[2]).toMatchObject({
        type: 'demographic',
        flowIndex: 2,
        id: 'demo-end',
      });
    });

    it('should place multiple demographic pages at the end in order', () => {
      const survey = createMockSurvey({
        questionIds: ['q1'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-end-1', position: -1 }),
          createMockDemographicPage({ demographicPageId: 'demo-end-2', position: -1 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(3);
      expect(flow[0].id).toBe('q1');
      expect(flow[1].id).toBe('demo-end-1');
      expect(flow[2].id).toBe('demo-end-2');
    });
  });

  describe('with demographic pages at specific positions (after question n)', () => {
    it('should place demographic page after question 1 (position = 1)', () => {
      const survey = createMockSurvey({
        questionIds: ['q1', 'q2', 'q3'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-after-q1', position: 1 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(4);
      expect(flow[0].id).toBe('q1');
      expect(flow[1].id).toBe('demo-after-q1');
      expect(flow[2].id).toBe('q2');
      expect(flow[3].id).toBe('q3');
    });

    it('should place demographic page after question 2 (position = 2)', () => {
      const survey = createMockSurvey({
        questionIds: ['q1', 'q2', 'q3'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-after-q2', position: 2 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(4);
      expect(flow[0].id).toBe('q1');
      expect(flow[1].id).toBe('q2');
      expect(flow[2].id).toBe('demo-after-q2');
      expect(flow[3].id).toBe('q3');
    });

    it('should place multiple demographic pages after different questions', () => {
      const survey = createMockSurvey({
        questionIds: ['q1', 'q2', 'q3'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-after-q1', position: 1 }),
          createMockDemographicPage({ demographicPageId: 'demo-after-q3', position: 3 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(5);
      expect(flow[0].id).toBe('q1');
      expect(flow[1].id).toBe('demo-after-q1');
      expect(flow[2].id).toBe('q2');
      expect(flow[3].id).toBe('q3');
      expect(flow[4].id).toBe('demo-after-q3');
    });
  });

  describe('with mixed positions', () => {
    it('should correctly interleave demographics at all position types', () => {
      const survey = createMockSurvey({
        questionIds: ['q1', 'q2'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-start', position: 0 }),
          createMockDemographicPage({ demographicPageId: 'demo-middle', position: 1 }),
          createMockDemographicPage({ demographicPageId: 'demo-end', position: -1 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(5);
      expect(flow.map(item => item.id)).toEqual([
        'demo-start',
        'q1',
        'demo-middle',
        'q2',
        'demo-end',
      ]);
    });

    it('should handle flow indices correctly with mixed items', () => {
      const survey = createMockSurvey({
        questionIds: ['q1', 'q2'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-start', position: 0 }),
          createMockDemographicPage({ demographicPageId: 'demo-end', position: -1 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow[0].flowIndex).toBe(0);
      expect(flow[1].flowIndex).toBe(1);
      expect(flow[2].flowIndex).toBe(2);
      expect(flow[3].flowIndex).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('should handle survey with undefined demographicPages', () => {
      const survey = createMockSurvey({
        questionIds: ['q1'],
        demographicPages: undefined,
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(1);
      expect(flow[0].id).toBe('q1');
    });

    it('should handle survey with undefined questionIds', () => {
      const survey = createMockSurvey({
        questionIds: undefined as unknown as string[],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-1', position: 0 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      expect(flow).toHaveLength(1);
      expect(flow[0].id).toBe('demo-1');
    });

    it('should handle demographic page with invalid position (beyond question count)', () => {
      const survey = createMockSurvey({
        questionIds: ['q1'],
        demographicPages: [
          createMockDemographicPage({ demographicPageId: 'demo-invalid', position: 10 }),
        ],
      });
      const flow = buildSurveyFlow(survey);

      // Position 10 doesn't match any question, so it won't be placed in the middle loop
      // It's not 0 or -1 either, so it should just not appear
      expect(flow).toHaveLength(1);
      expect(flow[0].id).toBe('q1');
    });
  });
});

// ============================================
// getTotalFlowLength Tests
// ============================================

describe('getTotalFlowLength', () => {
  it('should return 0 for empty survey', () => {
    const survey = createMockSurvey({ questionIds: [] });
    expect(getTotalFlowLength(survey)).toBe(0);
  });

  it('should return question count when no demographics', () => {
    const survey = createMockSurvey({ questionIds: ['q1', 'q2', 'q3'] });
    expect(getTotalFlowLength(survey)).toBe(3);
  });

  it('should return sum of questions and demographic pages', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2'],
      demographicPages: [
        createMockDemographicPage({ demographicPageId: 'demo-1' }),
        createMockDemographicPage({ demographicPageId: 'demo-2' }),
      ],
    });
    expect(getTotalFlowLength(survey)).toBe(4);
  });

  it('should handle undefined questionIds', () => {
    const survey = createMockSurvey({
      questionIds: undefined as unknown as string[],
      demographicPages: [createMockDemographicPage()],
    });
    expect(getTotalFlowLength(survey)).toBe(1);
  });

  it('should handle undefined demographicPages', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2'],
      demographicPages: undefined,
    });
    expect(getTotalFlowLength(survey)).toBe(2);
  });
});

// ============================================
// getFlowItemByIndex Tests
// ============================================

describe('getFlowItemByIndex', () => {
  it('should return correct item at index', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2'],
    });

    const item0 = getFlowItemByIndex(survey, 0);
    const item1 = getFlowItemByIndex(survey, 1);

    expect(item0).toMatchObject({ id: 'q1', type: 'question' });
    expect(item1).toMatchObject({ id: 'q2', type: 'question' });
  });

  it('should return undefined for out-of-bounds index', () => {
    const survey = createMockSurvey({ questionIds: ['q1'] });

    expect(getFlowItemByIndex(survey, 5)).toBeUndefined();
    expect(getFlowItemByIndex(survey, -1)).toBeUndefined();
  });

  it('should return demographic item when at demographic index', () => {
    const survey = createMockSurvey({
      questionIds: ['q1'],
      demographicPages: [
        createMockDemographicPage({ demographicPageId: 'demo-1', position: 0 }),
      ],
    });

    const item0 = getFlowItemByIndex(survey, 0);
    expect(item0).toMatchObject({ id: 'demo-1', type: 'demographic' });
  });
});

// ============================================
// findFlowIndexByQuestionId Tests
// ============================================

describe('findFlowIndexByQuestionId', () => {
  it('should find question index in simple flow', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2', 'q3'],
    });

    expect(findFlowIndexByQuestionId(survey, 'q1')).toBe(0);
    expect(findFlowIndexByQuestionId(survey, 'q2')).toBe(1);
    expect(findFlowIndexByQuestionId(survey, 'q3')).toBe(2);
  });

  it('should find question index with demographics mixed in', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2'],
      demographicPages: [
        createMockDemographicPage({ demographicPageId: 'demo-1', position: 0 }),
      ],
    });

    // Flow: demo-1 (0), q1 (1), q2 (2)
    expect(findFlowIndexByQuestionId(survey, 'q1')).toBe(1);
    expect(findFlowIndexByQuestionId(survey, 'q2')).toBe(2);
  });

  it('should return -1 for non-existent question', () => {
    const survey = createMockSurvey({ questionIds: ['q1'] });
    expect(findFlowIndexByQuestionId(survey, 'non-existent')).toBe(-1);
  });
});

// ============================================
// findFlowIndexByDemographicPageId Tests
// ============================================

describe('findFlowIndexByDemographicPageId', () => {
  it('should find demographic page index', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2'],
      demographicPages: [
        createMockDemographicPage({ demographicPageId: 'demo-1', position: 0 }),
        createMockDemographicPage({ demographicPageId: 'demo-2', position: -1 }),
      ],
    });

    // Flow: demo-1 (0), q1 (1), q2 (2), demo-2 (3)
    expect(findFlowIndexByDemographicPageId(survey, 'demo-1')).toBe(0);
    expect(findFlowIndexByDemographicPageId(survey, 'demo-2')).toBe(3);
  });

  it('should return -1 for non-existent demographic page', () => {
    const survey = createMockSurvey({
      questionIds: ['q1'],
      demographicPages: [createMockDemographicPage({ demographicPageId: 'demo-1' })],
    });
    expect(findFlowIndexByDemographicPageId(survey, 'non-existent')).toBe(-1);
  });

  it('should return -1 when no demographic pages exist', () => {
    const survey = createMockSurvey({ questionIds: ['q1'] });
    expect(findFlowIndexByDemographicPageId(survey, 'demo-1')).toBe(-1);
  });
});

// ============================================
// Type Guard Tests
// ============================================

describe('isQuestionFlowItem', () => {
  it('should return true for question items', () => {
    const survey = createMockSurvey({ questionIds: ['q1'] });
    const flow = buildSurveyFlow(survey);

    expect(isQuestionFlowItem(flow[0])).toBe(true);
  });

  it('should return false for demographic items', () => {
    const survey = createMockSurvey({
      questionIds: [],
      demographicPages: [createMockDemographicPage({ position: 0 })],
    });
    const flow = buildSurveyFlow(survey);

    expect(isQuestionFlowItem(flow[0])).toBe(false);
  });
});

describe('isDemographicFlowItem', () => {
  it('should return true for demographic items', () => {
    const survey = createMockSurvey({
      questionIds: [],
      demographicPages: [createMockDemographicPage({ position: 0 })],
    });
    const flow = buildSurveyFlow(survey);

    expect(isDemographicFlowItem(flow[0])).toBe(true);
  });

  it('should return false for question items', () => {
    const survey = createMockSurvey({ questionIds: ['q1'] });
    const flow = buildSurveyFlow(survey);

    expect(isDemographicFlowItem(flow[0])).toBe(false);
  });
});

// ============================================
// getQuestionNumber Tests
// ============================================

describe('getQuestionNumber', () => {
  it('should return 1-indexed question number', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2', 'q3'],
    });

    expect(getQuestionNumber(survey, 0)).toBe(1);
    expect(getQuestionNumber(survey, 1)).toBe(2);
    expect(getQuestionNumber(survey, 2)).toBe(3);
  });

  it('should return null for demographic pages', () => {
    const survey = createMockSurvey({
      questionIds: ['q1'],
      demographicPages: [
        createMockDemographicPage({ demographicPageId: 'demo-1', position: 0 }),
      ],
    });

    // Flow: demo-1 (0), q1 (1)
    expect(getQuestionNumber(survey, 0)).toBeNull();
    expect(getQuestionNumber(survey, 1)).toBe(1);
  });

  it('should return null for out-of-bounds index', () => {
    const survey = createMockSurvey({ questionIds: ['q1'] });
    expect(getQuestionNumber(survey, 10)).toBeNull();
  });

  it('should return correct question number with interleaved demographics', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2', 'q3'],
      demographicPages: [
        createMockDemographicPage({ demographicPageId: 'demo-1', position: 1 }),
      ],
    });

    // Flow: q1 (0), demo-1 (1), q2 (2), q3 (3)
    expect(getQuestionNumber(survey, 0)).toBe(1); // q1
    expect(getQuestionNumber(survey, 1)).toBeNull(); // demo-1
    expect(getQuestionNumber(survey, 2)).toBe(2); // q2
    expect(getQuestionNumber(survey, 3)).toBe(3); // q3
  });
});

// ============================================
// getTotalQuestions Tests
// ============================================

describe('getTotalQuestions', () => {
  it('should return 0 for empty survey', () => {
    const survey = createMockSurvey({ questionIds: [] });
    expect(getTotalQuestions(survey)).toBe(0);
  });

  it('should return question count', () => {
    const survey = createMockSurvey({ questionIds: ['q1', 'q2', 'q3'] });
    expect(getTotalQuestions(survey)).toBe(3);
  });

  it('should handle undefined questionIds', () => {
    const survey = createMockSurvey({
      questionIds: undefined as unknown as string[],
    });
    expect(getTotalQuestions(survey)).toBe(0);
  });

  it('should not count demographic pages', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2'],
      demographicPages: [
        createMockDemographicPage(),
        createMockDemographicPage(),
      ],
    });
    expect(getTotalQuestions(survey)).toBe(2);
  });
});

// ============================================
// getDemographicPositionOptions Tests
// ============================================

describe('getDemographicPositionOptions', () => {
  it('should return start and end options for 0 questions', () => {
    const options = getDemographicPositionOptions(0);

    expect(options).toHaveLength(2);
    expect(options[0]).toEqual({ value: 0, labelKey: 'beforeAllQuestions' });
    expect(options[1]).toEqual({ value: -1, labelKey: 'afterAllQuestions' });
  });

  it('should return options for each question position', () => {
    const options = getDemographicPositionOptions(3);

    expect(options).toHaveLength(5);
    expect(options[0]).toEqual({ value: 0, labelKey: 'beforeAllQuestions' });
    expect(options[1]).toEqual({
      value: 1,
      labelKey: 'afterQuestion',
      labelParams: { number: 1 },
    });
    expect(options[2]).toEqual({
      value: 2,
      labelKey: 'afterQuestion',
      labelParams: { number: 2 },
    });
    expect(options[3]).toEqual({
      value: 3,
      labelKey: 'afterQuestion',
      labelParams: { number: 3 },
    });
    expect(options[4]).toEqual({ value: -1, labelKey: 'afterAllQuestions' });
  });

  it('should handle single question', () => {
    const options = getDemographicPositionOptions(1);

    expect(options).toHaveLength(3);
    expect(options[0].value).toBe(0);
    expect(options[1].value).toBe(1);
    expect(options[2].value).toBe(-1);
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Survey Flow Integration', () => {
  it('should maintain consistent flow across all utilities', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2', 'q3'],
      demographicPages: [
        createMockDemographicPage({ demographicPageId: 'demo-start', position: 0 }),
        createMockDemographicPage({ demographicPageId: 'demo-mid', position: 2 }),
        createMockDemographicPage({ demographicPageId: 'demo-end', position: -1 }),
      ],
    });

    const flow = buildSurveyFlow(survey);
    const totalLength = getTotalFlowLength(survey);

    // Verify total length matches flow
    expect(flow.length).toBe(totalLength);
    expect(totalLength).toBe(6);

    // Verify flow order: demo-start, q1, q2, demo-mid, q3, demo-end
    const expectedOrder = ['demo-start', 'q1', 'q2', 'demo-mid', 'q3', 'demo-end'];
    expect(flow.map(item => item.id)).toEqual(expectedOrder);

    // Verify findFlowIndexByQuestionId works correctly
    expect(findFlowIndexByQuestionId(survey, 'q1')).toBe(1);
    expect(findFlowIndexByQuestionId(survey, 'q2')).toBe(2);
    expect(findFlowIndexByQuestionId(survey, 'q3')).toBe(4);

    // Verify findFlowIndexByDemographicPageId works correctly
    expect(findFlowIndexByDemographicPageId(survey, 'demo-start')).toBe(0);
    expect(findFlowIndexByDemographicPageId(survey, 'demo-mid')).toBe(3);
    expect(findFlowIndexByDemographicPageId(survey, 'demo-end')).toBe(5);

    // Verify getFlowItemByIndex returns correct items
    for (let i = 0; i < flow.length; i++) {
      expect(getFlowItemByIndex(survey, i)).toEqual(flow[i]);
    }

    // Verify question numbers
    expect(getQuestionNumber(survey, 1)).toBe(1); // q1
    expect(getQuestionNumber(survey, 2)).toBe(2); // q2
    expect(getQuestionNumber(survey, 4)).toBe(3); // q3
    expect(getQuestionNumber(survey, 0)).toBeNull(); // demo-start
    expect(getQuestionNumber(survey, 3)).toBeNull(); // demo-mid
    expect(getQuestionNumber(survey, 5)).toBeNull(); // demo-end

    // Verify total questions count
    expect(getTotalQuestions(survey)).toBe(3);
  });

  it('should handle complex survey with multiple demographics at same position', () => {
    const survey = createMockSurvey({
      questionIds: ['q1', 'q2'],
      demographicPages: [
        createMockDemographicPage({ demographicPageId: 'demo-1a', position: 0 }),
        createMockDemographicPage({ demographicPageId: 'demo-1b', position: 0 }),
        createMockDemographicPage({ demographicPageId: 'demo-end-a', position: -1 }),
        createMockDemographicPage({ demographicPageId: 'demo-end-b', position: -1 }),
      ],
    });

    const flow = buildSurveyFlow(survey);

    // Verify flow order
    expect(flow.map(item => item.id)).toEqual([
      'demo-1a',
      'demo-1b',
      'q1',
      'q2',
      'demo-end-a',
      'demo-end-b',
    ]);

    // Verify flow indices are sequential
    flow.forEach((item, index) => {
      expect(item.flowIndex).toBe(index);
    });
  });
});
