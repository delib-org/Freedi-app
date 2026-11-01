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
	isMemberlessTheme,
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

interface FakeDbHooks {
	/** Runs inside a transaction just before it reads `id` (simulates a concurrent write). */
	beforeTxGet?: (id: string, store: Map<string, Statement>) => void;
	/** Make the transaction for `id` throw. */
	failTx?: (id: string) => boolean;
}

interface FakeDb {
	db: Firestore;
	store: Map<string, Statement>;
	updates: { id: string; data: Record<string, unknown> }[];
}

/** In-memory statements collection with read-then-write transactions. */
function fakeDb(docs: Statement[], hooks: FakeDbHooks = {}): FakeDb {
	const store = new Map(docs.map((d) => [d.statementId, { ...d }]));
	const updates: FakeDb['updates'] = [];
	const collection = {
		where: (field: string, _op: string, value: string) => ({
			get: async () => ({
				docs: [...store.values()]
					.filter((d) => (d as unknown as Record<string, unknown>)[field] === value)
					.map((d) => ({ data: () => ({ ...d }) })),
			}),
		}),
		doc: (id: string) => ({ id }),
	};
	const db = {
		collection: () => collection,
		runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
			const tx = {
				get: async (ref: { id: string }) => {
					if (hooks.failTx?.(ref.id)) throw new Error(`tx failed for ${ref.id}`);
					hooks.beforeTxGet?.(ref.id, store);
					const doc = store.get(ref.id);

					return { exists: !!doc, data: () => (doc ? { ...doc } : undefined) };
				},
				update: (ref: { id: string }, data: Record<string, unknown>) => {
					updates.push({ id: ref.id, data });
					store.set(ref.id, { ...(store.get(ref.id) as Statement), ...data });
				},
			};

			return fn(tx);
		},
	} as unknown as Firestore;

	return { db, store, updates };
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

	it('isMemberlessTheme (the export rule) matches hidden and visible leftovers alike', () => {
		expect(isMemberlessTheme(theme('gone', { hide: true }))).toBe(true);
		expect(isMemberlessTheme(theme('visible'))).toBe(true);
		expect(isMemberlessTheme(theme('manual', { titleLockedByCreator: true }))).toBe(false);
		expect(isMemberlessTheme(theme('full', { integratedOptions: ['o1'] }))).toBe(false);
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
		const fake = fakeDb([
			theme('t1'),
			theme('t2'),
			theme('t-full', { integratedOptions: ['o1'] }),
			theme('t-manual', { titleLockedByCreator: true }),
			theme('t-other-q', { parentId: 'q2' }),
		]);
		jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

		const count = await hideEmptyThemes(fake.db, 'q1');

		expect(count).toBe(2);
		expect(fake.updates.map((u) => u.id)).toEqual(['t1', 't2']);
		expect(fake.updates[0].data).toEqual({
			hide: true,
			hiddenReason: EMPTY_THEME_HIDDEN_REASON,
			lastUpdate: 1_700_000_000_000,
		});
		expect(EMPTY_THEME_HIDDEN_REASON).toBe('empty-theme');
	});

	it('never writes integratedOptions, so a concurrent filing cannot be wiped', async () => {
		const fake = fakeDb([theme('t1')]);

		await hideEmptyThemes(fake.db, 'q1');

		expect(fake.updates[0].data).not.toHaveProperty('integratedOptions');
	});

	it('skips a theme that gained a member after the selection read, keeping the member', async () => {
		const fake = fakeDb([theme('t-filed'), theme('t-still-empty')], {
			// The filer adds a member between our query and our transaction.
			beforeTxGet: (id, store) => {
				if (id !== 't-filed') return;
				const current = store.get(id) as Statement;
				store.set(id, { ...current, integratedOptions: ['late-atom'] });
			},
		});

		const count = await hideEmptyThemes(fake.db, 'q1');

		expect(count).toBe(1);
		expect(fake.updates.map((u) => u.id)).toEqual(['t-still-empty']);
		expect(fake.store.get('t-filed')?.hide).toBeUndefined();
		expect(fake.store.get('t-filed')?.integratedOptions).toEqual(['late-atom']);
		expect(fake.store.get('t-still-empty')?.hide).toBe(true);
	});

	it('skips a theme someone else hid or deleted in the meantime', async () => {
		const fake = fakeDb([theme('t-hidden'), theme('t-deleted')], {
			beforeTxGet: (id, store) => {
				if (id === 't-hidden') store.set(id, { ...(store.get(id) as Statement), hide: true });
				if (id === 't-deleted') store.delete(id);
			},
		});

		await expect(hideEmptyThemes(fake.db, 'q1')).resolves.toBe(0);
		expect(fake.updates).toEqual([]);
	});

	it('logs a failing theme and still hides the others', async () => {
		const fake = fakeDb([theme('t-bad'), theme('t-good')], {
			failTx: (id) => id === 't-bad',
		});

		const count = await hideEmptyThemes(fake.db, 'q1');

		expect(count).toBe(1);
		expect(fake.store.get('t-good')?.hide).toBe(true);
		expect(logError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				operation: 'synthesis.hideEmptyThemes.hideOne',
				statementId: 't-bad',
			}),
		);
	});

	it('writes nothing when no theme is empty', async () => {
		const fake = fakeDb([theme('t', { integratedOptions: ['o'] })]);

		await expect(hideEmptyThemes(fake.db, 'q1')).resolves.toBe(0);
		expect(fake.updates).toEqual([]);
	});

	it('emptyThemeHideUpdate stamps the given time in milliseconds', () => {
		expect(emptyThemeHideUpdate(42)).toEqual({
			hide: true,
			hiddenReason: 'empty-theme',
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
