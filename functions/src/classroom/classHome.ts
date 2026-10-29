import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import {
	Access,
	CLASS_HOME_KIND,
	Collections,
	Role,
	StatementSubscriptionSchema,
	StatementType,
	classHomeIdOf,
	createStatementObject,
	teacherHomeIdOf,
} from '@freedi/shared-types';
import type {
	AgoraClass,
	ClassHomeLink,
	Statement,
	StatementSubscription,
	User,
} from '@freedi/shared-types';
import { safeParse } from 'valibot';
import { ClassroomError } from './classroomErrors';
import { subscriptionDocId } from './classroomAccess';

/**
 * join-class HOMES (IA docs/ia/join-class-lesson-plan.md section 2): the top-level
 * group statement a lesson sits under. `jcClass_{classId}` for an Agora/Studio class
 * (admins = the class's teacherIds), `jcTeacher_{uid}` for a teacher with no class.
 * Secret, so the top-parent mirroring skips it and students never subscribe; the
 * rules refuse a get() of a home to anyone who is not its admin.
 *
 * Created lazily by the server only (classStartLesson, classCloneLesson, the
 * migration). A client cannot create a statement with a home id (firestore.rules).
 */

export const AGORA_CLASSES_COLLECTION = 'agoraClasses';
/** Same cap as setupAdminsForStatement's inherited admins. */
export const CLASS_HOME_MAX_ADMINS = 20;
const ACTIVE = 'active';

export interface HomeTarget {
	homeId: string;
	title: string;
	link: ClassHomeLink;
	/** Teachers who get an admin subscription on the home (the caller first). */
	adminUids: string[];
	/** The class, when the home is a class home. */
	classId: string | null;
	className: string;
}

/** Display names of teachers, for the home's admin subscriptions. Injected in tests. */
export type ResolveUsers = (uids: readonly string[]) => Promise<User[]>;

/** Default resolver: Firebase Auth. Keeps uid + display name only (data minimisation). */
export const resolveUsersFromAuth: ResolveUsers = async (uids) => {
	if (uids.length === 0) return [];
	const found = await getAuth().getUsers(uids.map((uid) => ({ uid })));
	const byUid = new Map(found.users.map((u) => [u.uid, u.displayName ?? '']));

	return uids.map((uid) => ({ uid, displayName: byUid.get(uid) ?? '', isAnonymous: false }));
};

/** The teacher home of `actor`. */
export function teacherHomeTarget(actor: User): HomeTarget {
	return {
		homeId: teacherHomeIdOf(actor.uid),
		title: actor.displayName?.trim() || actor.uid,
		link: { kind: CLASS_HOME_KIND.teacher, uid: actor.uid },
		adminUids: [actor.uid],
		classId: null,
		className: '',
	};
}

/**
 * The class home of an Agora class the actor teaches. Refuses a missing class
 * (not-found), a class the actor does not teach (permission-denied) and an
 * archived class (failed-precondition).
 */
export async function classHomeTarget(
	firestore: Firestore,
	actorUid: string,
	classId: string,
): Promise<HomeTarget> {
	const snap = await firestore.collection(AGORA_CLASSES_COLLECTION).doc(classId).get();
	if (!snap.exists) throw new ClassroomError('not-found', 'Class not found');
	const cls = snap.data() as AgoraClass;
	const teacherIds = Array.isArray(cls.teacherIds) ? cls.teacherIds : [];
	if (!teacherIds.includes(actorUid)) {
		throw new ClassroomError('permission-denied', 'You do not teach this class');
	}
	if (cls.status !== ACTIVE) {
		throw new ClassroomError('failed-precondition', 'This class is archived');
	}
	const others = teacherIds.filter((uid) => typeof uid === 'string' && uid && uid !== actorUid);

	return {
		homeId: classHomeIdOf(classId),
		title: cls.name?.trim() || classId,
		link: { kind: CLASS_HOME_KIND.class, classId },
		adminUids: [actorUid, ...others].slice(0, CLASS_HOME_MAX_ADMINS + 1),
		classId,
		className: cls.name?.trim() ?? '',
	};
}

