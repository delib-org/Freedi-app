import { describe, it, expect, jest } from '@jest/globals';

type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();

/** A tiny in-memory Firestore: just what mergeTags touches */
const applyIncrements = (current: Doc, patch: Doc): Doc => {
	const next: Doc = { ...current };
	for (const [key, value] of Object.entries(patch)) {
		const inc = (value as { __inc?: number } | null)?.__inc;
		const dotted = key.split('.');
		if (inc !== undefined) {
			next[key] = ((current[key] as number) ?? 0) + inc;
		} else if (dotted.length === 2) {
			const [head, tail] = dotted;
			next[head] = { ...((next[head] as Doc) ?? {}), [tail]: value };
		} else {
			next[key] = value;
		}
	}

	return next;
};

const ref = (path: string) => ({
	path,
	get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
	update: async (patch: Doc) => {
		store.set(path, applyIncrements(store.get(path) ?? {}, patch));
	},
});

jest.mock('firebase-admin/firestore', () => ({
	FieldValue: { increment: (n: number) => ({ __inc: n }), delete: () => undefined },
}));
jest.mock('../../db', () => ({
	db: {
		collection: (name: string) => ({
			doc: (id: string) => ref(`${name}/${id}`),
			where: (field: string, _op: string, value: string) => ({
				limit: (max: number) => ({
					get: async () => {
						const docs = [...store.entries()]
							.filter(([path, data]) => {
								if (!path.startsWith(`${name}/`)) return false;
								const [head, tail] = field.split('.');
								const list =
									((data[head] as Doc | undefined)?.[tail] as string[] | undefined) ?? [];

								return list.includes(value);
							})
							.slice(0, max)
							.map(([path, data]) => ({ ref: ref(path), data: () => data }));

						return { empty: docs.length === 0, size: docs.length, docs };
					},
				}),
			}),
		}),
		batch: () => {
			const pending: Array<() => Promise<void>> = [];

			return {
				update: (target: { update: (patch: Doc) => Promise<void> }, patch: Doc) => {
					pending.push(() => target.update(patch));
				},
				commit: async () => {
					for (const run of pending) await run();
				},
			};
		},
	},
}));

import { mergeTags } from '../libraryTags';

const tag = (id: string, extra: Doc = {}): Doc => ({
	tagId: id,
	kind: 'subject',
	scenarioCount: 0,
	teacherIds: [],
	...extra,
});
const scenario = (
	subjectIds: string[],
	extra: { visibility?: string; hidden?: boolean; authorId?: string } = {},
): Doc => ({
	visibility: extra.visibility ?? 'public',
	library: {
		subjectIds,
		lessonTypeIds: [],
		hidden: extra.hidden ?? false,
		authorId: extra.authorId ?? 'a',
	},
});

function seed(): void {
	store.clear();
	store.set('agoraLibraryTags/dup', tag('dup', { scenarioCount: 3 }));
	store.set('agoraLibraryTags/canon', tag('canon', { scenarioCount: 1, teacherIds: ['t0'] }));
	store.set('agoraLibraryTags/other', tag('other', { kind: 'lessonType' }));
	store.set('agoraTopicPackages/listed', scenario(['dup'], { authorId: 'a1' }));
	store.set('agoraTopicPackages/both', scenario(['dup', 'canon'], { authorId: 'a2' }));
	store.set('agoraTopicPackages/hidden', scenario(['dup'], { hidden: true }));
	store.set('agoraTopicPackages/private', scenario(['dup'], { visibility: 'private' }));
	store.set('agoraTopicPackages/untouched', scenario(['canon']));
}

const ids = (path: string): string[] =>
	((store.get(path)?.library as Doc).subjectIds as string[]).slice();

describe('mergeTags', () => {
	it('re-points every scenario, keeps one of two, and leaves an alias pointer', async () => {
		seed();
		const moved = await mergeTags('dup', 'canon');
		expect(moved).toBe(4);
		expect(ids('agoraTopicPackages/listed')).toEqual(['canon']);
		expect(ids('agoraTopicPackages/both')).toEqual(['canon']);
		expect(ids('agoraTopicPackages/hidden')).toEqual(['canon']);
		expect(ids('agoraTopicPackages/private')).toEqual(['canon']);
		expect(ids('agoraTopicPackages/untouched')).toEqual(['canon']);
		expect(store.get('agoraLibraryTags/dup')?.aliasOf).toBe('canon');
	});

	it('moves counters only for scenarios the library lists', async () => {
		seed();
		await mergeTags('dup', 'canon');
		// listed + both are counted on dup (hidden and private never were): 3 - 2 = 1 left over
		expect(store.get('agoraLibraryTags/dup')?.scenarioCount).toBe(1);
		// only "listed" gains canon; "both" already carried it: 1 + 1
		expect(store.get('agoraLibraryTags/canon')?.scenarioCount).toBe(2);
		expect(store.get('agoraLibraryTags/canon')?.teacherIds).toEqual(
			expect.arrayContaining(['t0', 'a1', 'a2']),
		);
	});

	it('can be run again after an interruption without double counting', async () => {
		seed();
		await mergeTags('dup', 'canon');
		const before = store.get('agoraLibraryTags/canon')?.scenarioCount;
		expect(await mergeTags('dup', 'canon')).toBe(0);
		expect(store.get('agoraLibraryTags/canon')?.scenarioCount).toBe(before);
	});

	it('refuses nonsense merges', async () => {
		seed();
		await expect(mergeTags('dup', 'dup')).rejects.toThrow(/itself/);
		await expect(mergeTags('dup', 'nope')).rejects.toThrow(/not found/i);
		await expect(mergeTags('dup', 'other')).rejects.toThrow(/same kind/);
		store.set('agoraLibraryTags/canon', tag('canon', { aliasOf: 'x' }));
		await expect(mergeTags('dup', 'canon')).rejects.toThrow(/merged away/);
		seed();
		store.set('agoraLibraryTags/dup', tag('dup', { aliasOf: 'someone' }));
		await expect(mergeTags('dup', 'canon')).rejects.toThrow(/already merged/);
	});
});
