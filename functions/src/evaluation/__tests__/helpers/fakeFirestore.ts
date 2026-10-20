/**
 * Minimal in-memory Firestore with operation counters, for the evaluation
 * cost tests. Supports exactly what the evaluation modules use: where('=='),
 * orderBy('__name__'), startAfter, limit, count(), get/set/create/update/delete,
 * dotted-path updates, `{__increment: n}` sentinels, batches, and transactions
 * with optimistic-concurrency retry (so concurrency tests are meaningful).
 *
 * Counters are Firestore-billing shaped: every returned document is a read
 * (min 1 per query), every write is a write, count() is one read per 1000 index
 * entries (min 1).
 */

export interface OpCounts {
	reads: number;
	writes: number;
	queries: number;
}

export interface Increment {
	__increment: number;
}

export const incrementOf = (n: number): Increment => ({ __increment: n });

type Data = Record<string, unknown>;

const COUNT_READS_PER = 1000;

function isIncrement(value: unknown): value is Increment {
	return typeof value === 'object' && value !== null && '__increment' in value;
}

function getPath(data: Data, path: string): unknown {
	return path.split('.').reduce<unknown>((acc, key) => (acc as Data | undefined)?.[key], data);
}

function setPath(data: Data, path: string, value: unknown): void {
	const keys = path.split('.');
	let cursor = data;
	keys.slice(0, -1).forEach((key) => {
		if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
		cursor = cursor[key] as Data;
	});
	const last = keys[keys.length - 1];
	cursor[last] = isIncrement(value)
		? ((cursor[last] as number | undefined) ?? 0) + value.__increment
		: value;
}

function applyPatch(base: Data, patch: Data): Data {
	const next = structuredClone(base);
	Object.entries(patch).forEach(([path, value]) => setPath(next, path, value));

	return next;
}

interface Stored {
	data: Data;
	version: number;
}

export class FakeFirestore {
	readonly counts: OpCounts = { reads: 0, writes: 0, queries: 0 };
	private readonly store = new Map<string, Stored>();
	/** Every write, in order, as `op path` - for "which docs were written" assertions. */
	readonly writeLog: string[] = [];

	clear(): void {
		this.store.clear();
		this.resetCounts();
	}

	resetCounts(): void {
		this.counts.reads = 0;
		this.counts.writes = 0;
		this.counts.queries = 0;
		this.writeLog.length = 0;
	}

	seed(path: string, data: Data): void {
		this.store.set(path, { data: structuredClone(data), version: 1 });
	}

	peek(path: string): Data | undefined {
		return this.store.get(path)?.data;
	}

	list(collection: string): Array<{ id: string; data: Data }> {
		return [...this.store.entries()]
			.filter(([path]) => path.startsWith(`${collection}/`) && path.split('/').length === 2)
			.map(([path, stored]) => ({ id: path.split('/')[1], data: stored.data }))
			.sort((a, b) => (a.id < b.id ? -1 : 1));
	}

	collection(name: string): FakeCollection {
		return new FakeCollection(this, name, []);
	}

	batch(): FakeBatch {
		return new FakeBatch(this);
	}

	bulkWriter(): FakeBulkWriter {
		return new FakeBulkWriter(this);
	}

	async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
		const maxAttempts = 50;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const tx = new FakeTransaction(this);
			const result = await fn(tx);
			if (tx.commit()) return result;
		}
		throw new Error('transaction contention');
	}

	// internals used by the helper classes ------------------------------------
	rawGet(path: string): Stored | undefined {
		return this.store.get(path);
	}

	rawWrite(op: 'set' | 'create' | 'update' | 'delete', path: string, data?: Data): void {
		const existing = this.store.get(path);
		if (op === 'create' && existing) {
			throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
		}
		if (op === 'update' && !existing) throw new Error(`NOT_FOUND ${path}`);
		this.counts.writes++;
		this.writeLog.push(`${op} ${path}`);
		if (op === 'delete') {
			this.store.delete(path);

			return;
		}
		const next =
			op === 'update' ? applyPatch(existing!.data, data ?? {}) : applyPatch({}, data ?? {});
		this.store.set(path, { data: next, version: (existing?.version ?? 0) + 1 });
	}
}

export class FakeSnapshot {
	constructor(
		readonly id: string,
		private readonly value: Data | undefined,
	) {}

	get exists(): boolean {
		return this.value !== undefined;
	}

	data(): Data | undefined {
		return this.value ? structuredClone(this.value) : undefined;
	}
}

export class FakeDocRef {
	constructor(
		private readonly fs: FakeFirestore,
		readonly path: string,
	) {}

	get id(): string {
		return this.path.split('/')[1];
	}

	async get(): Promise<FakeSnapshot> {
		this.fs.counts.reads++;

		return new FakeSnapshot(this.id, this.fs.rawGet(this.path)?.data);
	}

	async set(data: Data): Promise<void> {
		this.fs.rawWrite('set', this.path, data);
	}

