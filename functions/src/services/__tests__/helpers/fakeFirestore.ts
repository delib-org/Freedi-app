/**
 * Just enough of `firebase-admin/firestore` for the embedding store and search
 * tests: collections of plain objects, point reads, getAll,
 * where('=='|'in'|'array-contains') on dotted paths, select (dotted paths),
 * ascending orderBy + startAfter + limit, count(), set/update/delete with
 * merge + FieldValue sentinels, batches, and a brute-force COSINE findNearest.
 *
 * Usage: jest.mock('firebase-admin/firestore', () => jest.requireActual(
 *   '<path>/helpers/fakeFirestore').firestoreModule);
 */

type DocData = Record<string, unknown>;

const DELETE = Symbol('delete');

interface VectorLike {
	toArray: () => number[];
}

export const collections = new Map<string, Map<string, DocData>>();

export function resetFirestore(): void {
	collections.clear();
}

function col(name: string): Map<string, DocData> {
	let found = collections.get(name);
	if (!found) {
		found = new Map();
		collections.set(name, found);
	}

	return found;
}

/** Seed a doc directly (no sentinels). */
export function seed(collection: string, id: string, data: DocData): void {
	col(collection).set(id, { ...data });
}

export function peek(collection: string, id: string): DocData | undefined {
	return col(collection).get(id);
}

function asVector(value: unknown): number[] | null {
	if (Array.isArray(value)) return value as number[];
	if (value && typeof value === 'object' && 'toArray' in value) {
		return (value as VectorLike).toArray();
	}

	return null;
}

function apply(target: DocData, patch: DocData): DocData {
	const next = { ...target };
	for (const [key, value] of Object.entries(patch)) {
		if (value === DELETE) delete next[key];
		else next[key] = value;
	}

	return next;
}

function snapshot(collection: string, id: string, data: DocData | undefined) {
	return {
		id,
		exists: data !== undefined,
		ref: new FakeDocRef(collection, id),
		data: () => (data === undefined ? undefined : { ...data }),
	};
}

class FakeDocRef {
	constructor(
		readonly collection: string,
		readonly id: string,
	) {}

	async get() {
		return snapshot(this.collection, this.id, col(this.collection).get(this.id));
	}

	async set(data: DocData, options?: { merge?: boolean }) {
		const existing = col(this.collection).get(this.id);
		col(this.collection).set(this.id, apply(options?.merge && existing ? existing : {}, data));
	}

	async update(data: DocData) {
		const existing = col(this.collection).get(this.id);
		if (!existing) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
		col(this.collection).set(this.id, apply(existing, data));
	}

	async delete() {
		col(this.collection).delete(this.id);
	}
}

interface NearestOptions {
	vectorField: string;
	queryVector: unknown;
	limit: number;
	distanceResultField?: string;
}

interface QueryState {
	filters: Array<(data: DocData) => boolean>;
	fields: string[] | null;
	order: string | null;
	after: unknown;
	max: number | null;
}

const EMPTY_QUERY: QueryState = {
	filters: [],
	fields: null,
	order: null,
	after: undefined,
	max: null,
};

/** Read a dotted field path ('statement.parentId'). */
function readPath(data: DocData, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>(
			(value, key) =>
				value !== null && typeof value === 'object' ? (value as DocData)[key] : undefined,
			data,
		);
}

/** select() with dotted paths keeps the nesting, like Firestore does. */
function project(data: DocData, fields: string[]): DocData {
	const shown: DocData = {};
	for (const field of fields) {
		const value = readPath(data, field);
		if (value === undefined) continue;
		const keys = field.split('.');
		let target = shown;
		for (const key of keys.slice(0, -1)) {
			if (target[key] === null || typeof target[key] !== 'object') target[key] = {};
			target = target[key] as DocData;
		}
		target[keys[keys.length - 1]] = value;
	}

	return shown;
}

function compareValues(a: unknown, b: unknown): number {
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	const left = String(a ?? '');
	const right = String(b ?? '');

	return left < right ? -1 : left > right ? 1 : 0;
}

