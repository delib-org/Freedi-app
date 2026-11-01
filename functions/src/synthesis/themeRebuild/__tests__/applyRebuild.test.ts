import type { Statement } from '@freedi/shared-types';

/**
 * The write half of the rebuild: reused docs keep their id and absorb the
 * hidden themes' ids, hidden themes point at their merge target and drop their
 * members, a theme hidden since the preview gets a fresh doc, and the live
 * sweeps' judge-once state is cleared.
 */

const statementDocs = new Map<string, Record<string, unknown>>();
const deleted: string[] = [];

jest.mock('firebase-admin/firestore', () => {
	const docRef = (collection: string, id: string) => ({
		id,
		collection,
		delete: jest.fn(async () => {
			deleted.push(`${collection}/${id}`);
		}),
	});
	const apply = (id: string, data: Record<string, unknown>, merge: boolean): void => {
		statementDocs.set(id, merge ? { ...(statementDocs.get(id) ?? {}), ...data } : data);
	};

	return {
		getFirestore: jest.fn(() => ({
			collection: (name: string) => ({ doc: (id: string) => docRef(name, id) }),
			runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
				fn({
					get: async (ref: { id: string }) => ({
						exists: statementDocs.has(ref.id),
						data: () => statementDocs.get(ref.id),
					}),
					update: (ref: { id: string }, data: Record<string, unknown>) => apply(ref.id, data, true),
					set: (ref: { id: string }, data: Record<string, unknown>) => apply(ref.id, data, false),
				}),
			batch: () => {
				const ops: Array<() => void> = [];

				return {
					update: (ref: { id: string }, data: Record<string, unknown>) =>
						ops.push(() => apply(ref.id, data, true)),
					commit: async () => ops.forEach((op) => op()),
				};
			},
		})),
	};
});

jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const recordLiveSynthEvent = jest.fn();
jest.mock('../../liveSynth/auditLog', () => ({
	recordLiveSynthEvent: (...args: unknown[]) => recordLiveSynthEvent(...args),
}));
const enqueueClusterRecompute = jest.fn();
jest.mock('../../liveSynth/clusterRecompute', () => ({
	enqueueClusterRecompute: (...args: unknown[]) => enqueueClusterRecompute(...args),
}));

import { applyRebuild } from '../applyRebuild';
import type { MatchResult } from '../types';

const QUESTION = {
	statementId: 'q1',
	statement: 'How?',
	parents: ['root'],
	topParentId: 'root',
	creatorId: 'u0',
	creator: { uid: 'u0', displayName: 'Q' },
} as unknown as Statement;

const themeDoc = (id: string, members: string[], extra: Record<string, unknown> = {}) => ({
	statementId: id,
	parentId: 'q1',
	statement: `old ${id}`,
	isCluster: true,
	derivedByPipeline: 'topic-cluster',
	integratedOptions: members,
	hide: false,
	...extra,
});

function seed(...docs: Array<Record<string, unknown>>): Statement[] {
	statementDocs.clear();
	for (const d of docs) statementDocs.set(d.statementId as string, d);

	return docs as unknown as Statement[];
}

beforeEach(() => {
	jest.clearAllMocks();
	deleted.length = 0;
});

