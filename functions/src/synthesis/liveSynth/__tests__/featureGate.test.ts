jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGetFirestore = jest.fn();
jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => mockGetFirestore(),
}));

import { isLiveSynthEnabledForQuestion, __INTERNAL } from '../featureGate';
import { QuestionType, type Statement } from '@freedi/shared-types';

/**
 * Per-question gate decisions. Pinning each rule:
 *   - Explicit override on the question wins (true OR false).
 *   - Explicit override on the topParent wins next.
 *   - Default: ON for MC, OFF otherwise.
 */

function statement(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q1',
		statement: 'q text',
		statementType: 'question',
		parentId: 'top',
		topParentId: 'q1',
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any as Statement & typeof overrides;
	// Note: tests never read more than the fields they set in `overrides`.
}

beforeEach(() => {
	mockGetFirestore.mockReset();
});

function withSettings(s: Statement, settings: Record<string, unknown>): Statement {
	// Cast through unknown so the override field doesn't need to be on the
	// shared-types schema (matches the production read path).
	return { ...s, statementSettings: settings as Statement['statementSettings'] };
}

function asMc(s: Statement): Statement {
	return {
		...s,
		questionSettings: {
			questionType: QuestionType.massConsensus,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
	};
}

describe('readOverride helper', () => {
	it('returns true when statementSettings.liveSynthEnabled === true', () => {
		expect(__INTERNAL.readOverride(withSettings(statement(), { liveSynthEnabled: true }))).toBe(
			true,
		);
	});
	it('returns false when statementSettings.liveSynthEnabled === false', () => {
		expect(__INTERNAL.readOverride(withSettings(statement(), { liveSynthEnabled: false }))).toBe(
			false,
		);
	});
	it('returns undefined when the field is missing', () => {
		expect(__INTERNAL.readOverride(withSettings(statement(), {}))).toBeUndefined();
		expect(__INTERNAL.readOverride(statement())).toBeUndefined();
	});
	it('returns undefined for non-boolean values (no truthy coercion)', () => {
		expect(
			__INTERNAL.readOverride(withSettings(statement(), { liveSynthEnabled: 'yes' })),
		).toBeUndefined();
		expect(
			__INTERNAL.readOverride(withSettings(statement(), { liveSynthEnabled: 1 })),
		).toBeUndefined();
	});
});

describe('isMassConsensus helper', () => {
	it('returns true for MC questions', () => {
		expect(__INTERNAL.isMassConsensus(asMc(statement()))).toBe(true);
	});
	it('returns false for non-MC questions', () => {
		expect(__INTERNAL.isMassConsensus(statement())).toBe(false);
	});
	it('returns false for null', () => {
		expect(__INTERNAL.isMassConsensus(null)).toBe(false);
	});
});

describe('isLiveSynthEnabledForQuestion', () => {
	it('returns true when the question itself is MC (default ON)', async () => {
		const parent = asMc(statement());
		const result = await isLiveSynthEnabledForQuestion({ parent, topParent: parent });
		expect(result).toBe(true);
	});

	it('returns false for a non-MC question with no override (default OFF)', async () => {
		const parent = statement();
		const result = await isLiveSynthEnabledForQuestion({ parent, topParent: parent });
		expect(result).toBe(false);
	});

	it('explicit override TRUE on the question forces enabled even outside MC', async () => {
		const parent = withSettings(statement(), { liveSynthEnabled: true });
		const result = await isLiveSynthEnabledForQuestion({ parent, topParent: parent });
		expect(result).toBe(true);
	});

	it('explicit override FALSE on the question disables even when MC', async () => {
		const parent = asMc(withSettings(statement(), { liveSynthEnabled: false }));
		const result = await isLiveSynthEnabledForQuestion({ parent, topParent: parent });
		expect(result).toBe(false);
	});

	it('falls back to topParent override when the question has none', async () => {
		const parent = statement(); // no settings, no MC
		const topParent = withSettings(statement(), { liveSynthEnabled: true });
		const result = await isLiveSynthEnabledForQuestion({ parent, topParent });
		expect(result).toBe(true);
	});

	it('inherits MC-default when only topParent is MC', async () => {
		const parent = statement();
		const topParent = asMc(statement());
		const result = await isLiveSynthEnabledForQuestion({ parent, topParent });
		expect(result).toBe(true);
	});

	it('question override beats topParent override (most specific wins)', async () => {
		const parent = withSettings(statement(), { liveSynthEnabled: false });
		const topParent = withSettings(statement(), { liveSynthEnabled: true });
		const result = await isLiveSynthEnabledForQuestion({ parent, topParent });
		expect(result).toBe(false);
	});

	it('lazy-fetches topParent from Firestore when caller did not supply it', async () => {
		const parent = statement(); // topParentId='q1' which equals statementId, so lazy returns parent itself
		// Simulate parent.topParentId pointing to a different doc:
		const parentWithRemoteTop = { ...parent, topParentId: 'top-mc' };
		const getMock = jest.fn().mockResolvedValue({
			exists: true,
			data: () => asMc(statement()),
		});
		const docMock = jest.fn().mockReturnValue({ get: getMock });
		const collMock = jest.fn().mockReturnValue({ doc: docMock });
		mockGetFirestore.mockReturnValue({ collection: collMock });

		const result = await isLiveSynthEnabledForQuestion({ parent: parentWithRemoteTop });
		expect(docMock).toHaveBeenCalledWith('top-mc');
		// Lazy-fetched topParent is MC → enabled
		expect(result).toBe(true);
	});

	it('falls back to default OFF when topParent fetch fails', async () => {
		const parent = { ...statement(), topParentId: 'top-mc' };
		mockGetFirestore.mockImplementation(() => {
			throw new Error('firestore offline');
		});
		const result = await isLiveSynthEnabledForQuestion({ parent });
		expect(result).toBe(false);
	});

	it('returns false when parent is missing', async () => {
		const result = await isLiveSynthEnabledForQuestion({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			parent: undefined as any,
		});
		expect(result).toBe(false);
	});
});
