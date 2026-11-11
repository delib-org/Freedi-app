import type { Firestore } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

interface FakeDoc {
	id: string;
	ref: FakeRef;
	exists: boolean;
	data: () => Data | undefined;
}

interface FakeRef {
	collection: string;
	id: string;
	get: () => Promise<FakeDoc>;
	update: (patch: Data) => Promise<void>;
	set: (value: Data) => Promise<void>;
}

function readPath(data: Data | undefined, path: string): unknown {
	return path.split('.').reduce<unknown>((value, key) => (value as Data | undefined)?.[key], data);
}

/** Sets or deletes a possibly dotted path, copying each map on the way. */
function setPath(target: Data, path: string, value: unknown): void {
	const [head, ...rest] = path.split('.');
	if (rest.length === 0) {
		if (isDelete(value)) delete target[head];
		else target[head] = value;

		return;
	}
	const child: Data = { ...((target[head] as Data | undefined) ?? {}) };
	setPath(child, rest.join('.'), value);
	target[head] = child;
}

/** FieldValue.delete(): the real class, or the shape the functions test setup mocks it with. */
function isDelete(value: unknown): boolean {
	const sentinel = value as { constructor?: { name?: string }; _delete?: boolean } | undefined;

	return sentinel?.constructor?.name === 'DeleteTransform' || sentinel?._delete === true;
}

/** Just enough of Firestore for the stamping code: a page-able, array-contains-able store. */
export function fakeStatementStore() {
	const stores = new Map<string, Map<string, Data>>();
	const writes: Array<{ id: string; patch: Data }> = [];
	const store = (name: string) => {
		if (!stores.has(name)) stores.set(name, new Map());

		return stores.get(name) as Map<string, Data>;
	};
	const ref = (collection: string, id: string): FakeRef => ({
		collection,
		id,
		get: async () => snap(collection, id),
		update: async (patch) => {
			writes.push({ id, patch });
			const next: Data = { ...store(collection).get(id) };
			for (const [key, value] of Object.entries(patch)) setPath(next, key, value);
			store(collection).set(id, next);
		},
		set: async (value) => {
			store(collection).set(id, value);
		},
	});
	const snap = (collection: string, id: string): FakeDoc => {
		const value = store(collection).get(id);

		return { id, ref: ref(collection, id), exists: value !== undefined, data: () => value };
	};
	const makeQuery = (
		collection: string,
		equals?: Array<{ field: string; value: string | string[]; op?: string }>,
		pageSize = Number.MAX_SAFE_INTEGER,
		after?: string,
	) => ({
		where: (field: string, op: string, value: string | string[]) =>
			makeQuery(collection, [...(equals ?? []), { field, value, op }], pageSize, after),
		orderBy: () => makeQuery(collection, equals, pageSize, after),
		limit: (size: number) => makeQuery(collection, equals, size, after),
		startAfter: (id: string) => makeQuery(collection, equals, pageSize, id),
		get: async () => {
			const ids = [...store(collection).keys()]
				.sort()
				.filter((id) => !after || id > after)
				.filter((id) =>
					(equals ?? []).every(({ field, value, op }) => {
						const found = readPath(store(collection).get(id), field);

						return op === 'in' && Array.isArray(value)
							? value.includes(found as string)
							: found === value;
					}),
				)
				.slice(0, pageSize);
			const docs = ids.map((id) => snap(collection, id));

			return { docs, size: docs.length, empty: docs.length === 0 };
		},
	});
	const firestore = {
		collection: (name: string) => ({ ...makeQuery(name), doc: (id: string) => ref(name, id) }),
		getAll: async (...args: Array<FakeRef | object>) =>
			(args.filter((arg) => 'get' in arg) as FakeRef[]).map((r) => snap(r.collection, r.id)),
		batch: () => {
			const queued: Array<() => Promise<void>> = [];

			return {
				update: (target: FakeRef, patch: Data) => queued.push(() => target.update(patch)),
				commit: async () => {
					for (const run of queued) await run();
				},
			};
		},
		runTransaction: async (
			run: (tx: { get: (r: FakeRef) => Promise<FakeDoc>; update: FakeRef['update'] }) => unknown,
		) =>
			run({
				get: (r: FakeRef) => r.get(),
				update: ((r: FakeRef, patch: Data) => r.update(patch)) as unknown as FakeRef['update'],
			}),
	};

	return {
		db: firestore as unknown as Firestore,
		seed: (collection: string, id: string, value: Data) => store(collection).set(id, value),
		read: (collection: string, id: string) => store(collection).get(id),
		writes,
	};
}
