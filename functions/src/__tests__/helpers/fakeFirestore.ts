/**
 * In-memory Firestore for the endpoint authorization tests. Reads come from
 * `docs` keyed `collection/id`; writes are only recorded.
 */

export const docs = new Map<string, Record<string, unknown>>();
export const batchUpdates: string[] = [];

export interface FakeSnap {
	exists: boolean;
	id: string;
	ref: { path: string };
	data: () => Record<string, unknown> | undefined;
	get: (field: string) => unknown;
}

function makeSnap(path: string): FakeSnap {
	const data = docs.get(path);

	return {
		exists: data !== undefined,
		id: path.split('/').pop() ?? '',
		ref: { path },
		data: () => data,
		get: (field: string) => data?.[field],
	};
}

function makeQuery(collection: string) {
	const conditions: Array<[string, string, unknown]> = [];
	const query = {
		where: (field: string, op: string, value: unknown) => {
			conditions.push([field, op, value]);

			return query;
		},
		orderBy: () => query,
		limit: () => query,
		get: async () => {
			const matched = [...docs.entries()]
				.filter(([path]) => path.startsWith(`${collection}/`))
				.filter(([, data]) => conditions.every(([field, , value]) => data[field] === value))
				.map(([path]) => makeSnap(path));

			return { empty: matched.length === 0, size: matched.length, docs: matched };
		},
	};

	return query;
}

export function fakeCollection(collection: string) {
	return {
		doc: (id?: string) => {
			const path = `${collection}/${id ?? 'new-doc-id'}`;

			return {
				id: id ?? 'new-doc-id',
				path,
				get: async () => makeSnap(path),
				set: async (data: Record<string, unknown>) => {
					docs.set(path, data);
				},
				create: async (data: Record<string, unknown>) => {
					docs.set(path, data);
				},
				collection: (sub: string) => fakeCollection(`${path}/${sub}`),
			};
		},
		add: async () => ({ id: 'added-id' }),
		...makeQuery(collection),
	};
}

export const fakeDb = {
	collection: fakeCollection,
	batch: () => ({
		set: () => undefined,
		update: (ref: { path: string }) => {
			batchUpdates.push(ref.path);
		},
		delete: () => undefined,
		commit: async () => undefined,
	}),
};

export function makeRes() {
	const res = {
		statusCode: 200,
		body: undefined as unknown,
		status(code: number) {
			res.statusCode = code;

			return res;
		},
		json(body: unknown) {
			res.body = body;

			return res;
		},
		send(body: unknown) {
			res.body = body;

			return res;
		},
	};

	return res;
}
