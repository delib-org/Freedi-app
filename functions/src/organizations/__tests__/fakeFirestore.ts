/**
 * Minimal in-memory Firestore stand-in for the organization function tests.
 * Supports: collection().doc()/where()/limit()/get(), doc get/set/update/
 * delete, batches and transactions. `update`/merge honour the `FieldValue.
 * increment` shape produced by jest.setup.ts (`{ _increment: n }`).
 */
export type Doc = Record<string, unknown>;

export interface FakeSnap {
	id: string;
	exists: boolean;
	ref: FakeDocRef;
	data: () => Doc | undefined;
}

export interface FakeDocRef {
	id: string;
	collection: string;
	get: () => Promise<FakeSnap>;
	set: (data: Doc, opts?: { merge?: boolean }) => Promise<void>;
	update: (data: Doc) => Promise<void>;
	delete: () => Promise<void>;
}

interface Filter {
	field: string;
	op: string;
	value: unknown;
}

export interface FakeQuery {
	where: (field: string, op: string, value: unknown) => FakeQuery;
	orderBy: (field: string, direction?: 'asc' | 'desc') => FakeQuery;
	limit: (n: number) => FakeQuery;
	get: () => Promise<{ docs: FakeSnap[]; empty: boolean; size: number }>;
}

export interface FakeCollection extends FakeQuery {
	doc: (id?: string) => FakeDocRef;
}

type BatchOp = () => void;

export interface FakeBatch {
	set: (ref: FakeDocRef, data: Doc, opts?: { merge?: boolean }) => FakeBatch;
	update: (ref: FakeDocRef, data: Doc) => FakeBatch;
	delete: (ref: FakeDocRef) => FakeBatch;
	commit: () => Promise<void>;
}

export interface FakeTx {
	get: (ref: FakeDocRef) => Promise<FakeSnap>;
	set: (ref: FakeDocRef, data: Doc, opts?: { merge?: boolean }) => void;
	update: (ref: FakeDocRef, data: Doc) => void;
	delete: (ref: FakeDocRef) => void;
}

export interface FakeDb {
	store: Map<string, Map<string, Doc>>;
	seed: (collection: string, id: string, data: Doc) => void;
	read: (collection: string, id: string) => Doc | undefined;
	reset: () => void;
	collection: (name: string) => FakeCollection;
	batch: () => FakeBatch;
	runTransaction: <T>(fn: (tx: FakeTx) => Promise<T>) => Promise<T>;
}

function isPlainObject(value: unknown): value is Doc {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Firestore merge semantics, close enough for tests: dotted keys address
 * nested fields, nested plain objects deep-merge, `{ _increment }` adds.
 */
function applyMerge(existing: Doc | undefined, patch: Doc): Doc {
	const next: Doc = { ...(existing ?? {}) };
	for (const [rawKey, value] of Object.entries(patch)) {
		const path = rawKey.split('.');
		let target = next;
		for (let i = 0; i < path.length - 1; i++) {
			const segment = path[i];
			target[segment] = isPlainObject(target[segment]) ? { ...(target[segment] as Doc) } : {};
			target = target[segment] as Doc;
		}
		const key = path[path.length - 1];
		const inc = (value as { _increment?: number } | null)?._increment;
		if (typeof inc === 'number') {
			const prev = typeof target[key] === 'number' ? (target[key] as number) : 0;
			target[key] = prev + inc;
		} else if (isPlainObject(value) && isPlainObject(target[key])) {
			target[key] = applyMerge(target[key] as Doc, value);
		} else {
			target[key] = value;
		}
	}

	return next;
}

/** Reads dotted paths (`build.completedAt`) like Firestore field paths. */
function readPath(doc: Doc, path: string): unknown {
	return path.split('.').reduce<unknown>((acc, key) => {
		if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];

		return undefined;
	}, doc);
}

function compare(a: unknown, b: unknown): number {
	if (typeof a === 'number' && typeof b === 'number') return a - b;

	return String(a).localeCompare(String(b));
}

