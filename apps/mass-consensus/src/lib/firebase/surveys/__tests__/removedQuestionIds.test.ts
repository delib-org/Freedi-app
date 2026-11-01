const mockQueriedIds: string[][] = [];
let mockStatementDocs: Array<Record<string, unknown>> = [];
let mockAdminOf: string[] = [];

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => ({
    collection: (name: string) => ({
      where: (field: string, _op: string, value: unknown) => {
        const query = {
          where: () => query,
          get: async () => {
            if (name === 'statementsSubscribe') {
              return { docs: mockAdminOf.map((statementId) => ({ data: () => ({ statementId }) })) };
            }
            const ids = value as string[];
            if (field === 'statementId') mockQueriedIds.push(ids);

            return {
              docs: mockStatementDocs
                .filter((d) => ids.includes(d.statementId as string))
                .map((d) => ({ data: () => d })),
            };
          },
        };

        return query;
      },
    }),
  }),
}));

import { QUESTION_SEARCH } from '@/constants/common';
import { sanitizeRemovedQuestionIds } from '../removedQuestionIds';
import { fetchAccessibleQuestionsByIds } from '../suggestionCandidates';

describe('sanitizeRemovedQuestionIds', () => {
  it('drops non-arrays', () => {
    expect(sanitizeRemovedQuestionIds(undefined)).toBeUndefined();
    expect(sanitizeRemovedQuestionIds('a,b')).toBeUndefined();
    expect(sanitizeRemovedQuestionIds({ 0: 'a' })).toBeUndefined();
  });

  it('keeps trimmed, non-empty, unique strings in order', () => {
    expect(sanitizeRemovedQuestionIds([' a ', '', 5, null, 'b', 'a', '  '])).toEqual(['a', 'b']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: QUESTION_SEARCH.MAX_REMOVED_IDS + 10 }, (_, i) => `q${i}`);
    const result = sanitizeRemovedQuestionIds(many);

    expect(result).toHaveLength(QUESTION_SEARCH.MAX_REMOVED_IDS);
    expect(result?.[0]).toBe('q0');
  });

  it('accepts an empty list (clears it)', () => {
    expect(sanitizeRemovedQuestionIds([])).toEqual([]);
  });
});

describe('fetchAccessibleQuestionsByIds', () => {
  beforeEach(() => {
    mockQueriedIds.length = 0;
    mockStatementDocs = [
      { statementId: 'mine', creatorId: 'u1' },
      { statementId: 'shared', creatorId: 'other' },
      { statementId: 'secret', creatorId: 'other' },
    ];
    mockAdminOf = ['shared'];
  });

  it('returns only questions the user created or is admin of', async () => {
    const result = await fetchAccessibleQuestionsByIds('u1', ['mine', 'shared', 'secret']);

    expect(result.map((q) => q.statementId).sort()).toEqual(['mine', 'shared']);
  });

  it('looks up at most MAX_REMOVED_IDS ids', async () => {
    const ids = Array.from({ length: QUESTION_SEARCH.MAX_REMOVED_IDS + 15 }, (_, i) => `q${i}`);
    await fetchAccessibleQuestionsByIds('u1', ids);

    expect(mockQueriedIds.flat()).toHaveLength(QUESTION_SEARCH.MAX_REMOVED_IDS);
  });

  it('does not query for an empty list', async () => {
    expect(await fetchAccessibleQuestionsByIds('u1', [])).toEqual([]);
    expect(mockQueriedIds).toHaveLength(0);
  });
});
