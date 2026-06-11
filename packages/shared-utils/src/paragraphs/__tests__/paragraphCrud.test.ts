import { StatementType, ParagraphType } from '@freedi/shared-types';
import type { Statement, User } from '@freedi/shared-types';
import {
	addParagraphChild,
	deleteParagraphChild,
	moveParagraphChild,
	replaceAllParagraphChildren,
	reorderParagraphChildren,
	sortParagraphChildren,
	updateParagraphChild,
} from '../paragraphCrud';
import type { ParagraphBatch, ParagraphDeps, ParagraphStore } from '../types';

const creator: User = {
	uid: 'user-1',
	displayName: 'Tester',
	email: '',
	photoURL: '',
	isAnonymous: false,
};

const host: Pick<Statement, 'statementId' | 'topParentId'> = {
	statementId: 'host-1',
	topParentId: 'host-1',
};

/** Minimal in-memory ParagraphStore for tests. */
class FakeStore implements ParagraphStore {
	docs = new Map<string, Statement>();
	private clock = 1000;

	seed(paragraphs: Statement[]): void {
		for (const p of paragraphs) this.docs.set(p.statementId, p);
	}

	async getParagraphChildren(hostId: string): Promise<Statement[]> {
		return [...this.docs.values()].filter(
			(d) =>
				d.parentId === hostId &&
				d.statementType === StatementType.paragraph &&
				d.hide !== true,
		);
	}

	batch(): ParagraphBatch {
		const ops: Array<() => void> = [];

		return {
			set: (statement) => ops.push(() => this.docs.set(statement.statementId, statement)),
			update: (id, patch) =>
				ops.push(() => {
					const existing = this.docs.get(id);
					if (existing) this.docs.set(id, applyPatch(existing, patch));
				}),
			delete: (id) => ops.push(() => this.docs.delete(id)),
			commit: async () => {
				ops.forEach((op) => op());
			},
		};
	}

	async update(id: string, patch: Record<string, unknown>): Promise<void> {
		const existing = this.docs.get(id);
		if (existing) this.docs.set(id, applyPatch(existing, patch));
	}

	async delete(id: string): Promise<void> {
		this.docs.delete(id);
	}

	now(): number {
		return ++this.clock;
	}
}

/** Apply a Firestore-style patch (supports dot-path keys) to a clone. */
function applyPatch(doc: Statement, patch: Record<string, unknown>): Statement {
	const next = JSON.parse(JSON.stringify(doc)) as Statement & Record<string, unknown>;
	for (const [key, value] of Object.entries(patch)) {
		if (key.includes('.')) {
			const [head, tail] = key.split('.');
			const obj = ((next as Record<string, unknown>)[head] ?? {}) as Record<string, unknown>;
			obj[tail] = value;
			(next as Record<string, unknown>)[head] = obj;
		} else {
			(next as Record<string, unknown>)[key] = value;
		}
	}

	return next as Statement;
}

function makeDeps(store: FakeStore): ParagraphDeps {
	return {
		store,
		creator: () => creator,
		logError: jest.fn(),
	};
}