function matches(doc: Doc, filter: Filter): boolean {
	const actual = readPath(doc, filter.field);
	switch (filter.op) {
		case '==':
			return actual === filter.value;
		case '!=':
			return actual !== filter.value;
		case 'in':
			return Array.isArray(filter.value) && filter.value.includes(actual);
		case '<':
			return actual !== undefined && compare(actual, filter.value) < 0;
		case '<=':
			return actual !== undefined && compare(actual, filter.value) <= 0;
		case '>':
			return actual !== undefined && compare(actual, filter.value) > 0;
		case '>=':
			return actual !== undefined && compare(actual, filter.value) >= 0;
		default:
			throw new Error(`fakeFirestore: unsupported operator ${filter.op}`);
	}
}

export function createFakeDb(): FakeDb {
	const store = new Map<string, Map<string, Doc>>();
	let autoId = 0;

	const col = (name: string): Map<string, Doc> => {
		let m = store.get(name);
		if (!m) {
			m = new Map();
			store.set(name, m);
		}

		return m;
	};

	const docRef = (collection: string, id: string): FakeDocRef => {
		const ref: FakeDocRef = {
			id,
			collection,
			get: async () => snapOf(collection, id),
			set: async (data, opts) => {
				const prev = col(collection).get(id);
				col(collection).set(id, opts?.merge ? applyMerge(prev, data) : { ...data });
			},
			update: async (data) => {
				const prev = col(collection).get(id);
				if (!prev) throw new Error(`fakeFirestore: update on missing ${collection}/${id}`);
				col(collection).set(id, applyMerge(prev, data));
			},
			delete: async () => {
				col(collection).delete(id);
			},
		};

		return ref;
	};

	const snapOf = (collection: string, id: string): FakeSnap => {
		const data = col(collection).get(id);

		return {
			id,
			exists: data !== undefined,
			ref: docRef(collection, id),
			data: () => (data ? { ...data } : undefined),
		};
	};

	const query = (
		collection: string,
		filters: Filter[],
		limit?: number,
		order?: { field: string; direction: 'asc' | 'desc' },
	): FakeQuery => ({
		where: (field, op, value) =>
			query(collection, [...filters, { field, op, value }], limit, order),
		orderBy: (field, direction = 'asc') => query(collection, filters, limit, { field, direction }),
		limit: (n) => query(collection, filters, n, order),
		get: async () => {
			let entries = [...col(collection).entries()].filter(([, doc]) =>
				filters.every((f) => matches(doc, f)),
			);
			if (order) {
				const sign = order.direction === 'desc' ? -1 : 1;
				entries = entries.sort(
					([, a], [, b]) => sign * compare(readPath(a, order.field), readPath(b, order.field)),
				);
			}
			let docs = entries.map(([id]) => snapOf(collection, id));
			if (limit !== undefined) docs = docs.slice(0, limit);

			return { docs, empty: docs.length === 0, size: docs.length };
		},
	});

	const collection = (name: string): FakeCollection => ({
		...query(name, []),
		doc: (id?: string) => docRef(name, id ?? `auto-${++autoId}`),
	});

	const batch = (): FakeBatch => {
		const ops: BatchOp[] = [];
		const b: FakeBatch = {
			set: (ref, data, opts) => {
				ops.push(() => void ref.set(data, opts));

				return b;
			},
			update: (ref, data) => {
				ops.push(() => void ref.update(data));

				return b;
			},
			delete: (ref) => {
				ops.push(() => void ref.delete());

				return b;
			},
			commit: async () => {
				ops.forEach((op) => op());
			},
		};

		return b;
	};

	const runTransaction = async <T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> =>
		fn({
			get: (ref) => ref.get(),
			set: (ref, data, opts) => void ref.set(data, opts),
			update: (ref, data) => void ref.update(data),
			delete: (ref) => void ref.delete(),
		});

	return {
		store,
		seed: (c, id, data) => void col(c).set(id, { ...data }),
		read: (c, id) => col(c).get(id),
		reset: () => store.clear(),
		collection,
		batch,
		runTransaction,
	};
}
