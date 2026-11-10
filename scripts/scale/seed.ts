/**
 * Builds the population with background triggers OFF: one question, its
 * subscribers, views, presence, and (in exposure.ts) the answers and ratings.
 * Document shapes follow the app's own writers; statements go through
 * createStatementObject and subscriptions through StatementSubscriptionSchema.
 */
import { initializeApp as initializeAdminApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DocumentData, Firestore, WriteBatch } from 'firebase-admin/firestore';
import {
	Access,
	Collections,
	createStatementObject,
	Role,
	StatementSubscriptionSchema,
	StatementType,
} from '@freedi/shared-types';
import type { Creator, Statement, StatementSubscription } from '@freedi/shared-types';
import { parse } from 'valibot';
import { EXPECTED_PROJECT_ID, SEED_BATCH, SOLO_HUB_PORT } from './config';
import type { ScaleConfig } from './config';

/** `DISCUSSABLE_STATEMENT_TYPES` in src/helpers/statementTypeHelpers.ts. */
export const DISCUSSABLE_TYPES: StatementType[] = Object.values(StatementType).filter(
	(type) =>
		type !== StatementType.document &&
		type !== StatementType.agreement &&
		type !== StatementType.paragraph,
);

export const TOP_ID = 'scale-top';
export const QUESTION_ID = 'scale-question';

export interface Seeded {
	db: Firestore;
	top: Statement;
	question: Statement;
	members: Creator[];
}

export function adminDb(): Firestore {
	if (getApps().length === 0) initializeAdminApp({ projectId: EXPECTED_PROJECT_ID });

	return getFirestore();
}

function hubUrl(pathname: string): string {
	return `http://localhost:${SOLO_HUB_PORT}${pathname}`;
}

async function hubRequest(pathname: string): Promise<void> {
	const response = await fetch(hubUrl(pathname), { method: 'PUT' });
	if (!response.ok) throw new Error(`Hub ${pathname} failed with ${response.status}`);
}

export const disableTriggers = (): Promise<void> =>
	hubRequest('/functions/disableBackgroundTriggers');
export const enableTriggers = (): Promise<void> =>
	hubRequest('/functions/enableBackgroundTriggers');

export async function clearEmulators(projectId: string): Promise<void> {
	const firestoreClear = await fetch(
		`http://localhost:8101/emulator/v1/projects/${projectId}/databases/(default)/documents`,
		{ method: 'DELETE' },
	);
	if (!firestoreClear.ok) throw new Error(`Firestore clear failed: ${firestoreClear.status}`);
	const authClear = await fetch(
		`http://localhost:9119/emulator/v1/projects/${projectId}/accounts`,
		{ method: 'DELETE', headers: { Authorization: 'Bearer owner' } },
	);
	if (!authClear.ok) throw new Error(`Auth clear failed: ${authClear.status}`);
}

/** Writes documents in Firestore-sized batches. */
export class BatchWriter {
	private batch: WriteBatch;
	private size = 0;
	written = 0;

	constructor(private readonly db: Firestore) {
		this.batch = db.batch();
	}

	set(collection: string, id: string, data: DocumentData): void {
		this.batch.set(this.db.collection(collection).doc(id), data);
		this.size += 1;
		this.written += 1;
	}

	async flushIfFull(): Promise<void> {
		if (this.size >= SEED_BATCH) await this.flush();
	}

	async flush(): Promise<void> {
		if (this.size === 0) return;
		await this.batch.commit();
		this.batch = this.db.batch();
		this.size = 0;
	}
}

export function memberCreator(id: string): Creator {
	return {
		uid: id,
		displayName: `Participant ${id}`,
		photoURL: null,
		isAnonymous: true,
		email: null,
	};
}

export function requireStatement(
	params: Parameters<typeof createStatementObject>[0],
	overrides: Partial<Statement>,
): Statement {
	const created = createStatementObject(params);
	if (!created) throw new Error(`createStatementObject rejected ${params.statementId}`);

	return { ...created, ...overrides };
}

export function subscriptionFor(user: Creator, statement: Statement): StatementSubscription {
	const now = Date.now();

	return parse(StatementSubscriptionSchema, {
		user,
		userId: user.uid,
		statementsSubscribeId: `${user.uid}--${statement.statementId}`,
		statement,
		role: Role.member,
		statementId: statement.statementId,
		lastUpdate: now,
		createdAt: now,
		getInAppNotification: true,
		getEmailNotification: false,
		getPushNotification: false,
		parentId: statement.parentId,
		statementType: statement.statementType,
		topParentId: statement.topParentId || statement.parentId,
	});
}

export function viewDoc(uid: string, questionId: string, topParentId: string): DocumentData {
	return {
		statementId: questionId,
		userId: uid,
		viewed: 1,
		lastViewed: Date.now(),
		parentDocumentId: topParentId,
	};
}

export function presenceDoc(user: Creator, questionId: string): DocumentData {
	return {
		statementId: questionId,
		onlineId: `${user.uid}--${questionId}`,
		user: {
			displayName: user.displayName,
			photoURL: user.photoURL ?? null,
			uid: user.uid,
			isAnonymous: user.isAnonymous ?? false,
			email: user.email ?? null,
			advanceUser: false,
		},
		lastUpdated: Date.now(),
		tabInFocus: true,
	};
}

export async function seedPopulation(db: Firestore, config: ScaleConfig): Promise<Seeded> {
	const owner = memberCreator('scale-owner');
	const openAccess = { membership: { access: Access.openToAll } };
	const top = requireStatement(
		{
			statementId: TOP_ID,
			statement: 'Scale baseline group',
			statementType: StatementType.group,
			parentId: 'top',
			topParentId: TOP_ID,
			creatorId: owner.uid,
			creator: owner,
		},
		openAccess,
	);
	const question = requireStatement(
		{
			statementId: QUESTION_ID,
			statement: 'What should the town build first?',
			statementType: StatementType.question,
			parentId: TOP_ID,
			topParentId: TOP_ID,
			parents: [TOP_ID],
			creatorId: owner.uid,
			creator: owner,
		},
		openAccess,
	);

	const writer = new BatchWriter(db);
	writer.set(Collections.statements, TOP_ID, top);
	writer.set(Collections.statements, QUESTION_ID, question);

	const members: Creator[] = [];
	for (let i = 0; i < config.members; i += 1) {
		const user = memberCreator(`m${String(i).padStart(5, '0')}`);
		members.push(user);
		writer.set(
			Collections.statementsSubscribe,
			`${user.uid}--${QUESTION_ID}`,
			subscriptionFor(user, question),
		);
		writer.set(
			Collections.statementsSubscribe,
			`${user.uid}--${TOP_ID}`,
			subscriptionFor(user, top),
		);
		writer.set(
			Collections.statementViews,
			`${user.uid}--${QUESTION_ID}`,
			viewDoc(user.uid, QUESTION_ID, TOP_ID),
		);
		writer.set(Collections.online, `${user.uid}--${QUESTION_ID}`, presenceDoc(user, QUESTION_ID));
		await writer.flushIfFull();
	}
	await writer.flush();

	return { db, top, question, members };
}
