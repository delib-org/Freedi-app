/**
 * A tiny in-memory Firestore for the classroom engine's service tests.
 *
 * Supports exactly what functions/src/classroom uses: collection().doc(),
 * equality where() queries, get/create/set/update, getAll, batch and
 * runTransaction (reads then writes, applied at the end). FieldValue.delete()
 * comes from jest.setup.ts's mock as `{ _delete: true }`; a dotted update key
 * ('statementSettings.ballot') writes a nested field, as Firestore does.
 */
import type { Firestore } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

interface FakeRef {
	kind: 'doc';
	path: string;
	id: string;
	collection: string;
	get: () => Promise<FakeSnap>;
	create: (data: Data) => Promise<void>;
	set: (data: Data) => Promise<void>;
	update: (data: Data) => Promise<void>;
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
	filters: [string, unknown][];
	where: (field: string, op: string, value: unknown) => FakeQuery;
	get: () => Promise<{ docs: FakeSnap[]; empty: boolean; size: number }>;
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
			.filter(([p]) => p.startsWith(`${collection}/`) && p.split('/').length === 2)
			.map(([, d]) => clone(d));
	}

	private snap(ref: FakeRef): FakeSnap {
		const data = this.docs.get(ref.path);

		return { id: ref.id, ref, exists: data !== undefined, data: () => clone(data) };
	}

	private write(path: string, op: 'create' | 'set' | 'update' | 'delete', data?: Data): void {
		const existing = this.docs.get(path);
		if (op === 'create' && existing) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
		if (op === 'update' && !existing) throw Object.assign(new Error('NOT_FOUND'), { code: 5 });
		if (op === 'delete') this.docs.delete(path);
		else if (op === 'update') this.docs.set(path, applyUpdate(existing ?? {}, data ?? {}));
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
			set: async (data) => this.write(path, 'set', data),
			update: async (data) => this.write(path, 'update', data),
		};

		return ref;
	}

	query(collection: string, filters: [string, unknown][] = []): FakeQuery {
		const q: FakeQuery = {
			kind: 'query',
			collection,
			filters,
			where: (field, _op, value) => this.query(collection, [...filters, [field, value]]),
			get: async () => {
				const docs = [...this.docs.entries()]
					.filter(([p]) => p.startsWith(`${collection}/`) && p.split('/').length === 2)
					.filter(([, d]) => filters.every(([f, v]) => d[f] === v))
					.map(([p]) => this.snap(this.doc(collection, p.split('/')[1])));

				return { docs, empty: docs.length === 0, size: docs.length };
			},
		};

		return q;
	}

	asFirestore(): Firestore {
		type Op = () => void;
		const makeWriter = (ops: Op[]) => ({
			create: (ref: FakeRef, data: Data) => ops.push(() => this.write(ref.path, 'create', data)),
			set: (ref: FakeRef, data: Data) => ops.push(() => this.write(ref.path, 'set', data)),
			update: (ref: FakeRef, data: Data) => ops.push(() => this.write(ref.path, 'update', data)),
			delete: (ref: FakeRef) => ops.push(() => this.write(ref.path, 'delete')),
		});
		const api = {
			collection: (name: string) => ({
				doc: (id: string) => this.doc(name, id),
				where: (field: string, op: string, value: unknown) =>
					this.query(name).where(field, op, value),
				get: () => this.query(name).get(),
			}),
			getAll: async (...refs: FakeRef[]) => refs.map((r) => this.snap(r)),
			batch: () => {
				const ops: Op[] = [];

				return { ...makeWriter(ops), commit: async () => ops.forEach((op) => op()) };
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
