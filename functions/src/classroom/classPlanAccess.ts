import type { Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { CLASS_GAMES_SUBCOLLECTION, CLASS_PLANS_COLLECTION } from '@freedi/shared-types';
import type { ClassGame, ClassPlan, User } from '@freedi/shared-types';
import { ClassroomError } from './classroomErrors';

/**
 * Reads of the teacher-owned lesson plans and games (`classPlans/{planId}` and
 * `classPlans/{planId}/games/{gameId}`). Both are owner-scoped: a plan or game
 * of another teacher answers permission-denied, never its content.
 */

export function planRef(firestore: Firestore, planId: string) {
	return firestore.collection(CLASS_PLANS_COLLECTION).doc(planId);
}

export function gameRef(firestore: Firestore, planId: string, gameId: string) {
	return planRef(firestore, planId).collection(CLASS_GAMES_SUBCOLLECTION).doc(gameId);
}

/** The plan, refused unless it exists and the actor owns it. */
export async function loadOwnPlan(
	firestore: Firestore,
	actorUid: string,
	planId: string,
): Promise<ClassPlan> {
	const snap = await planRef(firestore, planId).get();
	if (!snap.exists) throw new ClassroomError('not-found', 'Lesson plan not found');
	const plan = snap.data() as ClassPlan;
	if (plan.ownerUid !== actorUid) {
		throw new ClassroomError('permission-denied', 'That lesson plan is not yours');
	}

	return plan;
}

/** The game, refused unless it exists under that plan and the actor owns it. */
export async function loadOwnGame(
	firestore: Firestore,
	actorUid: string,
	planId: string,
	gameId: string,
): Promise<ClassGame> {
	const snap = await gameRef(firestore, planId, gameId).get();
	if (!snap.exists) throw new ClassroomError('not-found', 'Game not found');
	const game = snap.data() as ClassGame;
	if (game.ownerUid !== actorUid || game.planId !== planId) {
		throw new ClassroomError('permission-denied', 'That game is not yours');
	}

	return game;
}

/** The signed-in caller as a statement creator: uid + display name from the token. */
export function actorUserOf<T>(request: CallableRequest<T>, uid: string): User {
	const name = request.auth?.token?.name;

	return {
		uid,
		displayName: typeof name === 'string' ? name : '',
		isAnonymous: request.auth?.token?.firebase?.sign_in_provider === 'anonymous',
	};
}
