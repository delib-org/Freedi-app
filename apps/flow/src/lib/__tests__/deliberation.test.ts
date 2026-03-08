import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  textSimilarity,
  findSimilar,
  loadScoreSnapshot,
  saveScoreSnapshot,
  getScoreTrend,
  loadSession,
  saveSession,
  createSession,
  advanceStage,
  getOfflineQueue,
  getOfflineQueueCount,
  StatementData,
  SessionState,
} from '../deliberation';

// ---------------------------------------------------------------------------
// Mock Firebase (so we can import the module without connecting to Firestore)
// ---------------------------------------------------------------------------
vi.mock('../firebase', () => ({
  db: {},
  doc: vi.fn(),
  getDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('../user', () => ({
  getUserState: () => ({ user: { uid: 'test-user-1' }, tier: 0, loading: false }),
}));

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
});

// ---------------------------------------------------------------------------
// textSimilarity
// ---------------------------------------------------------------------------
describe('textSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(textSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(textSimilarity('apple banana cherry', 'xyz uvw rst')).toBe(0);
  });

  it('returns a value between 0 and 1 for partial overlap', () => {
    const sim = textSimilarity(
      'buses are too infrequent during rush hour',
      'buses are always late during rush hour'
    );
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('is case insensitive', () => {
    expect(textSimilarity('Hello World Test', 'hello world test')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(textSimilarity('', '')).toBe(1);
    expect(textSimilarity('hello world test', '')).toBe(0);
    expect(textSimilarity('', 'hello world test')).toBe(0);
  });

  it('ignores short words (length <= 2)', () => {
    // "a" and "an" should be filtered out
    expect(textSimilarity('a cat on the mat', 'the cat on mat')).toBe(1);
  });

  it('strips punctuation', () => {
    expect(textSimilarity('hello, world! test', 'hello world test')).toBe(1);
  });

  it('handles Hebrew text', () => {
    const sim = textSimilarity('שלום עולם בדיקה', 'שלום עולם בדיקה');
    expect(sim).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// findSimilar
// ---------------------------------------------------------------------------
describe('findSimilar', () => {
  const statements: StatementData[] = [
    makeStatement('1', 'Buses are too infrequent during rush hour'),
    makeStatement('2', 'No safe bike lanes connecting neighborhoods'),
    makeStatement('3', 'Ticket prices keep rising but service quality drops'),
    makeStatement('4', 'Buses are always late during peak hours'),
  ];

  it('finds similar statements above threshold', () => {
    const results = findSimilar('buses infrequent rush hour', statements, 0.3);
    expect(results.length).toBeGreaterThan(0);
    // The first result should be the most similar
    expect(results[0].statement.statementId).toBe('1');
  });

  it('returns empty array when nothing matches', () => {
    const results = findSimilar('completely unrelated topic about cooking', statements, 0.3);
    expect(results).toHaveLength(0);
  });

  it('respects the threshold parameter', () => {
    const lowThreshold = findSimilar('buses late', statements, 0.1);
    const highThreshold = findSimilar('buses late', statements, 0.8);
    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
  });

  it('sorts results by similarity descending', () => {
    const results = findSimilar('buses rush hour late', statements, 0.1);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
    }
  });
});

// ---------------------------------------------------------------------------
// Score Snapshots & Trends
// ---------------------------------------------------------------------------
describe('score snapshots', () => {
  it('returns empty object when no snapshot exists', () => {
    expect(loadScoreSnapshot('q1')).toEqual({});
  });

  it('saves and loads a snapshot', () => {
    const statements: StatementData[] = [
      makeStatement('s1', 'test', 0.75),
      makeStatement('s2', 'test', 0.5),
    ];
    saveScoreSnapshot('q1', statements);

    const snapshot = loadScoreSnapshot('q1');
    expect(snapshot['s1']).toBe(0.75);
    expect(snapshot['s2']).toBe(0.5);
  });
});

describe('getScoreTrend', () => {
  it('returns 0 when no previous score exists', () => {
    expect(getScoreTrend('s1', 0.5, {})).toBe(0);
  });

  it('returns positive delta when score improved', () => {
    const trend = getScoreTrend('s1', 0.8, { s1: 0.5 });
    expect(trend).toBeCloseTo(0.3);
  });

  it('returns negative delta when score declined', () => {
    const trend = getScoreTrend('s1', 0.3, { s1: 0.6 });
    expect(trend).toBeCloseTo(-0.3);
  });

  it('returns 0 when score unchanged', () => {
    expect(getScoreTrend('s1', 0.5, { s1: 0.5 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------
describe('session management', () => {
  it('loadSession returns null when no session exists', () => {
    expect(loadSession('delib-1')).toBeNull();
  });

  it('saveSession and loadSession round-trip correctly', () => {
    const session: SessionState = {
      deliberationId: 'delib-1',
      userId: 'user-1',
      currentStage: 'needs-write',
      needsWritten: 2,
      needsEvaluated: 5,
      solutionsWritten: 1,
      solutionsEvaluated: 3,
      completedAt: null,
      lastVisit: 1000000,
    };
    saveSession(session);
    const loaded = loadSession('delib-1');
    expect(loaded).toEqual(session);
  });

  it('createSession creates a session at intro stage', () => {
    const session = createSession('delib-2');
    expect(session.deliberationId).toBe('delib-2');
    expect(session.currentStage).toBe('intro');
    expect(session.needsWritten).toBe(0);
    expect(session.solutionsWritten).toBe(0);
    expect(session.userId).toBe('test-user-1');
  });
});

describe('advanceStage', () => {
  it('advances through all stages in order', () => {
    const session = createSession('delib-3');
    expect(session.currentStage).toBe('intro');

    advanceStage(session);
    expect(session.currentStage).toBe('needs-write');

    advanceStage(session);
    expect(session.currentStage).toBe('needs-evaluate');

    advanceStage(session);
    expect(session.currentStage).toBe('solutions-write');

    advanceStage(session);
    expect(session.currentStage).toBe('solutions-evaluate');

    advanceStage(session);
    expect(session.currentStage).toBe('state');

    advanceStage(session);
    expect(session.currentStage).toBe('done');
  });

  it('stays at done when already at the last stage', () => {
    const session = createSession('delib-4');
    session.currentStage = 'done';
    advanceStage(session);
    expect(session.currentStage).toBe('done');
  });

  it('saves session after advancing', () => {
    const session = createSession('delib-5');
    advanceStage(session);
    const loaded = loadSession('delib-5');
    expect(loaded?.currentStage).toBe('needs-write');
  });
});

// ---------------------------------------------------------------------------
// Offline Queue
// ---------------------------------------------------------------------------
describe('offline queue', () => {
  it('returns empty array when no queue exists', () => {
    expect(getOfflineQueue()).toEqual([]);
    expect(getOfflineQueueCount()).toBe(0);
  });

  it('tracks count from localStorage', () => {
    localStorage.setItem('flow_offline_queue', JSON.stringify([
      { evaluationId: 'e1', evaluatorId: 'u1', statementId: 's1', parentId: 'p1', evaluation: 0.5, updatedAt: 1000 },
      { evaluationId: 'e2', evaluatorId: 'u1', statementId: 's2', parentId: 'p1', evaluation: -0.5, updatedAt: 2000 },
    ]));
    expect(getOfflineQueueCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeStatement(id: string, text: string, consensus = 0): StatementData {
  return {
    statementId: id,
    statement: text,
    parentId: 'q1',
    topParentId: 'delib-1',
    statementType: 'option',
    creatorId: 'user-1',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    consensus,
  };
}
