/**
 * Server-side write helpers (§4). All chat writes go through the admin SDK
 * (security rules forbid client writes). Statements are built with
 * `createStatementObject()` (never hand-constructed) and then augmented with the
 * chat-specific denormalized fields the factory doesn't know about.
 */
import { error } from '@sveltejs/kit';
import {
	Collections,
	StatementType,
	EvidenceRelation,
	EvidenceStatus,
	Visibility,
	SourceApp,
	createStatementObject,
	getRandomUID,
} from '@freedi/shared-types';
import type { Statement, User } from '@freedi/shared-types';
import { assertAllowedEdge } from '@freedi/evidence';
import { adminDb } from './firebaseAdmin';
import { toNodeKind, resolveKind, composerChoicesFor, type ComposerChoice } from '$lib/chat/node';
import { getStatement } from './conversation';

const STATEMENTS = Collections.statements;

export interface SessionUser {
	uid: string;
	displayName: string | null;
	email: string | null;
	photoURL: string | null;
}

function toCreator(user: SessionUser): User {
	return {
		uid: user.uid,
		displayName: user.displayName ?? 'Anonymous',
		email: user.email,
		photoURL: user.photoURL,
		isAnonymous: false,
	};
}

export interface CreateRootInput {
	text: string;
	visibility?: Visibility;
	memberIds?: string[];
}

/** Create a new conversation root — a `question` with `isRoot: true` (§4.1). */
export async function createRootQuestion(
	user: SessionUser,
	input: CreateRootInput,
): Promise<Statement> {
	if (!input.text?.trim()) throw error(400, 'Question cannot be empty');

	// A root's id == its own topParentId; generate it up front.
	const id = getRandomUID();
	const visibility = input.visibility ?? Visibility.public;

	const base = createStatementObject({
		statement: input.text.trim(),
		statementType: StatementType.question,
		statementId: id,
		parentId: 'top',
		topParentId: id,
		creatorId: user.uid,
		creator: toCreator(user),
		sourceApp: SourceApp.CHAT,
	});
	if (!base) throw error(500, 'Failed to build question');

	const now = Date.now();
	const memberIds =
		visibility === Visibility.private ? [...new Set([user.uid, ...(input.memberIds ?? [])])] : undefined;

	const statement: Statement = {
		...base,
		isRoot: true,
		visibility,
		...(memberIds ? { memberIds } : {}),
		optionCount: 0,
		convergenceIndex: 0,
		lastActivityAt: now,
	};

	await adminDb.collection(STATEMENTS).doc(id).set(statement);

	return statement;
}

export interface SendMessageInput {
	parentId: string;
	kind: ComposerChoice;
	text: string;
}

/** Create a child node under a parent (§4.1). Returns the new statement. */
export async function sendMessage(user: SessionUser, input: SendMessageInput): Promise<Statement> {
	const { parentId, kind, text } = input;
	if (!text?.trim()) throw error(400, 'Empty message');

	const parent = await getStatement(parentId);
	if (!parent) throw error(404, 'Parent not found');

	// The composer can only offer choices valid for the parent type.
	if (!composerChoicesFor(parent.statementType).includes(kind)) {
		throw error(400, `Choice "${kind}" not allowed under a ${parent.statementType}`);
	}

	const { statementType, dialecticType } = resolveKind(kind);

	// Validate the containment edge (§1.1). No cycle check is needed: the child
	// is brand-new with a fresh id, so it can't already be an ancestor.
	assertAllowedEdge(toNodeKind(parent.statementType), toNodeKind(statementType));

	const base = createStatementObject({
		statement: text.trim(),
		statementType,
		parentId,
		topParentId: parent.topParentId || parent.statementId,
		creatorId: user.uid,
		creator: toCreator(user),
		sourceApp: SourceApp.CHAT,
	});
	if (!base) throw error(500, 'Failed to build statement');

	// Augment with chat-specific denormalized fields the factory omits.
	const now = Date.now();
	const statement: Statement = {
		...base,
		isRoot: false,
		dialecticType,
		visibility: parent.visibility ?? Visibility.public,
		...(parent.memberIds ? { memberIds: parent.memberIds } : {}),
		lastActivityAt: now,
		replyTo: {
			statementId: parent.statementId,
			statement: parent.statement.slice(0, 140),
			creatorDisplayName: parent.creator?.displayName ?? 'Anonymous',
		},
		...(statementType === StatementType.evidence
			? {
					relation: EvidenceRelation.neutral,
					evidenceStatus: EvidenceStatus.pending,
				}
			: {}),
		...(statementType === StatementType.question
			? { optionCount: 0, convergenceIndex: 0 }
			: {}),
	};

	await adminDb.collection(STATEMENTS).doc(statement.statementId).set(statement);

	// Bump lastActivityAt up the ancestry (the heavy recompute is the function's
	// job; this keeps discovery/ordering fresh immediately).
	await bumpActivity([...(parent.parents ?? []), parentId], now);

	return statement;
}

async function bumpActivity(ancestorIds: string[], now: number): Promise<void> {
	const batch = adminDb.batch();
	for (const id of new Set(ancestorIds)) {
		batch.update(adminDb.collection(STATEMENTS).doc(id), {
			lastActivityAt: now,
			lastUpdate: now,
		});
	}
	await batch.commit().catch(() => {
		/* best-effort */
	});
}

/** Toggle a ±1 evaluation (§4.2). evaluationId = uid--statementId. */
export async function evaluate(
	user: SessionUser,
	statementId: string,
	value: number,
): Promise<void> {
	const statement = await getStatement(statementId);
	if (!statement) throw error(404, 'Statement not found');
	if (statement.statementType !== StatementType.option && statement.statementType !== StatementType.evidence) {
		throw error(400, 'Only options and evidence are votable');
	}

	const evaluationId = `${user.uid}--${statementId}`;
	const ref = adminDb.collection(Collections.evaluations).doc(evaluationId);
	const existing = await ref.get();
	const now = Date.now();

	// Toggle off on re-click of the same direction.
	if (existing.exists && (existing.data()?.evaluation ?? 0) === value) {
		await ref.delete();
	} else {
		await ref.set({
			parentId: statement.parentId,
			evaluationId,
			statementId,
			evaluatorId: user.uid,
			updatedAt: now,
			evaluation: value,
			evaluator: toCreator(user),
		});
	}

	await adminDb
		.collection(STATEMENTS)
		.doc(statementId)
		.update({ lastActivityAt: now, lastUpdate: now })
		.catch(() => {
			/* best-effort */
		});
	// Ancestor C recompute is handled by the onCreateEvaluation function (Phase 5).
}
