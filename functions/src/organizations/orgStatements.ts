import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, type WriteBatch } from 'firebase-admin/firestore';
import {
	Access,
	Collections,
	Organization,
	OrganizationMember,
	QuestionProgress,
	QuestionStatus,
	QuestionType,
	SourceApp,
	Statement,
	StatementType,
	User,
	createStatementObject,
	defaultStatementSettings,
} from '@freedi/shared-types';
import { db } from '../db';
import { buildAdminSubscription } from './orgAuth';

/**
 * Builders shared by `fn_createOrgStatement` (one statement per call) and
 * `fn_studioPlanBuild` (a whole plan in one go). Pure builders return the
 * documents; `*Writes` helpers return batch closures so callers can commit
 * in chunks (`commitInChunks` in orgAuth.ts).
 */

export type OrgStatementKind = 'topQuestion' | 'massConsensus' | 'join' | 'question' | 'document';
/** Child questions (activities that are questions). Documents have their own builder. */
export type OrgChildKind = Exclude<OrgStatementKind, 'topQuestion' | 'document'>;

export type BatchWrite = (batch: WriteBatch) => void;

/** Org member acting on the organization's questions (caller). */
export type OrgActorMember = Pick<
	OrganizationMember,
	'userId' | 'displayName' | 'email' | 'organizationId'
>;

export interface OrgStatementActor {
	uid: string;
	user: User;
	member: OrgActorMember;
}

export const CHILD_MARKERS: Record<
	OrgChildKind,
	{ sourceApp: SourceApp; questionType: QuestionType }
> = {
	massConsensus: {
		sourceApp: SourceApp.MASS_CONSENSUS,
		questionType: QuestionType.massConsensus,
	},
	join: { sourceApp: SourceApp.JOIN, questionType: QuestionType.simple },
	question: { sourceApp: SourceApp.MAIN, questionType: QuestionType.simple },
};

export async function loadCallerUser(
	uid: string,
	fallback: { email: string | null; displayName: string },
): Promise<User> {
	const snap = await db.collection(Collections.users).doc(uid).get();
	const stored = snap.exists ? (snap.data() as Partial<User>) : undefined;

	return {
		uid,
		displayName: stored?.displayName?.trim() || fallback.displayName,
		email: stored?.email ?? fallback.email ?? '',
		photoURL: stored?.photoURL ?? '',
		isAnonymous: false,
	};
}

export function seedProgress(
	statementId: string,
	topParentId: string,
	organizationId: string,
	now: number,
): QuestionProgress {
	return {
		statementId,
		topParentId,
		organizationId,
		entered: 0,
		suggested: 0,
		evaluated: 0,
		options: 0,
		evaluations: 0,
		lastActivity: now,
		lastUpdate: now,
	};
}

export interface BuildTopQuestionInput {
	statementId: string;
	organization: Organization;
	actor: OrgStatementActor;
	title: string;
	description?: string;
	access?: Access;
	questionStatus: QuestionStatus;
}

/** A top question owned by the organization (`parentId 'top'`). */
export function buildTopQuestion(input: BuildTopQuestionInput): Statement {
	const { statementId, organization, actor, title, description, access, questionStatus } = input;
	const statement = createStatementObject({
		statement: title,
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: statementId,
		statementId,
		creatorId: actor.uid,
		creator: actor.user,
		statementSettings: { ...defaultStatementSettings, questionStatus },
		sourceApp: SourceApp.MAIN,
	});
	if (!statement) {
		throw new HttpsError('internal', 'Failed to build the question');
	}
	statement.organizationId = organization.organizationId;
	statement.membership = {
		access: access ?? organization.defaultAccess ?? Access.openToAll,
	};
	statement.questionSettings = { questionType: QuestionType.simple };
	if (description) statement.description = description;

	return statement;
}

export interface TopQuestionWritesInput {
	statement: Statement;
	organizationId: string;
	admins: OrgActorMember[];
	now: number;
}

/**
 * Batch writes for a new top question: the statement, an admin subscription
 * per org admin, the organization's question counter and the progress seed.
 */
export function topQuestionWrites(input: TopQuestionWritesInput): BatchWrite[] {
	const { statement, organizationId, admins, now } = input;
	const writes: BatchWrite[] = [];
	writes.push((batch) =>
		batch.set(db.collection(Collections.statements).doc(statement.statementId), statement),
	);
	admins.forEach((admin) => {
		const sub = buildAdminSubscription(statement, admin, now);
		writes.push((batch) =>
			batch.set(db.collection(Collections.statementsSubscribe).doc(sub.statementsSubscribeId), sub),
		);
	});
	writes.push((batch) =>
		batch.update(db.collection(Collections.organizations).doc(organizationId), {
			questionCount: FieldValue.increment(1),
			lastUpdate: now,
		}),
	);
	writes.push((batch) =>
		batch.set(
			db.collection(Collections.questionProgress).doc(statement.statementId),
			seedProgress(statement.statementId, statement.statementId, organizationId, now),
		),
	);

	return writes;
}

export interface BuildChildQuestionInput {
	statementId: string;
	parent: Statement;
	kind: OrgChildKind;
	actor: OrgStatementActor;
	title: string;
	description?: string;
	order: number;
	questionStatus: QuestionStatus;
}

