/**
 * The teacher's list of lessons, read from Firestore.
 *
 * A lesson is listed when the teacher's own subscription to it carries
 * `openedInClass` (epoch ms of the last create/open). That marker is this app's
 * own: Join's `openedInJoin` never lists a lesson here, and the other way round.
 * The subscription carries only a copy of the statement made at subscribe time,
 * so the row's status (live / paused / open / ended, current step) comes from a
 * live query on the lesson statements themselves.
 */

import {
	Collections,
	Role,
	Statement,
	StatementSubscription,
	getStatementSubscriptionId,
	lessonStatusOf,
} from '@freedi/shared-types';
import type { LessonStatus } from '@freedi/shared-types';
import {
	db,
	doc,
	collection,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	query,
	where,
	documentId,
	limit,
} from './firebase';
import type { Unsubscribe } from './firebase';
import { resilientOnSnapshot } from './resilientListeners';

export interface ClassLessonEntry {
	id: string;
	title: string;
	color?: string;
	openedInClass: number;
	status: LessonStatus;
	stepIndex: number;
}

/** Firestore `in` queries take at most 30 ids; a teacher rarely has more than one chunk. */
const IN_QUERY_MAX = 30;

function buildSubId(userId: string, statementId: string): string {
	return (
		getStatementSubscriptionId(statementId, { uid: userId } as Parameters<
			typeof getStatementSubscriptionId
		>[1]) ?? `${userId}--${statementId}`
	);
}

/**
 * Upsert the user's subscription for `statement` and stamp it as opened in the
 * classroom app. When the subscription does not exist yet (the creator just
 * wrote the statement and `onStatementCreated` has not fanned out the admin sub),
 * it is created here with role=admin so the teacher's list sees it at once.
 */
export async function markOpenedInClass(
	statement: Statement,
	userId: string,
	displayName: string,
): Promise<void> {
	const subId = buildSubId(userId, statement.statementId);
	const ref = doc(db, Collections.statementsSubscribe, subId);
	const now = Date.now();

	const snap = await getDoc(ref);
	if (snap.exists()) {
		await updateDoc(ref, { openedInClass: now, lastUpdate: now });

		return;
	}

	const sub: StatementSubscription = {
		statementsSubscribeId: subId,
		userId,
		statementId: statement.statementId,
		statement,
		user: { uid: userId, displayName, photoURL: null, isAnonymous: false },
		role: Role.admin,
		parentId: statement.parentId,
		statementType: statement.statementType,
		topParentId: statement.topParentId || statement.parentId,
		lastUpdate: now,
		createdAt: now,
		openedInClass: now,
	};

	await setDoc(ref, sub, { merge: true });
}

/**
 * Wait until the creator's own subscription to a brand-new statement exists.
 * `onStatementCreated` writes it with a plain `set` (replacing whatever is there),
 * so a marker written before it lands is lost; writing the marker after it is
 * safe. Resolves true when the subscription showed up, false on timeout.
 */
export async function waitForCreatorSubscription(
	statementId: string,
	userId: string,
	timeoutMs: number,
	pollMs: number,
): Promise<boolean> {
	const ref = doc(db, Collections.statementsSubscribe, buildSubId(userId, statementId));
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		try {
			if ((await getDoc(ref)).exists()) return true;
		} catch (error) {
			console.error('[joinSubscriptions] waiting for the creator subscription failed:', error);
		}
		await new Promise((resolve) => window.setTimeout(resolve, pollMs));
	}

	return false;
}

/** True when this account already has at least one lesson listed (decides link-vs-replace at sign-in). */
export async function ownsClassLessons(userId: string): Promise<boolean> {
	try {
		const snap = await getDocs(
			query(
				collection(db, Collections.statementsSubscribe),
				where('userId', '==', userId),
				where('openedInClass', '>', 0),
				limit(1),
			),
		);

		return !snap.empty;
	} catch (error) {
		console.error('[joinSubscriptions] ownsClassLessons failed:', error);

		return false;
	}
}

function entryOf(
	sub: StatementSubscription,
	statements: ReadonlyMap<string, Statement>,
): ClassLessonEntry | null {
	const opened = sub.openedInClass;
	if (typeof opened !== 'number' || opened <= 0) return null;
	const live = statements.get(sub.statementId);
	const source = live ?? sub.statement;
	// Only lessons: a statement the classroom app never planned is not listed.
	const plan = source?.statementSettings?.lessonPlan;
	if (!plan) return null;

	return {
		id: sub.statementId,
		title: source?.statement ?? '',
		color: source?.color,
		openedInClass: opened,
		status: lessonStatusOf(plan),
		stepIndex: typeof plan.stepIndex === 'number' ? plan.stepIndex : 0,
	};
}

/**
 * Live listener for the teacher's lessons, most recently opened first.
 * Two layers: the subscriptions (which lessons, in what order) and one live
 * query per chunk of 30 lesson ids (their current status and step).
 */
export function subscribeToClassLessons(
	userId: string,
	cb: (entries: ClassLessonEntry[]) => void,
): Unsubscribe {
	let subs: StatementSubscription[] = [];
	const statements = new Map<string, Statement>();
	let statementStops: Unsubscribe[] = [];
	let watchedKey = '';
	/** The list waits for every chunk's first snapshot: the subscription's own copy of the
	 *  statement is not reliable (no lesson plan), so rows built early would be missing. */
	let chunksExpected = 0;
	let chunksLoaded = 0;

	const emit = (): void => {
		if (chunksLoaded < chunksExpected) return;
		const entries = subs
			.map((sub) => entryOf(sub, statements))
			.filter((entry): entry is ClassLessonEntry => entry !== null)
			.sort((a, b) => b.openedInClass - a.openedInClass);
		cb(entries);
	};

	const watchStatements = (ids: string[]): void => {
		const key = [...ids].sort().join(',');
		if (key === watchedKey) return;
		watchedKey = key;
		for (const stop of statementStops) stop();
		statementStops = [];
		statements.clear();
		chunksExpected = Math.ceil(ids.length / IN_QUERY_MAX);
		chunksLoaded = 0;
		for (let i = 0; i < ids.length; i += IN_QUERY_MAX) {
			const chunk = ids.slice(i, i + IN_QUERY_MAX);
			let loaded = false;
			const markLoaded = (): void => {
				if (loaded) return;
				loaded = true;
				chunksLoaded += 1;
			};
			statementStops.push(
				resilientOnSnapshot(
					'classLessonStatements',
					query(collection(db, Collections.statements), where(documentId(), 'in', chunk)),
					(snap) => {
						snap.forEach((d) => statements.set(d.id, d.data() as Statement));
						markLoaded();
						emit();
					},
					(err) => {
						console.error('[joinSubscriptions] lesson statements failed:', err);
						markLoaded();
						emit();
					},
				),
			);
		}
	};

	const stopSubs = resilientOnSnapshot(
		'classLessons',
		query(
			collection(db, Collections.statementsSubscribe),
			where('userId', '==', userId),
			where('openedInClass', '>', 0),
		),
		(snap) => {
			subs = snap.docs
				.map((d) => d.data() as StatementSubscription)
				.filter((sub) => (sub.parentId ?? sub.statement?.parentId) === 'top');
			watchStatements(subs.map((sub) => sub.statementId));
			emit();
		},
		(err) => {
			console.error('[joinSubscriptions] subscribeToClassLessons failed:', err);
			cb([]);
		},
	);

	return () => {
		stopSubs();
		for (const stop of statementStops) stop();
		statementStops = [];
	};
}