	async update(data: Data): Promise<void> {
		this.fs.rawWrite('update', this.path, data);
	}

	async create(data: Data): Promise<void> {
		this.fs.rawWrite('create', this.path, data);
	}

	async delete(): Promise<void> {
		this.fs.rawWrite('delete', this.path);
	}
}

type Filter = { field: string; value: unknown };

class FakeCollection {
	private orderByName = false;
	private after: string | undefined;
	private max: number | undefined;

	constructor(
		private readonly fs: FakeFirestore,
		private readonly name: string,
		private readonly filters: Filter[],
	) {}

	doc(id: string): FakeDocRef {
		return new FakeDocRef(this.fs, `${this.name}/${id}`);
	}

	where(field: string, _op: '==', value: unknown): FakeCollection {
		const next = this.clone();
		next.filters.push({ field, value });

		return next;
	}

	orderBy(_field: '__name__'): FakeCollection {
		const next = this.clone();
		next.orderByName = true;

		return next;
	}

	startAfter(id: string): FakeCollection {
		const next = this.clone();
		next.after = id;

		return next;
	}

	limit(n: number): FakeCollection {
		const next = this.clone();
		next.max = n;

		return next;
	}

	private clone(): FakeCollection {
		const next = new FakeCollection(this.fs, this.name, [...this.filters]);
		next.orderByName = this.orderByName;
		next.after = this.after;
		next.max = this.max;

		return next;
	}

	private matching(): Array<{ id: string; data: Data }> {
		let rows = this.fs
			.list(this.name)
			.filter((row) => this.filters.every((f) => getPath(row.data, f.field) === f.value));
		if (this.after !== undefined) rows = rows.filter((row) => row.id > this.after!);
		if (this.max !== undefined) rows = rows.slice(0, this.max);

		return rows;
	}

	async get(): Promise<{
		docs: FakeSnapshot[];
		size: number;
		empty: boolean;
		forEach: (cb: (doc: FakeSnapshot) => void) => void;
	}> {
		this.fs.counts.queries++;
		const docs = this.matching().map((row) => new FakeSnapshot(row.id, row.data));
		this.fs.counts.reads += Math.max(1, docs.length);

		return {
			docs,
			size: docs.length,
			empty: docs.length === 0,
			forEach: (cb) => docs.forEach(cb),
		};
	}

	count(): { get: () => Promise<{ data: () => { count: number } }> } {
		return {
			get: async () => {
				this.fs.counts.queries++;
				const total = this.matching().length;
				this.fs.counts.reads += Math.max(1, Math.ceil(total / COUNT_READS_PER));

				return { data: () => ({ count: total }) };
			},
		};
	}
}

export class FakeBatch {
	private readonly ops: Array<() => void> = [];

	constructor(private readonly fs: FakeFirestore) {}

	update(ref: FakeDocRef, data: Data): void {
		this.ops.push(() => this.fs.rawWrite('update', ref.path, data));
	}

	set(ref: FakeDocRef, data: Data): void {
		this.ops.push(() => this.fs.rawWrite('set', ref.path, data));
	}

	delete(ref: FakeDocRef): void {
		this.ops.push(() => this.fs.rawWrite('delete', ref.path));
	}

	async commit(): Promise<void> {
		this.ops.forEach((op) => op());
	}
}

export class FakeBulkWriter {
	private readonly pending: Array<Promise<unknown>> = [];

	constructor(private readonly fs: FakeFirestore) {}

	create(ref: FakeDocRef, data: Data): Promise<void> {
		const promise = Promise.resolve().then(() => this.fs.rawWrite('create', ref.path, data));
		this.pending.push(promise.catch(() => undefined));

		return promise;
	}

	async close(): Promise<void> {
		await Promise.all(this.pending);
	}
}

export class FakeTransaction {
	private readonly reads = new Map<string, number>();
	private readonly writes: Array<() => void> = [];

	constructor(private readonly fs: FakeFirestore) {}

	async get(ref: FakeDocRef): Promise<FakeSnapshot> {
		const stored = this.fs.rawGet(ref.path);
		this.fs.counts.reads++;
		this.reads.set(ref.path, stored?.version ?? 0);
		// Yield so concurrently started transactions interleave their reads.
		await Promise.resolve();

		return new FakeSnapshot(ref.id, stored?.data);
	}

	create(ref: FakeDocRef, data: Data): void {
		this.writes.push(() => this.fs.rawWrite('create', ref.path, data));
	}

	update(ref: FakeDocRef, data: Data): void {
		this.writes.push(() => this.fs.rawWrite('update', ref.path, data));
	}

	/** Applies the buffered writes if no document it read changed; false = retry. */
	commit(): boolean {
		for (const [path, version] of this.reads) {
			if ((this.fs.rawGet(path)?.version ?? 0) !== version) return false;
		}
		this.writes.forEach((apply) => apply());

		return true;
	}
}