/** A sub-question (activity) under an org top question. */
export function buildChildQuestion(input: BuildChildQuestionInput): Statement {
	const { statementId, parent, kind, actor, title, description, order, questionStatus } = input;
	const markers = CHILD_MARKERS[kind];
	const statement = createStatementObject({
		statement: title,
		statementType: StatementType.question,
		parentId: parent.statementId,
		topParentId: parent.statementId,
		parents: [parent.statementId],
		statementId,
		creatorId: actor.uid,
		creator: actor.user,
		statementSettings: { ...defaultStatementSettings, questionStatus },
		sourceApp: markers.sourceApp,
	});
	if (!statement) {
		throw new HttpsError('internal', 'Failed to build the question');
	}
	statement.order = order;
	statement.questionSettings = { questionType: markers.questionType };
	if (description) statement.description = description;

	return statement;
}

export interface ChildQuestionWritesInput {
	statement: Statement;
	parent: Statement;
	organizationId: string;
	kind: OrgChildKind;
	actor: OrgStatementActor;
	now: number;
	/** Whether the caller already has a subscription on the top question (join only). */
	topSubExists: boolean;
}

/**
 * Batch writes for a new child question: statement + progress seed, and for
 * Join activities the `openedInJoin` marker on the caller's top-question
 * subscription (so the Join app's "Main" list shows the hub — mirrors
 * apps/join/src/lib/joinSubscriptions.ts).
 */
export function childQuestionWrites(input: ChildQuestionWritesInput): BatchWrite[] {
	const { statement, parent, organizationId, kind, actor, now, topSubExists } = input;
	const writes: BatchWrite[] = [];
	writes.push((batch) =>
		batch.set(db.collection(Collections.statements).doc(statement.statementId), statement),
	);
	writes.push((batch) =>
		batch.set(
			db.collection(Collections.questionProgress).doc(statement.statementId),
			seedProgress(statement.statementId, parent.statementId, organizationId, now),
		),
	);
	if (kind === 'join') {
		const topSubRef = db
			.collection(Collections.statementsSubscribe)
			.doc(`${actor.uid}--${parent.statementId}`);
		if (topSubExists) {
			writes.push((batch) =>
				batch.set(topSubRef, { openedInJoin: now, lastUpdate: now }, { merge: true }),
			);
		} else {
			const sub = buildAdminSubscription(parent, actor.member, now);
			writes.push((batch) => batch.set(topSubRef, { ...sub, openedInJoin: now }));
		}
	}

	return writes;
}

export interface BuildDocumentChildInput {
	statementId: string;
	parent: Statement;
	actor: OrgStatementActor;
	title: string;
	description?: string;
	order: number;
	/** true → visible + open for comment; false → hidden in Sign (admin review). */
	openNow: boolean;
}

/**
 * A Sign document (activity) under an org top question. Sign reads
 * `signSettings` (an ad-hoc map outside the Statement schema), so it is
 * attached after `createStatementObject` validated the base object.
 */
export function buildDocumentChild(input: BuildDocumentChildInput): Statement {
	const { statementId, parent, actor, title, description, order, openNow } = input;
	const statement = createStatementObject({
		statement: title,
		statementType: StatementType.document,
		parentId: parent.statementId,
		topParentId: parent.statementId,
		parents: [parent.statementId],
		statementId,
		creatorId: actor.uid,
		creator: actor.user,
		statementSettings: {
			...defaultStatementSettings,
			hasChildren: true,
			questionStatus: openNow ? 'live' : 'frozen',
		},
		sourceApp: SourceApp.SIGN,
	});
	if (!statement) {
		throw new HttpsError('internal', 'Failed to build the document');
	}
	statement.order = order;
	statement.isDocument = true;
	if (description) statement.description = description;
	const withSign = statement as Statement & { signSettings: Record<string, unknown> };
	withSign.signSettings = {
		isHidden: !openNow,
		isPublic: true,
		isFrozen: false,
		enableSuggestions: openNow,
	};

	return withSign;
}

export function documentChildWrites(input: {
	statement: Statement;
	parent: Statement;
	organizationId: string;
	now: number;
}): BatchWrite[] {
	const { statement, parent, organizationId, now } = input;

	return [
		(batch) =>
			batch.set(db.collection(Collections.statements).doc(statement.statementId), statement),
		(batch) =>
			batch.set(
				db.collection(Collections.questionProgress).doc(statement.statementId),
				seedProgress(statement.statementId, parent.statementId, organizationId, now),
			),
	];
}

export async function callerHasTopSubscription(uid: string, topId: string): Promise<boolean> {
	const snap = await db.collection(Collections.statementsSubscribe).doc(`${uid}--${topId}`).get();

	return snap.exists;
}

/** `max(sibling.order) + 1` under `parentId` (0 when there are no ordered siblings). */
export async function nextChildOrder(parentId: string): Promise<number> {
	const siblingsSnap = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.get();
	const maxOrder = siblingsSnap.docs.reduce((max, doc) => {
		const order = (doc.data() as Statement).order;

		return typeof order === 'number' && order > max ? order : max;
	}, -1);

	return maxOrder + 1;
}

/** Loads a top question and checks it is a top question of `organizationId`. */
export async function loadOrgTopQuestion(
	parentId: string,
	organizationId: string,
): Promise<Statement> {
	const parentSnap = await db.collection(Collections.statements).doc(parentId).get();
	if (!parentSnap.exists) {
		throw new HttpsError('not-found', 'Parent question not found');
	}
	const parent = parentSnap.data() as Statement;
	if (parent.parentId !== 'top') {
		throw new HttpsError(
			'failed-precondition',
			'Sub-questions can only be added under a top question',
		);
	}
	if (parent.organizationId !== organizationId) {
		throw new HttpsError(
			'permission-denied',
			'Parent question belongs to a different organization',
		);
	}

	return parent;
}
