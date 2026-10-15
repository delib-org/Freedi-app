/**
 * A small in-memory Firestore for callable tests: docs, equality / `in`
 * queries, count(), limit(), batches, transactions (reads, getAll, set with
 * merge, update with dotted paths) and the three FieldValue sentinels the
 * agora access code writes. Enough to run the real callable bodies end to end.
 */

export type DocData = Record<string, unknown>;

export const store = new Map<string, DocData>();

interface Sentinel {
	__op: 'arrayUnion' | 'arrayRemove' | 'delete';
	values: unknown[];
}

export const fakeFieldValue = {
	arrayUnion: (...values: unknown[]): Sentinel => ({ __op: 'arrayUnion', values }),
	arrayRemove: (...values: unknown[]): Sentinel => ({ __op: 'arrayRemove', values }),
	delete: (): Sentinel => ({ __op: 'delete', values: [] }),
};

function isSentinel(value: unknown): value is Sentinel {
	return typeof value === 'object' && value !== null && '__op' in value;
}

function clone<T>(value: T): T {
	return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function applyField(target: DocData, path: string, value: unknown): void {
	const parts = path.split('.');
	let node: DocData = target;
	for (const part of parts.slice(0, -1)) {
		if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
		node = node[part] as DocData;
	}
	const leaf = parts[parts.length - 1];
	if (!isSentinel(value)) {
		node[leaf] = clone(value);

		return;
	}
	if (value.__op === 'delete') {
		delete node[leaf];

		return;
	}
	const current = Array.isArray(node[leaf]) ? (node[leaf] as unknown[]) : [];
	node[leaf] =
		value.__op === 'arrayUnion'
			? [...current, ...value.values.filter((v) => !current.includes(v))]
			: current.filter((v) => !value.values.includes(v));
}

function applyUpdate(path: string, data: DocData): void {
	const current = store.get(path);
	if (!current) throw new Error(`NOT_FOUND: ${path}`);
	const next = clone(current);
	Object.entries(data).forEach(([key, value]) => applyField(next, key, value));
	store.set(path, next);
}

function applySet(path: string, data: DocData, options?: { merge?: boolean }): void {
	const next: DocData = options?.merge ? clone(store.get(path) ?? {}) : {};
	Object.entries(data).forEach(([key, value]) => {
		if (
			options?.merge &&
			typeof value === 'object' &&
			value !== null &&
			!isSentinel(value) &&
			!Array.isArray(value)
		) {
			next[key] = clone(value);
		} else {
			applyField(next, key, value);
		}
	});
	store.set(path, next);
}

function readPath(data: DocData, path: string): unknown {
	return path.split('.').reduce<unknown>((node, part) => {
		if (typeof node !== 'object' || node === null) return undefined;

		return (node as DocData)[part];
	}, data);
}

interface Snap {
	id: string;
	exists: boolean;
	ref: FakeDocRef;
	data: () => DocData | undefined;
}

function snapOf(ref: FakeDocRef): Snap {
	const data = store.get(ref.path);

	return { id: ref.id, exists: data !== undefined, ref, data: () => clone(data) };
}

export class FakeDocRef {
	constructor(
		readonly collectionName: string,
		readonly id: string,
	) {}
	get path(): string {
		return `${this.collectionName}/${this.id}`;
	}
	async get(): Promise<Snap> {
		return snapOf(this);
	}
	async set(data: DocData, options?: { merge?: boolean }): Promise<void> {
		applySet(this.path, data, options);
	}
	async update(data: DocData): Promise<void> {
		applyUpdate(this.path, data);
	}
	async delete(): Promise<void> {
		store.delete(this.path);
	}
}

type Filter = { field: string; op: '==' | 'in'; value: unknown };

export class FakeQuery {
	constructor(
		readonly collectionName: string,
		readonly filters: Filter[] = [],
		readonly max?: number,
	) {}
	where(field: string, op: '==' | 'in', value: unknown): FakeQuery {
		return new FakeQuery(this.collectionName, [...this.filters, { field, op, value }], this.max);
	}
	limit(max: number): FakeQuery {
		return new FakeQuery(this.collectionName, this.filters, max);
	}
	matches(): Snap[] {
		const prefix = `${this.collectionName}/`;
		const docs = [...store.keys()]
			.filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
			.map((path) => snapOf(new FakeDocRef(this.collectionName, path.slice(prefix.length))))
			.filter((snap) =>
				this.filters.every((filter) => {
					const value = readPath(snap.data() ?? {}, filter.field);

					return filter.op === '=='
						? value === filter.value
						: (filter.value as unknown[]).includes(value);
				}),
			);

		return this.max === undefined ? docs : docs.slice(0, this.max);
	}
	async get(): Promise<{ docs: Snap[]; empty: boolean; size: number }> {
		const docs = this.matches();

		return { docs, empty: docs.length === 0, size: docs.length };
	}
	count(): { get: () => Promise<{ data: () => { count: number } }> } {
		return { get: async () => ({ data: () => ({ count: this.matches().length }) }) };
	}
}

class FakeCollection extends FakeQuery {
	private counter = 0;
	doc(id?: string): FakeDocRef {
		return new FakeDocRef(this.collectionName, id ?? `auto-${Date.now()}-${++this.counter}`);
	}
}

type Write = () => void;

function writer(writes: Write[]): {
	set: (ref: FakeDocRef, data: DocData, options?: { merge?: boolean }) => void;
	update: (ref: FakeDocRef, data: DocData) => void;
	delete: (ref: FakeDocRef) => void;
} {
	return {
		set: (ref, data, options) => writes.push(() => applySet(ref.path, data, options)),
		update: (ref, data) => writes.push(() => applyUpdate(ref.path, data)),
		delete: (ref) => writes.push(() => store.delete(ref.path)),
	};
}

export const fakeDb = {
	collection: (name: string): FakeCollection => new FakeCollection(name),
	getAll: async (...refs: FakeDocRef[]): Promise<Snap[]> => refs.map(snapOf),
	batch: () => {
		const writes: Write[] = [];

		return {
			...writer(writes),
			commit: async (): Promise<void> => writes.forEach((write) => write()),
		};
	},
	runTransaction: async <T>(body: (tx: unknown) => Promise<T>): Promise<T> => {
		// Buffer writes so a throw inside the body commits nothing, as Firestore does
		const writes: Write[] = [];
		const tx = {
			...writer(writes),
			get: async (target: FakeDocRef | FakeQuery) =>
				target instanceof FakeDocRef ? snapOf(target) : target.get(),
			getAll: async (...refs: FakeDocRef[]) => refs.map(snapOf),
		};
		const result = await body(tx);
		writes.forEach((write) => write());

		return result;
	},
};
