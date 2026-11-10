import type { Firestore } from 'firebase-admin/firestore';
import { isLargeQuestionDigestItem } from '../largeQuestionDigestDelivery';

export interface Fake {
	db: Firestore;
	docs: Map<string, Record<string, unknown>>;
	limits: number[];
	question: { value: Record<string, unknown> | null };
	subscription: { value: Record<string, unknown> | null };
	settings: { value: Record<string, unknown> | null };
}

interface Filters {
	status?: unknown;
	deliverAtNull?: boolean;
	deliverAtBefore?: number;
	digestsOnly?: boolean;
}

export function fakeDb(): Fake {
	const docs = new Map<string, Record<string, unknown>>();
	const limits: number[] = [];
	const question = { value: {} as Record<string, unknown> | null };
	const subscription = {
		value: { getPushNotification: true, getEmailNotification: true } as Record<
			string,
			unknown
		> | null,
	};
	const settings = { value: null as Record<string, unknown> | null };

	const apply = (id: string, data: Record<string, unknown>) => {
		const next = { ...docs.get(id), ...data };
		for (const [field, value] of Object.entries(data)) {
			if ((value as { constructor?: { name?: string } })?.constructor?.name === 'DeleteTransform') {
				delete next[field];
			}
		}
		docs.set(id, next);
	};
	const docRef = (id: string) => ({
		id,
		get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
		update: async (data: Record<string, unknown>) => apply(id, data),
	});

	const matches = (id: string, doc: Record<string, unknown>, filters: Filters) => {
		const deliverAt = (doc.deliverAt ?? null) as number | null;

		return (
			doc.status === filters.status &&
			(!filters.digestsOnly || isLargeQuestionDigestItem(id)) &&
			(!filters.deliverAtNull || deliverAt === null) &&
			(filters.deliverAtBefore === undefined ||
				(deliverAt !== null && deliverAt <= filters.deliverAtBefore))
		);
	};

	const query = (filters: Filters, max?: number) => ({
		where: (field: unknown, op: string, value: unknown) => {
			if (field === 'status') return query({ ...filters, status: value }, max);
			if (field === 'deliverAt' && op === '==') {
				return query({ ...filters, deliverAtNull: true }, max);
			}
			if (field === 'deliverAt') {
				return query({ ...filters, deliverAtBefore: value as number }, max);
			}

			return query({ ...filters, digestsOnly: true }, max);
		},
		limit: (value: number) => query(filters, value),
		get: async () => {
			if (max !== undefined) limits.push(max);

			return {
				docs: [...docs.entries()]
					.filter(([id, doc]) => matches(id, doc, filters))
					.slice(0, max)
					.map(([id]) => ({ ref: docRef(id), data: () => docs.get(id) })),
			};
		},
	});

	const readOnlyDoc = (holder: { value: Record<string, unknown> | null }) => ({
		get: async () => ({ exists: holder.value !== null, data: () => holder.value ?? undefined }),
	});

	const db = {
		collection: (name: string) => {
			if (name === 'statements') return { doc: () => readOnlyDoc(question) };
			if (name === 'statementsSubscribe') return { doc: () => readOnlyDoc(subscription) };
			if (name === 'notificationSettings') return { doc: (id: string) => ({ id }) };

			return { ...query({}), doc: docRef };
		},
		getAll: async () => [{ exists: settings.value !== null, data: () => settings.value }],
		runTransaction: async (
			run: (transaction: {
				get: (ref: ReturnType<typeof docRef>) => Promise<unknown>;
				update: (ref: ReturnType<typeof docRef>, data: Record<string, unknown>) => void;
			}) => Promise<unknown>,
		) =>
			run({
				get: (ref) => ref.get(),
				update: (ref, data) => apply(ref.id, data),
			}),
	} as unknown as Firestore;

	return { db, docs, limits, question, subscription, settings };
}