class FakeQuery {
	constructor(
		readonly collection: string,
		private readonly state: QueryState = EMPTY_QUERY,
	) {}

	private next(patch: Partial<QueryState>): FakeQuery {
		return new FakeQuery(this.collection, { ...this.state, ...patch });
	}

	where(field: string, op: string, value: unknown): FakeQuery {
		let test: (data: DocData) => boolean;
		if (op === 'in') test = (data) => (value as unknown[]).includes(readPath(data, field));
		else if (op === 'array-contains') {
			test = (data) => {
				const list = readPath(data, field);

				return Array.isArray(list) && list.includes(value);
			};
		} else test = (data) => readPath(data, field) === value;

		return this.next({ filters: [...this.state.filters, test] });
	}

	select(...fields: string[]): FakeQuery {
		return this.next({ fields });
	}

	/** Ascending only; '__name__' orders by document id. */
	orderBy(field: string): FakeQuery {
		return this.next({ order: field });
	}

	/** A cursor value for the orderBy field (a document id for '__name__'). */
	startAfter(value: unknown): FakeQuery {
		return this.next({ after: value });
	}

	limit(max: number): FakeQuery {
		return this.next({ max });
	}

	private filtered(): Array<[string, DocData]> {
		return [...col(this.collection).entries()].filter(([, data]) =>
			this.state.filters.every((test) => test(data)),
		);
	}

	private matching(): Array<[string, DocData]> {
		let rows = this.filtered();
		const { order, after, max } = this.state;
		if (order) {
			const keyOf = ([id, data]: [string, DocData]): unknown =>
				order === '__name__' ? id : readPath(data, order);
			rows = rows.sort((a, b) => compareValues(keyOf(a), keyOf(b)));
			if (after !== undefined) rows = rows.filter((row) => compareValues(keyOf(row), after) > 0);
		}

		return max === null ? rows : rows.slice(0, max);
	}

	async get() {
		const docs = this.matching().map(([id, data]) =>
			snapshot(this.collection, id, this.state.fields ? project(data, this.state.fields) : data),
		);

		return { docs, empty: docs.length === 0, size: docs.length };
	}

	count() {
		return {
			get: async () => {
				const count = this.matching().length;

				return { data: () => ({ count }) };
			},
		};
	}

	findNearest(options: NearestOptions) {
		const query = asVector(options.queryVector) ?? [];

		return {
			get: async () => {
				const scored = this.filtered()
					.map(([id, data]) => {
						const vector = asVector(data[options.vectorField]);

						return vector ? { id, data, distance: 1 - cosine(query, vector) } : null;
					})
					.filter((hit): hit is { id: string; data: DocData; distance: number } => hit !== null)
					.sort((a, b) => a.distance - b.distance)
					.slice(0, options.limit);

				return {
					docs: scored.map(({ id, data, distance }) =>
						snapshot(
							this.collection,
							id,
							options.distanceResultField
								? { ...data, [options.distanceResultField]: distance }
								: data,
						),
					),
				};
			},
		};
	}
}

class FakeCollection extends FakeQuery {
	doc(id: string): FakeDocRef {
		return new FakeDocRef(this.collection, id);
	}
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}

	return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

const fakeDb = {
	collection: (name: string) => new FakeCollection(name),
	getAll: async (...refs: FakeDocRef[]) => Promise.all(refs.map((ref) => ref.get())),
	batch: () => {
		const ops: Array<() => Promise<void>> = [];

		return {
			set: (ref: FakeDocRef, data: DocData, options?: { merge?: boolean }) => {
				ops.push(() => ref.set(data, options));
			},
			update: (ref: FakeDocRef, data: DocData) => {
				ops.push(() => ref.update(data));
			},
			commit: async () => {
				for (const op of ops) await op();
			},
		};
	},
};

export const firestoreModule = {
	getFirestore: () => fakeDb,
	FieldValue: {
		vector: (values: number[]): VectorLike => ({ toArray: () => [...values] }),
		delete: () => DELETE,
	},
};