/** The home statement: group, top-level, secret, built with createStatementObject. */
export function buildHomeStatement(target: HomeTarget, creator: User, now: number): Statement {
	const built = createStatementObject({
		statementId: target.homeId,
		statement: target.title,
		statementType: StatementType.group,
		parentId: 'top',
		topParentId: target.homeId,
		parents: [],
		creatorId: creator.uid,
		creator,
		statementSettings: { classHome: { ...target.link } },
	});
	if (!built) throw new ClassroomError('internal', 'Could not build the home');

	return {
		...built,
		createdAt: now,
		lastUpdate: now,
		membership: { ...(built.membership ?? {}), access: Access.secret },
	};
}

/** True when an existing statement at a home id really is that home (not a squat). */
export function isHomeOf(existing: Statement, target: HomeTarget): boolean {
	const link = existing.statementSettings?.classHome;

	return (
		existing.parentId === 'top' &&
		!!link &&
		link.kind === target.link.kind &&
		(link.classId ?? null) === (target.link.classId ?? null) &&
		(link.uid ?? null) === (target.link.uid ?? null)
	);
}

/**
 * An admin subscription on the home. Its `user` is the teacher (createSubscription
 * would put the home's creator there), so `setupAdminsForStatement` copies each
 * teacher, not the creator, onto every new statement under the home's lessons.
 * Notifications off: a home is a container, not a discussion.
 */
export function homeAdminSubscription(
	home: Statement,
	user: User,
	now: number,
): StatementSubscription {
	const sub = {
		statementsSubscribeId: subscriptionDocId(home.statementId, user.uid),
		statementId: home.statementId,
		userId: user.uid,
		user,
		role: Role.admin,
		statement: home,
		parentId: home.parentId,
		topParentId: home.statementId,
		statementType: home.statementType,
		lastUpdate: now,
		createdAt: now,
		getInAppNotification: false,
		getEmailNotification: false,
		getPushNotification: false,
	};
	const parsed = safeParse(StatementSubscriptionSchema, sub);
	if (!parsed.success) throw new ClassroomError('internal', 'Could not build a home admin');

	return sub as StatementSubscription;
}

export interface EnsureHomeArgs {
	firestore: Firestore;
	tx: Transaction;
	target: HomeTarget;
	/** The home as read in this transaction (undefined = missing). */
	existing: Statement | undefined;
	/** Existing subscriptions of the admins on the home, read in this transaction. */
	existingAdmins: ReadonlySet<string>;
	creator: User;
	users: readonly User[];
	now: number;
}

/**
 * Writes (inside the caller's transaction, after all its reads) the home when it is
 * missing, an admin subscription for every teacher who lacks one (upsert: an existing
 * subscription keeps its fields), and the class's `joinClassHomeId`. Returns the home.
 */
export function writeHome(args: EnsureHomeArgs): Statement {
	const { firestore, tx, target, existing, creator, now } = args;
	if (existing && !isHomeOf(existing, target)) {
		throw new ClassroomError('failed-precondition', 'That home id is taken');
	}
	const home = existing ?? buildHomeStatement(target, creator, now);
	if (!existing) {
		tx.create(firestore.collection(Collections.statements).doc(target.homeId), home);
	}
	const subs = firestore.collection(Collections.statementsSubscribe);
	for (const user of args.users) {
		if (args.existingAdmins.has(user.uid)) continue;
		tx.set(
			subs.doc(subscriptionDocId(target.homeId, user.uid)),
			homeAdminSubscription(home, user, now),
			{ merge: true },
		);
	}
	if (target.classId) {
		tx.set(
			firestore.collection(AGORA_CLASSES_COLLECTION).doc(target.classId),
			{ joinClassHomeId: target.homeId },
			{ merge: true },
		);
	}

	return home;
}

/** Reads, inside a transaction, which of the target's teachers already are admins of the home. */
export async function readHomeAdmins(
	firestore: Firestore,
	tx: Transaction,
	target: HomeTarget,
): Promise<Set<string>> {
	const subs = firestore.collection(Collections.statementsSubscribe);
	const snaps = await tx.getAll(
		...target.adminUids.map((uid) => subs.doc(subscriptionDocId(target.homeId, uid))),
	);
	const admins = new Set<string>();
	snaps.forEach((snap, i) => {
		const role = snap.exists ? (snap.data() as StatementSubscription).role : undefined;
		if (role === Role.admin) admins.add(target.adminUids[i]);
	});

	return admins;
}
