import { StatementType } from '@freedi/shared-types';
import { buildOptionStatements, cleanOptionTexts } from '../buildOptionStatements';

jest.mock('@/lib/firebase/admin', () => ({ initializeFirebaseAdmin: jest.fn() }));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));

const creator = { uid: 'admin-1', displayName: 'Admin', email: '', photoURL: '', isAnonymous: false };
const question = { statementId: 'q1', topParentId: 'top', parents: ['top', 'group'] };
const FIXED_BATCH_TIME = 1_700_000_000_000;

describe('buildOptionStatements', () => {
  it('builds one option per text, in order, under the question', () => {
    const options = buildOptionStatements(question, ['A', 'B', 'C'], creator);

    expect(options.map((o) => o.statement)).toEqual(['A', 'B', 'C']);
    options.forEach((option) => {
      expect(option.statementType).toBe(StatementType.option);
      expect(option.parentId).toBe('q1');
      expect(option.topParentId).toBe('top');
      expect(option.parents).toEqual(['top', 'group', 'q1']);
      expect(option.creatorId).toBe('admin-1');
    });
  });

  it('keeps the typed order recoverable from createdAt even when the clock ticks between options', () => {
    // First read is the batch clock; every later read (one per option inside
    // createStatementObject) jumps ahead, as a real tick between calls would.
    let tick = 0;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => FIXED_BATCH_TIME + 1000 * tick++);

    try {
      const options = buildOptionStatements(question, ['A', 'B', 'C'], creator);

      expect(options.map((o) => o.createdAt)).toEqual([FIXED_BATCH_TIME, FIXED_BATCH_TIME + 1, FIXED_BATCH_TIME + 2]);
      options.forEach((option) => expect(option.lastUpdate).toBe(option.createdAt));
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('falls back to the question id as topParentId', () => {
    const [option] = buildOptionStatements({ statementId: 'q2', topParentId: '', parents: [] }, ['A'], creator);

    expect(option.topParentId).toBe('q2');
    expect(option.parents).toEqual(['q2']);
  });

  it('gives every option its own id', () => {
    const ids = buildOptionStatements(question, ['A', 'B'], creator).map((o) => o.statementId);

    expect(new Set(ids).size).toBe(2);
  });
});

describe('cleanOptionTexts', () => {
  it('trims and drops empty lines', () => {
    expect(cleanOptionTexts(['  A ', '', '   ', 'B'])).toEqual(['A', 'B']);
  });
});
