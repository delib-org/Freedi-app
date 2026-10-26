/**
 * Small in-memory stand-in for `firebase-admin/firestore`, shared by the
 * cluster-vote tests (aggregation, joins, reconcile, backfill).
 *
 * Supports: doc get/set/update/delete, getAll, batch (set/update/delete),
 * `FieldValue.arrayUnion`, and queries with where('==' | 'in' |
 * 'array-contains' | '>' | '>=' | '<' | '<='), orderBy, startAfter, limit.
 *
 * Usage:
 *   jest.mock('firebase-admin/firestore', () =>
 *     jest.requireActual('<path>/helpers/memoryFirestore').firestoreModule);
 */

type DocData = Record<string, unknown>;

const store = new Map<string, Map<string, DocData>>();

interface ArrayUnion {
	__arrayUnion: unknown[];
}

function isArrayUnion(value: unknown): value is ArrayUnion {
	return typeof value === 'object' && value !== null && '__arrayUnion' in value;
}

function col(name: string): Map<string, DocData> {
	let found = store.get(name);
	if (!found) {
		found = new Map();
		store.set(name, found);
	}

	return found;
}

export function resetStore(): void {
	store.clear();
}

export function seedDoc(collection: string, id: string, data: DocData): void {
	col(collection).set(id, structuredClone(data));
}

export function peekDoc(collection: string, id: string): DocData | undefined {
	return col(collection).get(id);
}

export function listDocs(collection: string): Array<{ id: string; data: DocData }> {
	return [...col(collection).entries()].map(([id, data]) => ({ id, data }));
}

function applyPatch(base: DocData, patch: DocData): DocData {
	const next = { ...base };
	for (const [key, value] of Object.entries(patch)) {
		if (isArrayUnion(value)) {
			const existing = Array.isArray(next[key]) ? (next[key] as unknown[]) : [];
			next[key] = [...new Set([...existing, ...value.__arrayUnion])];
		} else {
			next[key] = value;
		}
	}

	return next;
}

function snapshotOf(collection: string, id: string, data: DocData | undefined) {
	return {
		id,
		exists: data !== undefined,
		ref: new MemoryDocRef(collection, id),
		data: () => (data === undefined ? undefined : structuredClone(data)),
	};
}

export class MemoryDocRef {
	constructor(
		readonly collection: string,
		readonly id: string,
	) {}

	async get() {
		return snapshotOf(this.collection, this.id, col(this.collection).get(this.id));
	}

	async set(data: DocData, options?: { merge?: boolean }) {
		const existing = col(this.collection).get(this.id);
		col(this.collection).set(this.id, applyPatch(options?.merge && existing ? existing : {}, data));
	}

	async update(data: DocData) {
		const existing = col(this.collection).get(this.id);
		if (!existing) throw new Error(`NOT_FOUND ${this.collection}/${this.id}`);
		col(this.collection).set(this.id, applyPatch(existing, data));
	}

	async delete() {
		col(this.collection).delete(this.id);
	}
}

type Filter = (data: DocData) => boolean;

interface QueryState {
	filters: Filter[];
	order: string | null;
	after: unknown;
	max: number | null;
}

function compare(a: unknown, b: unknown): number {
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	const left = String(a ?? '');
	const right = String(b ?? '');

	return left < right ? -1 : left > right ? 1 : 0;
}

function buildFilter(field: string, op: string, value: unknown): Filter {
	switch (op) {
		case 'in':
			return (d) => (value as unknown[]).includes(d[field]);
		case 'array-contains':
			return (d) => Array.isArray(d[field]) && (d[field] as unknown[]).includes(value);
		case '>':
			return (d) => d[field] !== undefined && compare(d[field], value) > 0;
		case '>=':
			return (d) => d[field] !== undefined && compare(d[field], value) >= 0;
		case '<':
			return (d) => d[field] !== undefined && compare(d[field], value) < 0;
		case '<=':
			return (d) => d[field] !== undefined && compare(d[field], value) <= 0;
		default:
			return (d) => d[field] === value;
	}
}

class MemoryQuery {
	constructor(
		readonly collection: string,
		private readonly state: QueryState = { filters: [], order: null, after: undefined, max: null },
	) {}

	private next(patch: Partial<QueryState>): MemoryQuery {
		return new MemoryQuery(this.collection, { ...this.state, ...patch });
	}

	where(field: string, op: string, value: unknown): MemoryQuery {
		return this.next({ filters: [...this.state.filters, buildFilter(field, op, value)] });
	}

	orderBy(field: string): MemoryQuery {
		return this.next({ order: field });
	}

	startAfter(value: unknown): MemoryQuery {
		const cursor =
			typeof value === 'object' && value !== null && 'id' in value
				? (value as { id: string }).id
				: value;

		return this.next({ after: cursor });
	}

	limit(max: number): MemoryQuery {
		return this.next({ max });
	}

	async get() {
		let rows = [...col(this.collection).entries()].filter(([, data]) =>
			this.state.filters.every((test) => test(data)),
		);
		const { order, after, max } = this.state;
		if (order) {
			const keyOf = ([id, data]: [string, DocData]): unknown =>
				order === '__name__' ? id : data[order];
			rows = rows.sort((a, b) => compare(keyOf(a), keyOf(b)));
			if (after !== undefined) rows = rows.filter((row) => compare(keyOf(row), after) > 0);
		}
		if (max !== null) rows = rows.slice(0, max);
		const docs = rows.map(([id, data]) => snapshotOf(this.collection, id, data));

		return { docs, empty: docs.length === 0, size: docs.length };
	}
}

class MemoryCollection extends MemoryQuery {
	doc(id: string): MemoryDocRef {
		return new MemoryDocRef(this.collection, id);
	}
}

const memoryDb = {
	collection: (name: string) => new MemoryCollection(name),
	getAll: async (...refs: MemoryDocRef[]) => Promise.all(refs.map((ref) => ref.get())),
	batch: () => {
		const ops: Array<() => Promise<void>> = [];

		return {
			set: (ref: MemoryDocRef, data: DocData, options?: { merge?: boolean }) => {
				ops.push(() => ref.set(data, options));
			},
			update: (ref: MemoryDocRef, data: DocData) => {
				ops.push(() => ref.update(data));
			},
			delete: (ref: MemoryDocRef) => {
				ops.push(() => ref.delete());
			},
			commit: async () => {
				for (const op of ops) await op();
			},
		};
	},
};

export const firestoreModule = {
	getFirestore: () => memoryDb,
	FieldValue: {
		arrayUnion: (...values: unknown[]): ArrayUnion => ({ __arrayUnion: values }),
	},
};

/** Cast for APIs that take an injected Firestore (backfill, reconcile). */
export const memoryFirestore = memoryDb;
