import {
	CLASS_GAMES_SUBCOLLECTION,
	CLASS_PLANS_COLLECTION,
	CLASS_PLAN_TITLE_MAX_LENGTH,
} from '@freedi/shared-types';
import type { ClassGame, ClassGameSnapshot, ClassPlan } from '@freedi/shared-types';
import { collection, db, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from './firebase';
import type { Unsubscribe } from './firebase';
import { resilientOnSnapshot } from './resilientListeners';

/**
 * The teacher's lesson plans and their games (docs/ia/join-class-lesson-plan.md
 * 2 and 9.1): `classPlans/{planId}` and `classPlans/{planId}/games/{gameId}`.
 * Both are data, not statements; the rules let only the owner read and write
 * them and never delete. Every list query filters on `ownerUid`, which is what
 * lets the rules prove the read. Times are milliseconds.
 */

export const GAME_TITLE_MAX_LENGTH = CLASS_PLAN_TITLE_MAX_LENGTH;

function gamesOf(planId: string) {
	return collection(db, CLASS_PLANS_COLLECTION, planId, CLASS_GAMES_SUBCOLLECTION);
}

function planOf(raw: Partial<ClassPlan>, id: string): ClassPlan | null {
	if (typeof raw.title !== 'string' || typeof raw.ownerUid !== 'string') return null;

	return {
		planId: id,
		title: raw.title,
		ownerUid: raw.ownerUid,
		createdAt: raw.createdAt ?? 0,
		lastUpdate: raw.lastUpdate ?? 0,
	};
}

/** A game doc, or null when it is not a usable game (no title / snapshot / owner). */
export function gameOf(raw: Partial<ClassGame>, planId: string, id: string): ClassGame | null {
	if (typeof raw.title !== 'string' || typeof raw.ownerUid !== 'string') return null;
	const snapshot = raw.snapshot;
	if (!snapshot || !Array.isArray(snapshot.questions)) return null;

	return {
		gameId: id,
		planId,
		ownerUid: raw.ownerUid,
		title: raw.title,
		order: raw.order ?? 0,
		snapshot: {
			...snapshot,
			paragraphs: snapshot.paragraphs ?? [],
			introVideos: snapshot.introVideos ?? [],
			settings: snapshot.settings ?? {},
		},
		...(raw.sourceMainId ? { sourceMainId: raw.sourceMainId } : {}),
		createdAt: raw.createdAt ?? 0,
		lastUpdate: raw.lastUpdate ?? 0,
	};
}

/** Live list of the teacher's plans. */
export function subscribeToClassPlans(uid: string, cb: (plans: ClassPlan[]) => void): Unsubscribe {
	return resilientOnSnapshot(
		'classPlans',
		query(collection(db, CLASS_PLANS_COLLECTION), where('ownerUid', '==', uid)),
		(snap) => {
			cb(
				snap.docs
					.map((d) => planOf(d.data() as Partial<ClassPlan>, d.id))
					.filter((p): p is ClassPlan => p !== null),
			);
		},
		(err) => {
			console.error('[classPlans] subscribeToClassPlans failed:', err);
			cb([]);
		},
	);
}

/** One plan, live. `null` when it does not exist or is not the caller's (the rules answer both alike). */
export function subscribeToPlan(
	planId: string,
	cb: (plan: ClassPlan | null) => void,
	onError: (err: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		`classPlan:${planId}`,
		doc(db, CLASS_PLANS_COLLECTION, planId),
		(snap) => cb(snap.exists() ? planOf(snap.data() as Partial<ClassPlan>, snap.id) : null),
		onError,
	);
}

/** Live games of one plan, in their order. */
export function subscribeToGames(
	planId: string,
	uid: string,
	cb: (games: ClassGame[]) => void,
	onError: (err: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		`classGames:${planId}`,
		query(gamesOf(planId), where('ownerUid', '==', uid)),
		(snap) => {
			cb(
				snap.docs
					.map((d) => gameOf(d.data() as Partial<ClassGame>, planId, d.id))
					.filter((g): g is ClassGame => g !== null)
					.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
			);
		},
		onError,
	);
}

/** One game, live. `null` when it does not exist or is not the caller's. */
export function subscribeToGame(
	planId: string,
	gameId: string,
	cb: (game: ClassGame | null) => void,
	onError: (err: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		`classGame:${gameId}`,
		doc(db, CLASS_PLANS_COLLECTION, planId, CLASS_GAMES_SUBCOLLECTION, gameId),
		(snap) => cb(snap.exists() ? gameOf(snap.data() as Partial<ClassGame>, planId, snap.id) : null),
		onError,
	);
}

/** One `get` of a plan's games (the copy list, the plan row's game count). */
export async function loadGames(planId: string, uid: string): Promise<ClassGame[]> {
	const snap = await getDocs(query(gamesOf(planId), where('ownerUid', '==', uid)));

	return snap.docs
		.map((d) => gameOf(d.data() as Partial<ClassGame>, planId, d.id))
		.filter((g): g is ClassGame => g !== null)
		.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function cleanTitle(title: string): string {
	return title.replace(/\s+/g, ' ').trim().slice(0, CLASS_PLAN_TITLE_MAX_LENGTH);
}

/** Writes a new plan doc. Throws when the write fails. Safe to repeat with the same id. */
export async function writePlan(planId: string, title: string, ownerUid: string): Promise<void> {
	const now = Date.now();
	await setDoc(doc(db, CLASS_PLANS_COLLECTION, planId), {
		planId,
		title: cleanTitle(title),
		ownerUid,
		createdAt: now,
		lastUpdate: now,
	});
}

/** The plan exists already (a retry after a half-finished create): keep it, do not rewrite its dates. */
export async function ensurePlan(planId: string, title: string, ownerUid: string): Promise<void> {
	const ref = doc(db, CLASS_PLANS_COLLECTION, planId);
	if ((await getDoc(ref)).exists()) return;
	await writePlan(planId, title, ownerUid);
}

/**
 * Renames a plan. Only a plan with a doc can be renamed: the doc of an old lesson's plan
 * (planId = the lesson's id) is made by the server alone (classSnapshotGame), never here.
 */
export async function renamePlan(planId: string, title: string): Promise<void> {
	await updateDoc(doc(db, CLASS_PLANS_COLLECTION, planId), {
		title: cleanTitle(title),
		lastUpdate: Date.now(),
	});
}

export interface NewGame {
	planId: string;
	gameId: string;
	title: string;
	order: number;
	snapshot: ClassGameSnapshot;
	ownerUid: string;
	sourceMainId?: string;
}

/**
 * Writes a game doc (the plan must exist), then bumps the plan's `lastUpdate` so the
 * home lists it by activity. Safe to repeat with the same game id.
 */
export async function writeGame(game: NewGame): Promise<void> {
	const now = Date.now();
	await setDoc(
		doc(db, CLASS_PLANS_COLLECTION, game.planId, CLASS_GAMES_SUBCOLLECTION, game.gameId),
		{
			gameId: game.gameId,
			planId: game.planId,
			ownerUid: game.ownerUid,
			title: cleanTitle(game.title),
			order: game.order,
			snapshot: game.snapshot,
			...(game.sourceMainId ? { sourceMainId: game.sourceMainId } : {}),
			createdAt: now,
			lastUpdate: now,
		},
	);
	await touchPlan(game.planId);
}

/** Replaces a game's snapshot (the game screen's saves). */
export async function writeGameSnapshot(
	planId: string,
	gameId: string,
	snapshot: ClassGameSnapshot,
): Promise<void> {
	await updateDoc(doc(db, CLASS_PLANS_COLLECTION, planId, CLASS_GAMES_SUBCOLLECTION, gameId), {
		snapshot,
		lastUpdate: Date.now(),
	});
}

/** Marks the plan as changed now. Best effort: the activity order is not worth failing a save. */
export async function touchPlan(planId: string): Promise<void> {
	try {
		await updateDoc(doc(db, CLASS_PLANS_COLLECTION, planId), { lastUpdate: Date.now() });
	} catch (err) {
		console.error('[classPlans] touchPlan failed:', err);
	}
}