describe('applyRebuild', () => {
	it('rewrites the reused doc, absorbs the hidden one and hides it with mergedInto', async () => {
		const live = seed(
			themeDoc('old1', ['a', 'b', 'c'], { absorbedClusterIds: ['ancient'] }),
			themeDoc('old2', ['d', 'e'], { absorbedClusterIds: ['older'] }),
		);
		const match: MatchResult = {
			themes: [
				{
					key: 't1',
					name: 'Funding',
					rule: 'money',
					memberIds: ['a', 'b', 'c', 'd'],
					reusesThemeId: 'old1',
				},
			],
			hidden: [{ themeId: 'old2', mergedIntoKey: 't1' }],
		};

		const counts = await applyRebuild({
			question: QUESTION,
			runId: 'run1',
			match,
			liveThemes: live,
		});

		expect(counts).toEqual({ themesWritten: 1, themesHidden: 1, atomsPlaced: 4 });
		expect(statementDocs.get('old1')).toEqual(
			expect.objectContaining({
				statement: 'Funding',
				integratedOptions: ['a', 'b', 'c', 'd'],
				themeRule: 'money',
				themeSource: 'llm-rebuild',
				themeRebuildRunId: 'run1',
				derivedByPipeline: 'topic-cluster',
				isCluster: true,
				hide: false,
			}),
		);
		expect((statementDocs.get('old1')?.absorbedClusterIds as string[]).sort()).toEqual(
			['ancient', 'old2', 'older'].sort(),
		);
		expect(statementDocs.get('old2')).toEqual(
			expect.objectContaining({ hide: true, mergedInto: 'old1', integratedOptions: [] }),
		);
		expect(enqueueClusterRecompute).toHaveBeenCalledWith('old1', 'rebuildThemes');
	});

	it('creates a fresh live-shaped doc for a new theme', async () => {
		const live = seed(themeDoc('old1', ['z']));
		const match: MatchResult = {
			themes: [{ key: 't1', name: 'Schools', rule: 'education', memberIds: ['a'] }],
			hidden: [{ themeId: 'old1' }],
		};

		await applyRebuild({ question: QUESTION, runId: 'run1', match, liveThemes: live });

		const created = [...statementDocs.values()].find((d) => d.statement === 'Schools');
		expect(created).toEqual(
			expect.objectContaining({
				parentId: 'q1',
				parents: ['root', 'q1'],
				topParentId: 'root',
				statementType: 'option',
				isCluster: true,
				derivedByPipeline: 'topic-cluster',
				integratedOptions: ['a'],
				themeSource: 'llm-rebuild',
				hide: false,
			}),
		);
		expect(created?.absorbedClusterIds).toBeUndefined();
		// No overlap → hidden without a merge target.
		expect(statementDocs.get('old1')).toEqual(expect.objectContaining({ hide: true }));
		expect(statementDocs.get('old1')?.mergedInto).toBeUndefined();
	});

	it('a reused doc hidden since the preview is not resurrected; a new doc is made', async () => {
		const live = seed(themeDoc('old1', ['a'], { hide: true }));
		const match: MatchResult = {
			themes: [{ key: 't1', name: 'N', rule: 'r', memberIds: ['a'], reusesThemeId: 'old1' }],
			hidden: [],
		};

		await applyRebuild({ question: QUESTION, runId: 'run1', match, liveThemes: live });

		expect(statementDocs.get('old1')?.hide).toBe(true);
		expect([...statementDocs.values()].filter((d) => d.statement === 'N')).toHaveLength(1);
	});

	it('every atom ends in exactly one visible theme', async () => {
		const live = seed(themeDoc('old1', ['a', 'b']), themeDoc('old2', ['b', 'c']));
		const match: MatchResult = {
			themes: [
				{ key: 't1', name: 'X', rule: 'r', memberIds: ['a', 'b'], reusesThemeId: 'old1' },
				{ key: 't2', name: 'Y', rule: 'r', memberIds: ['c'] },
			],
			hidden: [{ themeId: 'old2', mergedIntoKey: 't1' }],
		};

		await applyRebuild({ question: QUESTION, runId: 'run1', match, liveThemes: live });

		const visible = [...statementDocs.values()].filter((d) => d.hide !== true);
		const owned = visible.flatMap((d) => d.integratedOptions as string[]);
		expect(owned.sort()).toEqual(['a', 'b', 'c']);
	});

	it('resets the judge-once state of the live theme sweeps', async () => {
		const live = seed(themeDoc('old1', ['a']));

		await applyRebuild({
			question: QUESTION,
			runId: 'run1',
			match: {
				themes: [{ key: 't1', name: 'N', rule: 'r', memberIds: ['a'], reusesThemeId: 'old1' }],
				hidden: [],
			},
			liveThemes: live,
		});

		expect(deleted.sort()).toEqual([
			'_liveSynthThemeFile/q1',
			'_liveSynthThemeSplit/q1',
			'_liveSynthThemeSweep/q1',
		]);
		expect(recordLiveSynthEvent).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'theme-rebuild', clusterId: 'old1' }),
		);
	});
});
