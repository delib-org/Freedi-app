/**
 * searchQuestions: a search must find any question the admin can access,
 * however old, not just the first handful Firestore returns.
 */

interface FakeDoc {
  id: string;
  data: () => Record<string, unknown>;
}

const mockCreatorDocs: FakeDoc[] = [];
const mockAdminDocs: FakeDoc[] = [];
let mockAdminIds: string[] = [];

const makeQuestionDoc = (id: string, text: string, createdAt: number): FakeDoc => ({
  id,
  data: () => ({ statementId: id, statement: text, createdAt }),
});

jest.mock('@/lib/firebase/admin', () => ({
  getFirestoreAdmin: () => ({
    collection: (name: string) => {
      if (name === 'statementsSubscribe') {
        return {
          where: () => ({
            where: () => ({
              get: async () => ({
                docs: mockAdminIds.map((statementId) => ({ data: () => ({ statementId }) })),
              }),
            }),
          }),
        };
      }

      return {
        doc: () => ({ get: async () => ({ exists: false }) }),
        where: (field: string) => {
          const isCreatorQuery = field === 'creatorId';
          let startIndex = 0;
          let pageSize = Infinity;
          const query = {
            where: () => query,
            orderBy: () => query,
            limit: (n: number) => {
              pageSize = n;

              return query;
            },
            startAfter: (last: FakeDoc) => {
              startIndex = mockCreatorDocs.findIndex((d) => d.id === last.id) + 1;

              return query;
            },
            get: async () => ({
              docs: isCreatorQuery
                ? mockCreatorDocs.slice(startIndex, startIndex + pageSize)
                : mockAdminDocs,
            }),
          };

          return query;
        },
      };
    },
  }),
}));

jest.mock('@/lib/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('@/constants/common', () => ({
  QUESTION_SEARCH: {
    SCAN_PAGE_SIZE: 3,
    MAX_CREATOR_DOCS: 100,
    MAX_ADMIN_IDS: 100,
    BROWSE_ADMIN_IDS: 90,
    IN_QUERY_BATCH: 30,
  },
}));

import { searchQuestions } from '../surveyQueries';

describe('searchQuestions', () => {
  beforeEach(() => {
    mockCreatorDocs.length = 0;
    mockAdminDocs.length = 0;
    mockAdminIds = [];
    // 10 questions; the one we look for is the oldest and sits past several scan pages
    for (let i = 0; i < 9; i++) {
      mockCreatorDocs.push(makeQuestionDoc(`q${i}`, `Recent topic ${i}`, 1000 + i));
    }
    mockCreatorDocs.push(makeQuestionDoc('old', 'Ancient Budget Question', 1));
  });

  it('finds an old question beyond the first fetched documents', async () => {
    const result = await searchQuestions('user1', { search: 'budget' });

    expect(result.questions.map((q) => q.statementId)).toEqual(['old']);
  });

  it('matches case-insensitively and paginates results', async () => {
    const page1 = await searchQuestions('user1', { search: 'RECENT', limit: 4 });

    expect(page1.questions).toHaveLength(4);
    expect(page1.hasMore).toBe(true);

    const page2 = await searchQuestions('user1', {
      search: 'RECENT',
      limit: 4,
      cursor: page1.nextCursor ?? undefined,
    });

    expect(page2.questions).toHaveLength(4);
    expect(page2.questions[0].statementId).not.toBe(page1.questions[0].statementId);
  });

  it('also searches questions the user can access as admin', async () => {
    mockAdminIds = ['shared'];
    mockAdminDocs.push(makeQuestionDoc('shared', 'Shared budget plan', 50));

    const result = await searchQuestions('user1', { search: 'budget' });

    expect(result.questions.map((q) => q.statementId).sort()).toEqual(['old', 'shared']);
  });

  it('returns nothing when no question matches', async () => {
    const result = await searchQuestions('user1', { search: 'zzz' });

    expect(result.questions).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});