describe('shared paragraph CRUD', () => {
	describe('sortParagraphChildren', () => {
		it('sorts by order, falling back to doc.order then createdAt', () => {
			const items = [
				{ statementId: 'c', createdAt: 5 },
				{ statementId: 'a', order: 0 },
				{ statementId: 'b', doc: { order: 1 } },
			] as unknown as Statement[];

			expect(sortParagraphChildren(items).map((p) => p.statementId)).toEqual(['a', 'b', 'c']);
		});
	});

	describe('addParagraphChild', () => {
		it('appends with the next order', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);

			const id1 = await addParagraphChild(deps, { host, content: 'first', currentParagraphs: [] });
			const current = await store.getParagraphChildren('host-1');
			const id2 = await addParagraphChild(deps, {
				host,
				content: 'second',
				currentParagraphs: current,
			});

			const all = sortParagraphChildren(await store.getParagraphChildren('host-1'));
			expect(all.map((p) => p.statement)).toEqual(['first', 'second']);
			expect(all.map((p) => p.order)).toEqual([0, 1]);
			expect(all.map((p) => p.statementType)).toEqual([
				StatementType.paragraph,
				StatementType.paragraph,
			]);
			expect(id1).toBeDefined();
			expect(id2).toBeDefined();
		});

		it('inserts after a given order and shifts siblings', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);
			await addParagraphChild(deps, { host, content: 'p0', currentParagraphs: [] });
			let current = await store.getParagraphChildren('host-1');
			await addParagraphChild(deps, { host, content: 'p1', currentParagraphs: current });
			current = await store.getParagraphChildren('host-1');

			await addParagraphChild(deps, {
				host,
				content: 'inserted',
				insertAfterOrder: 0,
				currentParagraphs: current,
			});

			const all = sortParagraphChildren(await store.getParagraphChildren('host-1'));
			expect(all.map((p) => p.statement)).toEqual(['p0', 'inserted', 'p1']);
			expect(all.map((p) => p.order)).toEqual([0, 1, 2]);
		});

		it('writes doc metadata only for official/rich paragraphs', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);

			await addParagraphChild(deps, { host, content: 'plain', currentParagraphs: [] });
			await addParagraphChild(deps, {
				host,
				content: 'official',
				isOfficial: true,
				blockType: ParagraphType.h2,
				currentParagraphs: await store.getParagraphChildren('host-1'),
			});

			const all = sortParagraphChildren(await store.getParagraphChildren('host-1'));
			expect(all[0].doc).toBeUndefined();
			expect(all[1].doc?.isOfficialParagraph).toBe(true);
			expect(all[1].doc?.paragraphType).toBe(ParagraphType.h2);
			expect(all[1].blockType).toBe(ParagraphType.h2);
		});
	});

	describe('updateParagraphChild', () => {
		it('patches only provided fields', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);
			const id = await addParagraphChild(deps, { host, content: 'old', currentParagraphs: [] });

			const ok = await updateParagraphChild(deps, {
				paragraphId: id!,
				content: 'new',
				blockType: ParagraphType.h3,
			});

			expect(ok).toBe(true);
			const doc = store.docs.get(id!)!;
			expect(doc.statement).toBe('new');
			expect(doc.blockType).toBe(ParagraphType.h3);
		});
	});

	describe('deleteParagraphChild', () => {
		it('hard-deletes by default and soft-hides with soft:true', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);
			const hardId = await addParagraphChild(deps, { host, content: 'hard', currentParagraphs: [] });
			const softId = await addParagraphChild(deps, {
				host,
				content: 'soft',
				currentParagraphs: await store.getParagraphChildren('host-1'),
			});

			await deleteParagraphChild(deps, hardId!);
			await deleteParagraphChild(deps, softId!, { soft: true });

			expect(store.docs.has(hardId!)).toBe(false);
			expect(store.docs.get(softId!)?.hide).toBe(true);
			expect(await store.getParagraphChildren('host-1')).toHaveLength(0);
		});
	});

	describe('moveParagraphChild', () => {
		it('swaps order with the neighbor', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);
			await addParagraphChild(deps, { host, content: 'a', currentParagraphs: [] });
			await addParagraphChild(deps, {
				host,
				content: 'b',
				currentParagraphs: await store.getParagraphChildren('host-1'),
			});

			const current = sortParagraphChildren(await store.getParagraphChildren('host-1'));
			await moveParagraphChild(deps, current[1].statementId, 'up', current);

			const after = sortParagraphChildren(await store.getParagraphChildren('host-1'));
			expect(after.map((p) => p.statement)).toEqual(['b', 'a']);
		});

		it('is a no-op at the boundary', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);
			await addParagraphChild(deps, { host, content: 'a', currentParagraphs: [] });
			const current = sortParagraphChildren(await store.getParagraphChildren('host-1'));

			expect(await moveParagraphChild(deps, current[0].statementId, 'up', current)).toBe(false);
		});
	});

	describe('reorderParagraphChildren', () => {
		it('sets explicit order values', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);
			const a = await addParagraphChild(deps, { host, content: 'a', currentParagraphs: [] });
			const b = await addParagraphChild(deps, {
				host,
				content: 'b',
				currentParagraphs: await store.getParagraphChildren('host-1'),
			});

			await reorderParagraphChildren(deps, [
				{ statementId: a!, order: 10 },
				{ statementId: b!, order: 5 },
			]);

			const after = sortParagraphChildren(await store.getParagraphChildren('host-1'));
			expect(after.map((p) => p.statement)).toEqual(['b', 'a']);
		});
	});

	describe('replaceAllParagraphChildren', () => {
		it('deletes existing children and recreates from lines', async () => {
			const store = new FakeStore();
			const deps = makeDeps(store);
			await addParagraphChild(deps, { host, content: 'old1', currentParagraphs: [] });
			await addParagraphChild(deps, {
				host,
				content: 'old2',
				currentParagraphs: await store.getParagraphChildren('host-1'),
			});

			const ids = await replaceAllParagraphChildren(deps, {
				host,
				lines: [{ content: 'new1' }, { content: 'new2', blockType: ParagraphType.h1 }],
			});

			const all = sortParagraphChildren(await store.getParagraphChildren('host-1'));
			expect(all.map((p) => p.statement)).toEqual(['new1', 'new2']);
			expect(all.map((p) => p.order)).toEqual([0, 1]);
			expect(all[1].blockType).toBe(ParagraphType.h1);
			expect(ids).toHaveLength(2);
		});
	});
});
