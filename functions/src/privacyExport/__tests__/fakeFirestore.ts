/**
 * In-memory Firestore for the privacy export tests: `collection().where()...get()`
 * with `==` and `in`, and `collection().doc(id).get()`. Read-only, which is all
 * the export does.
 */

export type FakeDoc = Record<string, unknown>;
export type FakeData = Record<string, FakeDoc[]>;

interface Filter {
	field: string;
	op: string;
	value: unknown;
}

function matches(doc: FakeDoc, filters: Filter[]): boolean {
	return filters.every(({ field, op, value }) => {
		if (op === '==') return doc[field] === value;
		if (op === 'in') return Array.isArray(value) && value.includes(doc[field]);
		throw new Error(`fakeFirestore: unsupported op ${op}`);
	});
}

function query(docs: FakeDoc[], filters: Filter[]) {
	return {
		where: (field: string, op: string, value: unknown) =>
			query(docs, [...filters, { field, op, value }]),
		get: async () => ({
			docs: docs.filter((d) => matches(d, filters)).map((d) => ({ data: () => d })),
		}),
	};
}

export function createFakeFirestore(data: FakeData) {
	return {
		collection: (name: string) => {
			const docs = data[name] ?? [];

			return {
				...query(docs, []),
				doc: (id: string) => ({
					get: async () => {
						const found = docs.find((d) => d.statementId === id);

						return { exists: !!found, data: () => found };
					},
				}),
			};
		},
	};
}
