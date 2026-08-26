/**
 * Minimal in-memory Firestore stand-in for the progress / nudge /
 * subscription tests. Supports the subset the code under test uses:
 * doc get/set/create/update, equality `where` queries with id ordering +
 * limit/startAfter, `getAll`, batches and transactions.
 *
 * `{ _increment: n }` values (the jest.setup FieldValue mock) are applied as
 * numeric increments so counter assertions read naturally.
 */

type Doc = Record<string, unknown>;
type Store = Map<string, Map<string, Doc>>;

interface Snap {
	id: string;
	exists: boolean;
	data: () => Doc | undefined;
}

interface Ref {
	id: string;
	collection: string;
	get: () => Promise<Snap>;
	set: (data: Doc, opts?: { merge?: boolean }) => Promise<void>;
	create: (data: Doc) => Promise<void>;
	update: (data: Doc) => Promise<void>;
}

interface Query {
	where: (field: string, op: string, value: unknown) => Query;
	orderBy: () => Query;
	select: () => Query;
	limit: (n: number) => Query;
	startAfter: (cursor: Snap) => Query;
	get: () => Promise<{ empty: boolean; size: number; docs: Snap[] }>;
}

function isIncrement(value: unknown): value is { _increment: number } {
	return typeof value === 'object' && value !== null && '_increment' in value;
}

function applyMerge(existing: Doc | undefined, incoming: Doc, merge: boolean): Doc {
	const base: Doc = merge && existing ? { ...existing } : {};
	for (const [key, value] of Object.entries(incoming)) {
		if (isIncrement(value)) {
			const current = typeof base[key] === 'number' ? (base[key] as number) : 0;
			base[key] = current + value._increment;
		} else {
			base[key] = value;
		}
	}

	return base;
}

export interface FakeDb {
	store: Store;
	seed: (collection: string, id: string, data: Doc) => void;
	read: (collection: string, id: string) => Doc | undefined;
	createCalls: Array<{ collection: string; id: string }>;
	db: {
		collection: (name: string) => { doc: (id: string) => Ref; where: Query['where'] };
		getAll: (...refs: Ref[]) => Promise<Snap[]>;
		batch: () => {
			set: (ref: Ref, data: Doc, opts?: { merge?: boolean }) => void;
			commit: () => Promise<void>;
		};
		runTransaction: <T>(fn: (t: TransactionLike) => Promise<T>) => Promise<T>;
	};
}

export interface TransactionLike {
	get: (ref: Ref) => Promise<Snap>;
	set: (ref: Ref, data: Doc, opts?: { merge?: boolean }) => void;
	update: (ref: Ref, data: Doc) => void;
}

export function createFakeDb(): FakeDb {
	const store: Store = new Map();
	const createCalls: FakeDb['createCalls'] = [];

	const col = (name: string): Map<string, Doc> => {
		let c = store.get(name);
		if (!c) {
			c = new Map();
			store.set(name, c);
		}

		return c;
	};

	const snapOf = (collection: string, id: string): Snap => {
		const data = col(collection).get(id);

		return { id, exists: !!data, data: () => (data ? { ...data } : undefined) };
	};

	const writeDoc = (collection: string, id: string, data: Doc, merge: boolean): void => {
		col(collection).set(id, applyMerge(col(collection).get(id), data, merge));
	};

	const makeRef = (collection: string, id: string): Ref => ({
		id,
		collection,
		get: async () => snapOf(collection, id),
		set: async (data, opts) => writeDoc(collection, id, data, !!opts?.merge),
		create: async (data) => {
			createCalls.push({ collection, id });
			if (col(collection).has(id)) {
				throw Object.assign(new Error(`Document already exists: ${id}`), { code: 6 });
			}
			writeDoc(collection, id, data, false);
		},
		update: async (data) => writeDoc(collection, id, data, true),
	});

	const makeQuery = (
		collection: string,
		filters: Array<[string, unknown]>,
		limit?: number,
		after?: string,
	): Query => ({
		where: (field, _op, value) => makeQuery(collection, [...filters, [field, value]], limit, after),
		orderBy: () => makeQuery(collection, filters, limit, after),
		select: () => makeQuery(collection, filters, limit, after),
		limit: (n) => makeQuery(collection, filters, n, after),
		startAfter: (cursor) => makeQuery(collection, filters, limit, cursor.id),
		get: async () => {
			let ids = [...col(collection).keys()].sort();
			if (after) ids = ids.filter((id) => id > after);
			let docs = ids
				.map((id) => snapOf(collection, id))
				.filter((snap) => filters.every(([f, v]) => snap.data()?.[f] === v));
			if (limit !== undefined) docs = docs.slice(0, limit);

			return { empty: docs.length === 0, size: docs.length, docs };
		},
	});

	return {
		store,
		createCalls,
		seed: (collection, id, data) => col(collection).set(id, { ...data }),
		read: (collection, id) => col(collection).get(id),
		db: {
			collection: (name) => ({
				doc: (id) => makeRef(name, id),
				where: (field, op, value) => makeQuery(name, []).where(field, op, value),
			}),
			getAll: async (...refs) => refs.map((r) => snapOf(r.collection, r.id)),
			batch: () => {
				const ops: Array<() => void> = [];

				return {
					set: (ref, data, opts) =>
						ops.push(() => writeDoc(ref.collection, ref.id, data, !!opts?.merge)),
					commit: async () => ops.forEach((op) => op()),
				};
			},
			runTransaction: async (fn) =>
				fn({
					get: async (ref) => snapOf(ref.collection, ref.id),
					set: (ref, data, opts) => writeDoc(ref.collection, ref.id, data, !!opts?.merge),
					update: (ref, data) => writeDoc(ref.collection, ref.id, data, true),
				}),
		},
	};
}
