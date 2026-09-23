/**
 * Just enough of `firebase-admin/firestore` for the embedding store tests:
 * collections of plain objects, point reads, getAll, where('=='|'in'),
 * select, set/update/delete with merge + FieldValue sentinels, batches, and
 * a brute-force COSINE findNearest.
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

class FakeQuery {
	constructor(
		readonly collection: string,
		private readonly filters: Array<(data: DocData) => boolean> = [],
		private readonly fields: string[] | null = null,
	) {}

	where(field: string, op: string, value: unknown): FakeQuery {
		const test =
			op === 'in'
				? (data: DocData) => (value as unknown[]).includes(data[field])
				: (data: DocData) => data[field] === value;

		return new FakeQuery(this.collection, [...this.filters, test], this.fields);
	}

	select(...fields: string[]): FakeQuery {
		return new FakeQuery(this.collection, this.filters, fields);
	}

	private matching(): Array<[string, DocData]> {
		return [...col(this.collection).entries()].filter(([, data]) =>
			this.filters.every((test) => test(data)),
		);
	}

	async get() {
		return {
			docs: this.matching().map(([id, data]) => {
				const shown = this.fields
					? Object.fromEntries(this.fields.filter((f) => f in data).map((f) => [f, data[f]]))
					: data;

				return snapshot(this.collection, id, shown);
			}),
		};
	}

	findNearest(options: NearestOptions) {
		const query = asVector(options.queryVector) ?? [];

		return {
			get: async () => {
				const scored = this.matching()
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
