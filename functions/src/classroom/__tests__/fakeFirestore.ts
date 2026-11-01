/**
 * A tiny in-memory Firestore for the classroom engine's service tests.
 *
 * Supports what functions/src/classroom and the class-lesson migration use:
 * collection().doc() (and doc().collection() for subcollections), where()
 * queries with ==, in, array-contains and range ops on dotted fields,
 * orderBy / limit / startAfter, get/create/set (with { merge })/update,
 * getAll, batch and runTransaction (reads then writes, applied at the end).
 * FieldValue.delete() comes from jest.setup.ts's mock as `{ _delete: true }`;
 * a dotted update key ('statementSettings.ballot') writes a nested field, as
 * Firestore does.
 */
import type { Firestore } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;
type Filter = [string, unknown, string?];

interface FakeRef {
	kind: 'doc';
	path: string;
	id: string;
	collection: string;
	get: () => Promise<FakeSnap>;
	create: (data: Data) => Promise<void>;
	set: (data: Data, options?: { merge?: boolean }) => Promise<void>;
	update: (data: Data) => Promise<void>;
	delete: () => Promise<void>;
	collectionOf: (name: string) => FakeCollection;
}

interface FakeSnap {
	id: string;
	ref: FakeRef;
	exists: boolean;
	data: () => Data | undefined;
}

interface FakeQuery {
	kind: 'query';
	collection: string;
	filters: Filter[];
	where: (field: string, op: string, value: unknown) => FakeQuery;
	orderBy: (field: string) => FakeQuery;
	limit: (n: number) => FakeQuery;
	startAfter: (snap: FakeSnap) => FakeQuery;
	get: () => Promise<{ docs: FakeSnap[]; empty: boolean; size: number }>;
}

interface FakeCollection {
	doc: (id: string) => unknown;
	where: (field: string, op: string, value: unknown) => FakeQuery;
	orderBy: (field: string) => FakeQuery;
	limit: (n: number) => FakeQuery;
	get: () => Promise<{ docs: FakeSnap[]; empty: boolean; size: number }>;
}

interface QueryShape {
	order?: string;
	max?: number;
	after?: string;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function isDelete(v: unknown): boolean {
	return typeof v === 'object' && v !== null && (v as { _delete?: boolean })._delete === true;
}

function applyUpdate(target: Data, patch: Data): Data {
	const out = clone(target);
	for (const [key, value] of Object.entries(patch)) {
		const parts = key.split('.');
		let node: Data = out;
		for (const part of parts.slice(0, -1)) {
			if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
			node = node[part] as Data;
		}
		const last = parts[parts.length - 1];
		if (isDelete(value)) delete node[last];
		else node[last] = clone(value);
	}

	return out;
}

function deepMerge(target: Data, patch: Data): Data {
	const out = clone(target);
	for (const [key, value] of Object.entries(patch)) {
		if (isDelete(value)) delete out[key];
		else if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			typeof out[key] === 'object' &&
			out[key] !== null &&
			!Array.isArray(out[key])
		) {
			out[key] = deepMerge(out[key] as Data, value as Data);
		} else out[key] = clone(value);
	}

	return out;
}

function valueAt(data: Data, field: string): unknown {
	if (field === '__name__') return undefined;
	let node: unknown = data;
	for (const part of field.split('.')) {
		if (typeof node !== 'object' || node === null) return undefined;
		node = (node as Data)[part];
	}

	return node;
}

function matches(data: Data, [field, value, op = '==']: Filter): boolean {
	const actual = valueAt(data, field);
	switch (op) {
		case '==':
			return actual === value;
		case 'in':
			return Array.isArray(value) && value.includes(actual);
		case 'array-contains':
			return Array.isArray(actual) && actual.includes(value);
		case '>=':
			return typeof actual === typeof value && (actual as number) >= (value as number);
		case '>':
			return typeof actual === typeof value && (actual as number) > (value as number);
		case '<=':
			return typeof actual === typeof value && (actual as number) <= (value as number);
		case '<':
			return typeof actual === typeof value && (actual as number) < (value as number);
		default:
			throw new Error(`fakeFirestore: unsupported op ${op}`);
	}
}

/** Docs directly in `collection` (a path of odd depth: 'a' or 'a/x/b'). */
function inCollection(path: string, collection: string): boolean {
	return (
		path.startsWith(`${collection}/`) && path.split('/').length === collection.split('/').length + 1
	);
}

export class FakeFirestore {
	readonly docs = new Map<string, Data>();

	seed(path: string, data: Data): void {
		this.docs.set(path, clone(data));
	}

	read(path: string): Data | undefined {
		return clone(this.docs.get(path));
	}

	list(collection: string): Data[] {
		return [...this.docs.entries()]
			.filter(([p]) => inCollection(p, collection))
			.map(([, d]) => clone(d));
	}

