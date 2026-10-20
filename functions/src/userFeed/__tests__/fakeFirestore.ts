/**
 * A small in-memory Firestore for the userFeed tests: enough of the Admin SDK
 * surface (doc get/set/update/create/delete, where/orderBy/limit/startAfter,
 * select, count, batch, runTransaction, getAll) to run the real code paths,
 * with billing-style counters so the tests can report operation counts.
 *
 * Billing model (Firestore): a query costs one read per returned doc and at
 * least one read; count() costs one read per 1000 index entries (min 1).
 */

type Data = Record<string, unknown>;
type FilterOp = '==' | '!=';

interface Filter {
	field: string;
	op: FilterOp;
	value: unknown;
}

interface Order {
	field: string;
	direction: 'asc' | 'desc';
}

export interface WriteEvent {
	collection: string;
	id: string;
	type: 'create' | 'update' | 'delete';
}

export class FirestoreCodeError extends Error {
	constructor(
		public readonly code: number,
		message: string,
	) {
		super(message);
	}
}

const NOT_FOUND = 5;
const ALREADY_EXISTS = 6;
const COUNT_ENTRIES_PER_READ = 1000;

function getField(data: Data, path: string): unknown {
	return path.split('.').reduce<unknown>((value, key) => {
		if (value && typeof value === 'object') return (value as Data)[key];

		return undefined;
	}, data);
}

export class FakeDocSnapshot {
	constructor(
		public readonly ref: FakeDocRef,
		private readonly value: Data | undefined,
	) {}

	get id(): string {
		return this.ref.id;
	}

	get exists(): boolean {
		return this.value !== undefined;
	}

	data(): Data | undefined {
		return this.value ? structuredClone(this.value) : undefined;
	}
}

export class FakeDocRef {
	constructor(
		private readonly db: FakeFirestore,
		public readonly collectionName: string,
		public readonly id: string,
	) {}

	async get(): Promise<FakeDocSnapshot> {
		this.db.reads += 1;

		return this.db.snapshotOf(this);
	}

	async set(data: Data): Promise<void> {
		this.db.applySet(this, data);
	}

	async create(data: Data): Promise<void> {
		if (this.db.peek(this)) throw new FirestoreCodeError(ALREADY_EXISTS, 'already exists');
		this.db.applySet(this, data);
	}

	async update(fields: Data): Promise<void> {
		this.db.applyUpdate(this, fields);
	}

	async delete(): Promise<void> {
		this.db.applyDelete(this);
	}
}

export class FakeQuery {
	constructor(
		protected readonly db: FakeFirestore,
		protected readonly collectionName: string,
		private readonly filters: Filter[] = [],
		private readonly order: Order[] = [],
		private readonly max?: number,
		private readonly after?: unknown,
	) {}

	where(field: string, op: FilterOp, value: unknown): FakeQuery {
		return new FakeQuery(
			this.db,
			this.collectionName,
			[...this.filters, { field, op, value }],
			this.order,
			this.max,
			this.after,
		);
	}

	orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQuery {
		return new FakeQuery(
			this.db,
			this.collectionName,
			this.filters,
			[...this.order, { field, direction }],
			this.max,
			this.after,
		);
	}

	limit(max: number): FakeQuery {
		return new FakeQuery(this.db, this.collectionName, this.filters, this.order, max, this.after);
	}

	startAfter(after: unknown): FakeQuery {
		return new FakeQuery(this.db, this.collectionName, this.filters, this.order, this.max, after);
	}

	select(): FakeQuery {
		return this;
	}

	private sortKey(id: string, data: Data): unknown {
		const primary = this.order[0];
		if (!primary || primary.field === '__name__') return id;

		return getField(data, primary.field);
	}

	private matching(): Array<[string, Data]> {
		const rows = [...this.db.rowsOf(this.collectionName)].filter(([, data]) =>
			this.filters.every((filter) => {
				const value = getField(data, filter.field);
				if (filter.op === '==') return value === filter.value;

				return value !== undefined && value !== filter.value;
			}),
		);
		const direction = this.order[0]?.direction === 'desc' ? -1 : 1;
		rows.sort(([idA, a], [idB, b]) => {
			const keyA = this.sortKey(idA, a) as string | number;
			const keyB = this.sortKey(idB, b) as string | number;
			if (keyA === keyB) return idA < idB ? -1 : 1;

			return (keyA < keyB ? -1 : 1) * direction;
		});
		if (this.after === undefined) return rows;

		const afterKey =
			this.after instanceof FakeDocSnapshot
				? this.sortKey(this.after.id, this.after.data() ?? {})
				: this.after;
		const index = rows.findIndex(([id, data]) => {
			const key = this.sortKey(id, data) as string | number;

			return direction === 1
				? key > (afterKey as string | number)
				: key < (afterKey as string | number);
		});

		return index === -1 ? [] : rows.slice(index);
	}

	async get(): Promise<{ docs: FakeDocSnapshot[]; empty: boolean; size: number }> {
		const rows = this.matching();
		const limited = this.max === undefined ? rows : rows.slice(0, this.max);
		this.db.reads += Math.max(1, limited.length);
		const docs = limited.map(
			([id, data]) =>
				new FakeDocSnapshot(
					new FakeDocRef(this.db, this.collectionName, id),
					structuredClone(data),
				),
		);

		return { docs, empty: docs.length === 0, size: docs.length };
	}

