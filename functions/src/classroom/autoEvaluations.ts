import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import { CLASS_TABLES_COLLECTION, Collections } from '@freedi/shared-types';
import type {
	ClassTable,
	Evaluation,
	Statement,
	StatementSubscription,
} from '@freedi/shared-types';
import { subscriptionDocId } from './classroomAccess';

/**
 * Auto +1 (IA §9.1): a student never rates their own proposal or their own
 * table's answers; the server records a +1 by them instead, so the author's
 * agreement counts in the consensus and their list is shorter.
 *
 * Runs from the consolidated `onStatementCreated` trigger (no extra trigger,
 * no extra invocation per statement app-wide) when the new option carries a
 * `classTable` marker. The evaluations go through the same collection and the
 * same document shape Join's `setEvaluation` writes, so the existing
 * `newEvaluation` trigger updates `consensus` exactly as for a tap.
 */

export const AUTO_EVALUATION_SCORE = 1;
const ALREADY_EXISTS = 6; // gRPC status of create() on an existing document

/**
 * Document id of an auto +1: Join's own `${uid}--${optionId}`. Deliberately
 * the SAME id a tap would use: every evaluation document counts as one
 * evaluator in the consensus pipeline, so a separate `auto_…` id would count
 * the author twice the moment they also rated their item by hand (e.g. their
 * own proposal pinned in the plenum).
 */
export function autoEvaluationId(uid: string, optionId: string): string {
	return `${uid}--${optionId}`;
}

/**
 * Is the option inside lesson `mainId`? A lesson under a class home has the home
 * as topParentId (IA docs/ia/join-class-lesson-plan.md 9.2), so the lesson is
 * found in `parents`; an old top-level lesson is also its options' topParentId.
 */
export function isInLesson(
	option: Pick<Statement, 'topParentId' | 'parents'>,
	mainId: string,
): boolean {
	return (
		!!mainId &&
		(option.topParentId === mainId ||
			(Array.isArray(option.parents) && option.parents.includes(mainId)))
	);
}

/** The option's author: creatorId, falling back to creator.uid. */
function authorOf(option: Statement): string | undefined {
	return option.creatorId || option.creator?.uid || undefined;
}

/**
 * Who gets an auto +1: the author, plus the marker's co-authors who really
 * sit at that table. The marker is written by the client, so none of it is
 * trusted on its own: the table must exist, belong to this workspace and have
 * the author seated, or nobody gets a +1 (a forged marker on one's own option
 * must not earn a self +1); and `coAuthors` is intersected with the seated
 * members so a student cannot stamp +1s on behalf of any classmate.
 */
export function autoEvaluatorUids(option: Statement, table: ClassTable | undefined): string[] {
	const marker = option.classTable;
	const author = authorOf(option);
	if (!marker || !author) return [];
	const validTable =
		!!table && table.tableId === marker.tableId && isInLesson(option, table.mainId);
	if (!validTable || !table.memberUids.includes(author)) return [];
	const members = table.memberUids;
	const coAuthors = (marker.coAuthors ?? []).filter(
		(uid) => typeof uid === 'string' && members.includes(uid),
	);

	return [...new Set([author, ...coAuthors])];
}

export interface EvaluatorIdentity {
	uid: string;
	displayName: string;
	isAnonymous?: boolean;
}

export function buildAutoEvaluation(
	option: Statement,
	who: EvaluatorIdentity,
	now: number,
): Evaluation {
	return {
		parentId: option.parentId,
		evaluationId: autoEvaluationId(who.uid, option.statementId),
		statementId: option.statementId,
		evaluatorId: who.uid,
		updatedAt: now,
		evaluation: AUTO_EVALUATION_SCORE,
		evaluator: {
			uid: who.uid,
			displayName: who.displayName,
			photoURL: null,
			isAnonymous: who.isAnonymous ?? true,
		},
	};
}

/**
 * Should this option lock the table's writing mode? Only an answer to the
 * question the table is on right now: a late answer to the previous turn's
 * question (nextTurn already reset the table) or a proposal must not lock
 * the new turn's choice.
 */
export function shouldLockWriting(table: ClassTable | undefined, option: Statement): boolean {
	return (
		!!table &&
		!table.writingLocked &&
		isInLesson(option, table.mainId) &&
		typeof table.questionId === 'string' &&
		table.questionId === option.parentId
	);
}

function isAlreadyExists(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === ALREADY_EXISTS;
}

function identityOf(
	uid: string,
	option: Statement,
	sub: StatementSubscription | undefined,
): EvaluatorIdentity {
	if (uid === authorOf(option)) {
		return {
			uid,
			displayName: option.creator?.displayName ?? '',
			isAnonymous: option.creator?.isAnonymous,
		};
	}

	return { uid, displayName: sub?.user?.displayName ?? '', isAnonymous: sub?.user?.isAnonymous };
}

/**
 * Write the auto +1s (create-only: an evaluation that already exists — a
 * re-delivered event, or a hand rating — is left alone) and lock the table's
 * writing mode for the turn. Returns how many evaluations were created.
 */
export async function onClassOptionCreated(db: Firestore, option: Statement): Promise<number> {
	const marker = option.classTable;
	if (!marker || option.statementType !== 'option') return 0;
	if (typeof marker.tableId !== 'string' || !marker.tableId || marker.tableId.includes('/'))
		return 0;

	const tableDocRef = db.collection(CLASS_TABLES_COLLECTION).doc(marker.tableId);
	const tableSnap = await tableDocRef.get();
	const table = tableSnap.exists ? (tableSnap.data() as ClassTable) : undefined;
	const uids = autoEvaluatorUids(option, table);
	// The lesson comes from the (validated) table, never from topParentId: under a
	// class home, topParentId is the home. No uids means no valid table.
	const mainId = table?.mainId ?? '';
	const now = Date.now();

	const subSnaps =
		uids.length > 0
			? await db.getAll(
					...uids.map((uid) =>
						db.collection(Collections.statementsSubscribe).doc(subscriptionDocId(mainId, uid)),
					),
				)
			: [];
	const created = await Promise.all(
		uids.map(async (uid, i) => {
			const sub = subSnaps[i]?.exists ? (subSnaps[i].data() as StatementSubscription) : undefined;
			const ref = db
				.collection(Collections.evaluations)
				.doc(autoEvaluationId(uid, option.statementId));
			try {
				await ref.create(buildAutoEvaluation(option, identityOf(uid, option, sub), now));

				return true;
			} catch (error) {
				if (isAlreadyExists(error)) return false;
				throw error;
			}
		}),
	);

	if (shouldLockWriting(table, option)) {
		await db.runTransaction(async (tx) => {
			const fresh = await tx.get(tableDocRef);
			if (!shouldLockWriting(fresh.exists ? (fresh.data() as ClassTable) : undefined, option))
				return;
			tx.update(tableDocRef, { writingLocked: true, updatedAt: Date.now() });
		});
	}

	const count = created.filter(Boolean).length;
	logger.info('classroom: auto +1 written', {
		operation: 'classroom.onClassOptionCreated',
		statementId: option.statementId,
		tableId: marker.tableId,
		evaluations: count,
	});

	return count;
}