	private snap(ref: FakeRef): FakeSnap {
		const data = this.docs.get(ref.path);

		return { id: ref.id, ref, exists: data !== undefined, data: () => clone(data) };
	}

	private write(
		path: string,
		op: 'create' | 'set' | 'merge' | 'update' | 'delete',
		data?: Data,
	): void {
		const existing = this.docs.get(path);
		if (op === 'create' && existing) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
		if (op === 'update' && !existing) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
		if (op === 'delete') this.docs.delete(path);
		else if (op === 'update') this.docs.set(path, applyUpdate(existing ?? {}, data ?? {}));
		else if (op === 'merge') this.docs.set(path, deepMerge(existing ?? {}, data ?? {}));
		else
			this.docs.set(
				path,
				applyUpdate(
					{},
					Object.fromEntries(Object.entries(data ?? {}).filter(([, v]) => !isDelete(v))),
				),
			);
	}

	doc(collection: string, id: string): FakeRef {
		const path = `${collection}/${id}`;
		const ref: FakeRef = {
			kind: 'doc',
			path,
			id,
			collection,
			get: async () => this.snap(ref),
			create: async (data) => this.write(path, 'create', data),
			set: async (data, options) => this.write(path, options?.merge ? 'merge' : 'set', data),
			update: async (data) => this.write(path, 'update', data),
			delete: async () => this.write(path, 'delete'),
			collectionOf: (name) => this.collectionApi(`${path}/${name}`),
		};

		return ref;
	}

	query(collection: string, filters: Filter[] = [], shape: QueryShape = {}): FakeQuery {
		const q: FakeQuery = {
			kind: 'query',
			collection,
			filters,
			where: (field, op, value) => this.query(collection, [...filters, [field, value, op]], shape),
			orderBy: (field) => this.query(collection, filters, { ...shape, order: field }),
			limit: (n) => this.query(collection, filters, { ...shape, max: n }),
			startAfter: (snap) => this.query(collection, filters, { ...shape, after: snap.ref.path }),
			get: async () => {
				let entries = [...this.docs.entries()]
					.filter(([p]) => inCollection(p, collection))
					.filter(([, d]) => filters.every((f) => matches(d, f)))
					.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
				const order = shape.order;
				if (order && order !== '__name__') {
					entries = entries.sort(([pa, a], [pb, b]) => {
						const va = valueAt(a, order) as number;
						const vb = valueAt(b, order) as number;
						if (va !== vb) return va < vb ? -1 : 1;

						return pa < pb ? -1 : pa > pb ? 1 : 0;
					});
				}
				if (shape.after) {
					const at = entries.findIndex(([p]) => p === shape.after);
					entries = at >= 0 ? entries.slice(at + 1) : entries;
				}
				if (shape.max !== undefined) entries = entries.slice(0, shape.max);
				const docs = entries.map(([p]) => {
					const parts = p.split('/');

					return this.snap(this.doc(parts.slice(0, -1).join('/'), parts[parts.length - 1]));
				});

				return { docs, empty: docs.length === 0, size: docs.length };
			},
		};

		return q;
	}

	private collectionApi(name: string): FakeCollection {
		return {
			doc: (id: string) => {
				const ref = this.doc(name, id);

				return { ...ref, collection: ref.collectionOf, parentPath: name };
			},
			where: (field: string, op: string, value: unknown) =>
				this.query(name).where(field, op, value),
			orderBy: (field: string) => this.query(name).orderBy(field),
			limit: (n: number) => this.query(name).limit(n),
			get: () => this.query(name).get(),
		};
	}

	asFirestore(): Firestore {
		type Op = () => void;
		const makeWriter = (ops: Op[]) => ({
			create: (ref: FakeRef, data: Data) => ops.push(() => this.write(ref.path, 'create', data)),
			set: (ref: FakeRef, data: Data, options?: { merge?: boolean }) =>
				ops.push(() => this.write(ref.path, options?.merge ? 'merge' : 'set', data)),
			update: (ref: FakeRef, data: Data) => ops.push(() => this.write(ref.path, 'update', data)),
			delete: (ref: FakeRef) => ops.push(() => this.write(ref.path, 'delete')),
		});
		const api = {
			collection: (name: string) => this.collectionApi(name),
			getAll: async (...refs: FakeRef[]) => refs.map((r) => this.snap(r)),
			batch: () => {
				const ops: Op[] = [];
				const writer = makeWriter(ops);

				return {
					...writer,
					commit: async () => ops.forEach((op) => op()),
					get size() {
						return ops.length;
					},
				};
			},
			runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
				const ops: Op[] = [];
				const tx = {
					...makeWriter(ops),
					get: async (target: FakeRef | FakeQuery) =>
						target.kind === 'doc' ? this.snap(target) : target.get(),
					getAll: async (...refs: FakeRef[]) => refs.map((r) => this.snap(r)),
				};
				const result = await fn(tx);
				ops.forEach((op) => op());

				return result;
			},
		};

		return api as unknown as Firestore;
	}
}
