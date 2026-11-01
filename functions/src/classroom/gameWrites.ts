import type { Firestore } from 'firebase-admin/firestore';
import {
	CLASS_GAMES_SUBCOLLECTION,
	CLASS_PLAN_TITLE_MAX_LENGTH,
	Collections,
	StatementType,
	flattenLines,
} from '@freedi/shared-types';
import type {
	ClassGame,
	ClassGameSnapshot,
	ClassPlan,
	ClassSnapshotGameResponse,
	Statement,
} from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';
import { gameRef, planRef } from './classPlanAccess';

/**
 * Game writes shared by classSnapshotGame, classCloneLesson and the class-lesson
 * migration. No `db` import here, so scripts can use it with their own Firestore.
 */

/** A plan or game title: one line, capped; `fallback` when empty. */
export function cleanTitle(value: unknown, fallback: string): string {
	if (value !== undefined && value !== null && typeof value !== 'string') {
		throw new ClassroomError('invalid-argument', 'title is not valid');
	}
	const title = flattenLines(value ?? '') || flattenLines(fallback);

	return title.slice(0, CLASS_PLAN_TITLE_MAX_LENGTH);
}

export async function loadLessonChildren(
	firestore: Firestore,
	lessonId: string,
): Promise<Statement[]> {
	const statements = firestore.collection(Collections.statements);
	const [questions, paragraphs] = await Promise.all([
		statements
			.where('parentId', '==', lessonId)
			.where('statementType', '==', StatementType.question)
			.get(),
		statements
			.where('parentId', '==', lessonId)
			.where('statementType', '==', StatementType.paragraph)
			.get(),
	]);

	return [...questions.docs, ...paragraphs.docs].map((d) => d.data() as Statement);
}

export interface WriteGameInput {
	planId: string;
	gameId: string;
	ownerUid: string;
	title: string;
	snapshot: ClassGameSnapshot;
	sourceMainId: string;
	/** Made when the plan is missing; null = the plan must exist. */
	planIfMissing: ClassPlan | null;
	now: number;
}

/**
 * Writes the game (and the plan when missing and allowed) in one transaction.
 * The game's `order` is the plan's current game count. Idempotent on gameId.
 */
export async function writeGameFromLesson(
	firestore: Firestore,
	input: WriteGameInput,
): Promise<ClassSnapshotGameResponse> {
	const pRef = planRef(firestore, input.planId);
	const gRef = gameRef(firestore, input.planId, input.gameId);

	return firestore.runTransaction(async (tx) => {
		const existing = await tx.get(gRef);
		if (existing.exists) {
			const found = existing.data() as ClassGame;
			if (found.ownerUid === input.ownerUid && found.sourceMainId === input.sourceMainId) {
				return { planId: input.planId, gameId: input.gameId, reused: true };
			}
			throw new ClassroomError('already-exists', 'That game id is taken');
		}
		const planSnap = await tx.get(pRef);
		if (planSnap.exists) {
			if ((planSnap.data() as ClassPlan).ownerUid !== input.ownerUid) {
				throw new ClassroomError('permission-denied', 'That lesson plan is not yours');
			}
		} else if (!input.planIfMissing) {
			throw new ClassroomError('not-found', 'Lesson plan not found');
		}
		const games = await tx.get(pRef.collection(CLASS_GAMES_SUBCOLLECTION));

		if (!planSnap.exists && input.planIfMissing) tx.create(pRef, input.planIfMissing);
		const game: ClassGame = {
			gameId: input.gameId,
			planId: input.planId,
			ownerUid: input.ownerUid,
			title: input.title,
			order: games.size,
			snapshot: input.snapshot,
			sourceMainId: input.sourceMainId,
			createdAt: input.now,
			lastUpdate: input.now,
		};
		tx.create(gRef, game);
		if (planSnap.exists) tx.update(pRef, { lastUpdate: input.now });

		return { planId: input.planId, gameId: input.gameId, reused: false };
	});
}
