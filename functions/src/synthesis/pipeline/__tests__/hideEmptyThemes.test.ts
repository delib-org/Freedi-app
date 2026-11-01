import type { Firestore } from 'firebase-admin/firestore';
import type { Statement } from '@freedi/shared-types';

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const logError = jest.fn();
jest.mock('../../../utils/errorHandling', () => ({
	logError: (...a: unknown[]) => logError(...a),
}));

import {
	EMPTY_THEME_HIDDEN_REASON,
	emptyThemeHideUpdate,
	hideEmptyThemes,
	hideEmptyThemesSafely,
	isEmptyTheme,
	selectEmptyThemes,
} from '../hideEmptyThemes';

function stmt(id: string, fields: Partial<Statement> = {}): Statement {
	return { statementId: id, parentId: 'q1', statement: id, ...fields } as Statement;
}

const theme = (id: string, fields: Partial<Statement> = {}): Statement =>
	stmt(id, {
		isCluster: true,
		derivedByPipeline: 'topic-cluster',
		integratedOptions: [],
		...fields,
	});

interface Recorded {
	updates: { id: string; data: Record<string, unknown> }[];
	commits: number;
}

function fakeDb(docs: Statement[], recorded: Recorded): Firestore {
	const collection = {
		where: (field: string, _op: string, value: string) => ({
			get: async () => ({
				docs: docs
					.filter((d) => (d as unknown as Record<string, unknown>)[field] === value)
					.map((d) => ({ data: () => d })),
			}),
		}),
		doc: (id: string) => ({ id }),
	};

	return {
		collection: () => collection,
		batch: () => ({
			update: (ref: { id: string }, data: Record<string, unknown>) => {
				recorded.updates.push({ id: ref.id, data });
			},
			commit: async () => {
				recorded.commits++;
			},
		}),
	} as unknown as Firestore;
}

beforeEach(() => {
	jest.clearAllMocks();
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe('selectEmptyThemes', () => {
	it('selects a visible pipeline theme with no members (the leftover)', () => {
		const leftover = theme('t-empty');
		const noField = theme('t-undefined', { integratedOptions: undefined });

		expect(selectEmptyThemes([leftover, noField])).toEqual([leftover, noField]);
	});

	it('keeps an empty manual board cluster (titleLockedByCreator) visible', () => {
		expect(isEmptyTheme(theme('manual', { titleLockedByCreator: true }))).toBe(false);
	});

	it('ignores themes that are already hidden', () => {
		expect(isEmptyTheme(theme('gone', { hide: true }))).toBe(false);
	});

	it('ignores syntheses, themes with members, and plain options', () => {
		const statements = [
			theme('synth', { derivedByPipeline: 'synthesis' }),
			theme('full', { integratedOptions: ['o1'] }),
			stmt('plain'),
			stmt('untagged-cluster', { isCluster: true, integratedOptions: [] }),
		];

		expect(selectEmptyThemes(statements)).toEqual([]);
	});
});

describe('hideEmptyThemes', () => {
	it('hides only the leftovers with the flag payload and returns the count', async () => {
		const recorded: Recorded = { updates: [], commits: 0 };
		const docs = [
			theme('t1'),
			theme('t2'),
			theme('t-full', { integratedOptions: ['o1'] }),
			theme('t-manual', { titleLockedByCreator: true }),
			theme('t-other-q', { parentId: 'q2' }),
		];
		jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

		const count = await hideEmptyThemes(fakeDb(docs, recorded), 'q1');

		expect(count).toBe(2);
		expect(recorded.commits).toBe(1);
		expect(recorded.updates.map((u) => u.id)).toEqual(['t1', 't2']);
		expect(recorded.updates[0].data).toEqual({
			hide: true,
			hiddenReason: EMPTY_THEME_HIDDEN_REASON,
			integratedOptions: [],
			lastUpdate: 1_700_000_000_000,
		});
		expect(EMPTY_THEME_HIDDEN_REASON).toBe('empty-theme');
	});

	it('writes nothing when no theme is empty', async () => {
		const recorded: Recorded = { updates: [], commits: 0 };

		const count = await hideEmptyThemes(
			fakeDb([theme('t', { integratedOptions: ['o'] })], recorded),
			'q1',
		);

		expect(count).toBe(0);
		expect(recorded.commits).toBe(0);
	});

	it('splits more than 500 hides into several batches', async () => {
		const recorded: Recorded = { updates: [], commits: 0 };
		const docs = Array.from({ length: 501 }, (_, i) => theme(`t${i}`));

		const count = await hideEmptyThemes(fakeDb(docs, recorded), 'q1');

		expect(count).toBe(501);
		expect(recorded.commits).toBe(2);
	});

	it('emptyThemeHideUpdate stamps the given time in milliseconds', () => {
		expect(emptyThemeHideUpdate(42)).toEqual({
			hide: true,
			hiddenReason: 'empty-theme',
			integratedOptions: [],
			lastUpdate: 42,
		});
	});
});

describe('hideEmptyThemesSafely', () => {
	it('logs a failure with context and reports zero instead of throwing', async () => {
		const failing = {
			collection: () => ({
				where: () => ({
					get: async () => {
						throw new Error('firestore down');
					},
				}),
			}),
		} as unknown as Firestore;

		await expect(hideEmptyThemesSafely(failing, 'q1', 'test.op')).resolves.toBe(0);
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({ operation: 'test.op', statementId: 'q1' }),
		);
	});
});