	count(): { get: () => Promise<{ data: () => { count: number } }> } {
		return {
			get: async () => {
				const count = this.matching().length;
				this.db.reads += Math.max(1, Math.ceil(count / COUNT_ENTRIES_PER_READ));

				return { data: () => ({ count }) };
			},
		};
	}
}

export class FakeCollection extends FakeQuery {
	doc(id: string): FakeDocRef {
		return new FakeDocRef(this.db, this.collectionName, id);
	}
}

type BatchOp =
	| { kind: 'set'; ref: FakeDocRef; data: Data }
	| { kind: 'update'; ref: FakeDocRef; data: Data }
	| { kind: 'delete'; ref: FakeDocRef };

export class FakeBatch {
	private ops: BatchOp[] = [];

	constructor(private readonly db: FakeFirestore) {}

	set(ref: FakeDocRef, data: Data): FakeBatch {
		this.ops.push({ kind: 'set', ref, data });

		return this;
	}

	update(ref: FakeDocRef, data: Data): FakeBatch {
		this.ops.push({ kind: 'update', ref, data });

		return this;
	}

	delete(ref: FakeDocRef): FakeBatch {
		this.ops.push({ kind: 'delete', ref });

		return this;
	}

	async commit(): Promise<void> {
		const missing = this.ops.find((op) => op.kind === 'update' && !this.db.peek(op.ref));
		if (missing)
			throw new FirestoreCodeError(NOT_FOUND, `no document to update: ${missing.ref.id}`);
		this.ops.forEach((op) => {
			if (op.kind === 'set') this.db.applySet(op.ref, op.data);
			else if (op.kind === 'update') this.db.applyUpdate(op.ref, op.data);
			else this.db.applyDelete(op.ref);
		});
	}
}

export class FakeFirestore {
	reads = 0;
	writes = 0;
	readonly events: WriteEvent[] = [];
	private readonly store = new Map<string, Map<string, Data>>();

	collection(name: string): FakeCollection {
		return new FakeCollection(this, name);
	}

	batch(): FakeBatch {
		return new FakeBatch(this);
	}

	async getAll(...refs: FakeDocRef[]): Promise<FakeDocSnapshot[]> {
		this.reads += refs.length;

		return refs.map((ref) => this.snapshotOf(ref));
	}

	async runTransaction<T>(
		fn: (transaction: {
			get: (ref: FakeDocRef) => Promise<FakeDocSnapshot>;
			set: (ref: FakeDocRef, data: Data) => void;
		}) => Promise<T>,
	): Promise<T> {
		const pending: Array<[FakeDocRef, Data]> = [];
		const result = await fn({
			get: async (ref) => ref.get(),
			set: (ref, data) => {
				pending.push([ref, data]);
			},
		});
		pending.forEach(([ref, data]) => this.applySet(ref, data));

		return result;
	}

	// ---- test helpers (do not count as billed operations) ----

	seed(collectionName: string, id: string, data: Data): void {
		this.table(collectionName).set(id, structuredClone(data));
	}

	peek(ref: FakeDocRef): Data | undefined {
		return this.table(ref.collectionName).get(ref.id);
	}

	read(collectionName: string, id: string): Data | undefined {
		return this.table(collectionName).get(id);
	}

	size(collectionName: string): number {
		return this.table(collectionName).size;
	}

	resetCounters(): void {
		this.reads = 0;
		this.writes = 0;
		this.events.length = 0;
	}

	writesTo(collectionName: string, type?: WriteEvent['type']): number {
		return this.events.filter(
			(event) => event.collection === collectionName && (!type || event.type === type),
		).length;
	}

	// ---- internals used by refs/queries/batches ----

	rowsOf(collectionName: string): Map<string, Data> {
		return this.table(collectionName);
	}

	snapshotOf(ref: FakeDocRef): FakeDocSnapshot {
		const value = this.peek(ref);

		return new FakeDocSnapshot(ref, value ? structuredClone(value) : undefined);
	}

	applySet(ref: FakeDocRef, data: Data): void {
		const existed = this.peek(ref) !== undefined;
		this.table(ref.collectionName).set(ref.id, structuredClone(data));
		this.record(ref, existed ? 'update' : 'create');
	}

	applyUpdate(ref: FakeDocRef, fields: Data): void {
		const current = this.peek(ref);
		if (!current) throw new FirestoreCodeError(NOT_FOUND, `no document to update: ${ref.id}`);
		this.table(ref.collectionName).set(ref.id, { ...current, ...structuredClone(fields) });
		this.record(ref, 'update');
	}

	applyDelete(ref: FakeDocRef): void {
		const existed = this.table(ref.collectionName).delete(ref.id);
		this.writes += 1; // a delete is billed even when the doc is absent
		if (existed) this.events.push({ collection: ref.collectionName, id: ref.id, type: 'delete' });
	}

	private record(ref: FakeDocRef, type: WriteEvent['type']): void {
		this.writes += 1;
		this.events.push({ collection: ref.collectionName, id: ref.id, type });
	}

	private table(name: string): Map<string, Data> {
		let table = this.store.get(name);
		if (!table) {
			table = new Map();
			this.store.set(name, table);
		}

		return table;
	}
}
