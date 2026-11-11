import {
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
	type LargeQuestionDigestMarker,
	type StatementSubscription,
} from '@freedi/shared-types';
import type { Firestore } from 'firebase-admin/firestore';
import { LARGE_QUESTION_DIGEST_OWNER } from '../largeQuestionDigest';

export const HOUR = 60 * 60 * 1000;
export const MORNING = Date.UTC(2026, 10, 10, 6);
export const QUEUE = 'notificationQueue';

export interface FakeRef {
	id: string;
	collection: string;
}

export interface PushDoc {
	token: string;
	userId: string;
	app?: string;
}

export interface FakeOptions {
	settings?: Record<string, Record<string, unknown>>;
	pushDocs?: PushDoc[];
	question?: Record<string, unknown> | null;
	failCreate?: (id: string) => boolean;
}

export interface FakeDb {
	db: Firestore;
	docs: Map<string, Record<string, unknown>>;
	queryLimits: number[];
}

export type Subscription = Partial<StatementSubscription> & { userId: string };

export function fakeDb(subscriptions: Subscription[], options: FakeOptions = {}): FakeDb {
	const { settings = {}, pushDocs = [], failCreate = () => false } = options;
	const question = options.question === undefined ? {} : options.question;
	const docs = new Map<string, Record<string, unknown>>();
	const queryLimits: number[] = [];
	const key = (collection: string, id: string) => `${collection}/${id}`;
	const alreadyExists = () => Object.assign(new Error('exists'), { code: 6 });

	const docRef = (collection: string, id: string) => ({
		id,
		collection,
		get: async () => {
			const value = collection === 'statements' ? question : docs.get(key(collection, id));

			return { exists: value !== null && value !== undefined, data: () => value };
		},
		create: async (data: Record<string, unknown>) => {
			if (docs.has(key(collection, id))) throw alreadyExists();
			docs.set(key(collection, id), data);
		},
		update: async (data: Record<string, unknown>) => {
			docs.set(key(collection, id), { ...docs.get(key(collection, id)), ...data });
		},
	});

	const dueMarkers = (filters: Record<string, unknown>, max?: number) =>
		[...docs.entries()]
			.filter(
				([path, doc]) =>
					path.startsWith(`${QUEUE}/`) &&
					doc.status === filters.status &&
					typeof doc.deliverAt === 'number' &&
					doc.deliverAt <= (filters.deliverAt as number),
			)
			.slice(0, max)
			.map(([path]) => ({
				ref: docRef(QUEUE, path.slice(QUEUE.length + 1)),
				data: () => docs.get(path),
			}));

	const matchingSubscriptions = (filters: Record<string, unknown>) =>
		subscriptions
			.filter((sub) =>
				Object.entries(filters).every(
					([field, value]) => field === 'statementId' || sub[field as keyof Subscription] === value,
				),
			)
			.map((sub) => ({ data: () => sub }));

	const collection = (name: string) => {
		if (name === 'pushNotifications') {
			return {
				where: (_field: string, _op: string, userIds: string[]) => ({
					select: () => ({
						get: async () => ({
							docs: pushDocs
								.filter((doc) => userIds.includes(doc.userId))
								.map((doc) => ({ id: doc.token, data: () => doc })),
						}),
					}),
				}),
			};
		}

		const query = (filters: Record<string, unknown>, max?: number) => ({
			where: (field: string, _op: string, value: unknown) =>
				query({ ...filters, [field]: value }, max),
			limit: (value: number) => query(filters, value),
			get: async () => {
				if (name !== QUEUE) return { docs: matchingSubscriptions(filters) };
				if (max !== undefined) queryLimits.push(max);

				return { docs: dueMarkers(filters, max) };
			},
		});

		return { ...query({}), doc: (id: string) => docRef(name, id) };
	};

	const db = {
		collection,
		getAll: async (...refs: FakeRef[]) =>
			refs.map((ref) => ({ exists: ref.id in settings, data: () => settings[ref.id] })),
		bulkWriter: () => ({
			onWriteError: jest.fn(),
			close: async () => undefined,
			create: async (ref: FakeRef, data: Record<string, unknown>) => {
				if (failCreate(ref.id)) throw Object.assign(new Error('unavailable'), { code: 14 });
				if (docs.has(key(ref.collection, ref.id))) throw alreadyExists();
				docs.set(key(ref.collection, ref.id), data);
			},
		}),
	} as unknown as Firestore;

	return { db, docs, queryLimits };
}

export function sub(uid: string, extra: Partial<StatementSubscription> = {}): Subscription {
	return {
		userId: uid,
		user: { uid } as StatementSubscription['user'],
		getInAppNotification: true,
		getPushNotification: true,
		tokens: [`${uid}-token`],
		...extra,
	};
}

export function marker(
	overrides: Partial<LargeQuestionDigestMarker> = {},
): LargeQuestionDigestMarker {
	return {
		queueItemId: 'largeQuestionDigest_q1_1',
		userId: LARGE_QUESTION_DIGEST_OWNER,
		title: 'title',
		body: 'the question',
		channels: [],
		sourceApp: SourceApp.MAIN,
		targetPath: '/statement/q1',
		deliverAt: MORNING - HOUR,
		frequency: NotificationFrequency.DAILY,
		triggerType: NotificationTriggerType.DAILY_DIGEST,
		parentId: 'q1',
		status: NotificationQueueStatus.SKIPPED,
		createdAt: 1,
		firstAuthorUid: 'first-author',
		multipleAuthors: false,
		...overrides,
	};
}
