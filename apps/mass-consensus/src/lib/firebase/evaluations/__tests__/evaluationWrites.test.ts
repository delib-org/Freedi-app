import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  applyEvaluationWrites,
  buildEvaluationDoc,
  buildUserEvaluationDoc,
  evaluationDocId,
  upsertEvaluation,
  userEvaluationDocId,
} from '../evaluationWrites';

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...values: unknown[]) => ({ __op: 'arrayUnion', values }),
    increment: (n: number) => ({ __op: 'increment', n }),
  },
}));

interface FakeRef {
  path: string;
}

interface SetCall {
  ref: FakeRef;
  data: Record<string, unknown>;
  options?: { merge?: boolean };
}

/** Minimal Firestore stand-in: refs are `collection/doc` paths, reads come from `existing`. */
function makeFakeDb(existing: Record<string, Record<string, unknown>> = {}) {
  const sets: SetCall[] = [];
  const updates: { ref: FakeRef; data: Record<string, unknown> }[] = [];

  const writer = {
    set: (ref: FakeRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      sets.push({ ref, data, options });

      return writer;
    },
    update: (ref: FakeRef, data: Record<string, unknown>) => {
      updates.push({ ref, data });

      return writer;
    },
    get: async (ref: FakeRef) => ({
      exists: ref.path in existing,
      data: () => existing[ref.path],
    }),
  };

  const db = {
    collection: (name: string) => ({
      doc: (id: string): FakeRef => ({ path: `${name}/${id}` }),
    }),
    runTransaction: async <T>(fn: (tx: Transaction) => Promise<T>) =>
      fn(writer as unknown as Transaction),
  };

  return { db: db as unknown as Firestore, writer, sets, updates };
}

const input = {
  statementId: 'opt-1',
  parentId: 'q-1',
  userId: 'user-1',
  displayName: 'Anon',
  evaluation: 1,
};

describe('evaluationWrites', () => {
  describe('ids', () => {
    it('uses the deterministic user--statement / user--parent ids', () => {
      expect(evaluationDocId('u', 's')).toBe('u--s');
      expect(userEvaluationDocId('u', 'p')).toBe('u--p');
    });
  });

  describe('buildEvaluationDoc', () => {
    it('builds the same shape the swipe API writes', () => {
      const doc = buildEvaluationDoc(input, 1000);
      expect(doc).toEqual({
        evaluationId: 'user-1--opt-1',
        parentId: 'q-1',
        statementId: 'opt-1',
        evaluatorId: 'user-1',
        evaluator: { uid: 'user-1', displayName: 'Anon', email: '', photoURL: '', isAnonymous: true },
        evaluation: 1,
        updatedAt: 1000,
      });
    });

    it('only stamps a demographic anchor when given one', () => {
      expect(buildEvaluationDoc(input, 1)).not.toHaveProperty('demographicAnchorId');
      expect(buildEvaluationDoc({ ...input, demographicAnchorId: 'anchor' }, 1)).toMatchObject({
        demographicAnchorId: 'anchor',
      });
    });
  });

  describe('buildUserEvaluationDoc', () => {
    it('accumulates evaluated option ids and stamps createdAt only on first write', () => {
      const fresh = buildUserEvaluationDoc(input, 5, false);
      expect(fresh).toMatchObject({
        userEvaluationId: 'user-1--q-1',
        userId: 'user-1',
        parentStatementId: 'q-1',
        evaluatedOptionsIds: { __op: 'arrayUnion', values: ['opt-1'] },
        lastUpdated: 5,
        createdAt: 5,
      });

      const again = buildUserEvaluationDoc(input, 6, true);
      expect(again).not.toHaveProperty('createdAt');
      expect(again.lastUpdated).toBe(6);
    });
  });

  describe('applyEvaluationWrites', () => {
    it('queues the evaluation doc and a merged userEvaluations mirror on the writer', () => {
      const { db, writer, sets } = makeFakeDb();

      const id = applyEvaluationWrites(writer, db, input, {
        userEvaluationExists: false,
        now: 42,
      });

      expect(id).toBe('user-1--opt-1');
      expect(sets).toHaveLength(2);
      expect(sets[0].ref.path).toBe('evaluations/user-1--opt-1');
      expect(sets[0].options).toBeUndefined();
      expect(sets[1].ref.path).toBe('userEvaluations/user-1--q-1');
      expect(sets[1].options).toEqual({ merge: true });
      expect(sets[1].data.createdAt).toBe(42);
    });
  });

  describe('upsertEvaluation', () => {
    it('reports created=true and runs the whenCreated writes for a first rating', async () => {
      const { db, sets, updates } = makeFakeDb();
      const whenCreated = jest.fn((tx: Transaction) => {
        tx.update({ path: 'statements/opt-1' } as never, { evaluations: 1 });
      });

      const result = await upsertEvaluation(db, input, whenCreated);

      expect(result).toEqual({ evaluationId: 'user-1--opt-1', created: true });
      expect(whenCreated).toHaveBeenCalledTimes(1);
      expect(updates).toHaveLength(1);
      expect(sets.map((s) => s.ref.path)).toEqual([
        'evaluations/user-1--opt-1',
        'userEvaluations/user-1--q-1',
      ]);
    });

    it('reports created=false and skips whenCreated when the user already rated this option', async () => {
      const { db, sets, updates } = makeFakeDb({
        'evaluations/user-1--opt-1': { evaluation: -1 },
        'userEvaluations/user-1--q-1': { createdAt: 1 },
      });
      const whenCreated = jest.fn();

      const result = await upsertEvaluation(db, { ...input, evaluation: 1 }, whenCreated);

      expect(result.created).toBe(false);
      expect(whenCreated).not.toHaveBeenCalled();
      expect(updates).toHaveLength(0);
      // Still overwrites the evaluation (re-rating) and touches the mirror without a new createdAt
      expect(sets[0].data.evaluation).toBe(1);
      expect(sets[1].data).not.toHaveProperty('createdAt');
    });

    it('keeps a stored demographic anchor when the caller sends none', async () => {
      const { db, sets } = makeFakeDb({
        'evaluations/user-1--opt-1': { demographicAnchorId: 'survey-anchor' },
      });

      await upsertEvaluation(db, input);

      expect(sets[0].data.demographicAnchorId).toBe('survey-anchor');
    });

    it('prefers the anchor the caller sends over the stored one', async () => {
      const { db, sets } = makeFakeDb({
        'evaluations/user-1--opt-1': { demographicAnchorId: 'old' },
      });

      await upsertEvaluation(db, { ...input, demographicAnchorId: 'new' });

      expect(sets[0].data.demographicAnchorId).toBe('new');
    });
  });
});
