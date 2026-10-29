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
import { commitInBatches } from './batchedWrites';

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
/** Roles that make a subscription an admin one (the rules' isAdmin()). */
const HOME_ADMIN_ROLES: ReadonlySet<string> = new Set([
	Role.admin,
	Role.creator,
	'statement-creator',
]);

export interface HomeTarget {
	homeId: string;
	title: string;
	link: ClassHomeLink;
	/** Teachers who get an admin subscription on the home (the caller first). */
	adminUids: string[];
	/** The class, when the home is a class home. */
	classId: string | null;
	className: string;
	/**
	 * Who may have created a genuine existing home: the teacher (teacher home), or
	 * the class's current teachers (class home). A pre-existing doc made by anyone
	 * else is a squat (see isHomeOf).
	 */
	trustedCreatorUids: string[];
	/** agoraClasses.joinClassHomeId as read (server-written only; clients cannot write classes). */
	linkedHomeId: string | null;
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
		trustedCreatorUids: [actor.uid],
		linkedHomeId: null,
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
		trustedCreatorUids: teacherIds.filter((uid) => typeof uid === 'string' && uid),
		linkedHomeId: typeof cls.joinClassHomeId === 'string' ? cls.joinClassHomeId : null,
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

/**
 * True when an existing statement at a home id really is that home, not a squat.
 * The link (kind, classId / uid) must match AND the creator must be trusted:
 * - teacher home: created by that teacher (a client can only create as itself,
 *   so nobody else can have made `jcTeacher_{uid}` with creatorId = uid);
 * - class home: the class already points at it (`joinClassHomeId`, written only
 *   by the server in the same transaction that creates the home), or it was made
 *   by one of the class's current teachers.
 * Under the rules in force before the lesson-plan rules ship, a client could
 * create `jcTeacher_X` / `jcClass_X` with a classHome; these checks refuse it.
 */
export function isHomeOf(existing: Statement, target: HomeTarget): boolean {
	const link = existing.statementSettings?.classHome;
	const creator = existing.creatorId || existing.creator?.uid || '';
	const linked = !!target.classId && target.linkedHomeId === target.homeId;
	const trusted =
		target.link.kind === CLASS_HOME_KIND.teacher
			? creator === target.link.uid
			: linked || target.trustedCreatorUids.includes(creator);

	return (
		existing.statementId === target.homeId &&
		existing.parentId === 'top' &&
		!!link &&
		link.kind === target.link.kind &&
		(link.classId ?? null) === (target.link.classId ?? null) &&
		(link.uid ?? null) === (target.link.uid ?? null) &&
		trusted
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
	/** Every subscription on the home, by uid -> role, read in this transaction. */
	existingAdmins: ReadonlyMap<string, string>;
	creator: User;
	users: readonly User[];
	now: number;
}

export interface WrittenHome {
	home: Statement;
	/** Admins taken off the home: no longer among its teachers. */
	revokedUids: string[];
}

/**
 * Writes (inside the caller's transaction, after all its reads) the home when it is
 * missing, and RE-SYNCS its admins to the target's teachers: an admin subscription
 * for every teacher who lacks one (upsert: an existing one keeps its fields), and
 * the removal of every admin subscription of someone no longer a teacher (a teacher
 * taken off the class). Also the class's `joinClassHomeId`. The caller revokes the
 * removed teachers' copied admin subscriptions under the home afterwards
 * (revokeHomeAdminCopies), outside the transaction.
 */
export function writeHome(args: EnsureHomeArgs): WrittenHome {
	const { firestore, tx, target, existing, creator, now } = args;
	if (existing && !isHomeOf(existing, target)) {
		throw new ClassroomError('failed-precondition', 'That home id is taken');
	}
	const home = existing ?? buildHomeStatement(target, creator, now);
	if (!existing) {
		tx.create(firestore.collection(Collections.statements).doc(target.homeId), home);
	}
	const subs = firestore.collection(Collections.statementsSubscribe);
	const keep = new Set(target.adminUids);
	const revokedUids: string[] = [];
	for (const [uid, role] of args.existingAdmins) {
		if (keep.has(uid) || !HOME_ADMIN_ROLES.has(role)) continue;
		tx.delete(subs.doc(subscriptionDocId(target.homeId, uid)));
		revokedUids.push(uid);
	}
	for (const user of args.users) {
		if (args.existingAdmins.get(user.uid) === Role.admin) continue;
		tx.set(
			subs.doc(subscriptionDocId(target.homeId, user.uid)),
			homeAdminSubscription(home, user, now),
			{ merge: true },
		);
	}
	if (target.classId && target.linkedHomeId !== target.homeId) {
		tx.set(
			firestore.collection(AGORA_CLASSES_COLLECTION).doc(target.classId),
			{ joinClassHomeId: target.homeId },
			{ merge: true },
		);
	}

	return { home, revokedUids };
}

/** Reads, inside a transaction, every subscription on the home: uid -> role. */
export async function readHomeAdmins(
	firestore: Firestore,
	tx: Transaction,
	target: HomeTarget,
): Promise<Map<string, string>> {
	const snap = await tx.get(
		firestore.collection(Collections.statementsSubscribe).where('statementId', '==', target.homeId),
	);
	const roles = new Map<string, string>();
	for (const doc of snap.docs) {
		const sub = doc.data() as StatementSubscription;
		const uid = sub.userId || sub.user?.uid;
		if (uid) roles.set(uid, String(sub.role));
	}

	return roles;
}

/**
 * Takes a teacher off a home: deletes their admin subscription on the home and the
 * admin subscriptions setupAdminsForStatement copied onto statements under it
 * (`topParentId == homeId`), except on statements they created themselves (they
 * stay that statement's creator). Idempotent; batched. Returns how many were deleted.
 */
export async function revokeHomeAdminCopies(
	firestore: Firestore,
	homeId: string,
	uid: string,
): Promise<number> {
	const subs = firestore.collection(Collections.statementsSubscribe);
	const copied = await subs.where('userId', '==', uid).where('topParentId', '==', homeId).get();
	const refs = copied.docs
		.filter((d) => {
			const sub = d.data() as StatementSubscription;
			const creator = (sub.statement as { creatorId?: string } | undefined)?.creatorId;

			return (
				HOME_ADMIN_ROLES.has(String(sub.role)) && (sub.statementId === homeId || creator !== uid)
			);
		})
		.map((d) => d.ref);
	const home = subs.doc(subscriptionDocId(homeId, uid));
	if (!refs.some((r) => r.path === home.path)) refs.push(home);
	await commitInBatches(
		firestore,
		refs.map((ref) => ({ kind: 'delete' as const, ref })),
	);

	return refs.length;
}

/**
 * A teacher taken off an Agora class (removeClassTeacher): when the class has a
 * join-class home, revoke their admin there and the admin copies under it, so
 * they keep no update/delete over the class's lessons (checkTopParentAdmin) and
 * are no longer copied onto new posts. No home yet: nothing to do. Idempotent.
 */
export async function revokeClassHomeTeacher(
	firestore: Firestore,
	classId: string,
	uid: string,
): Promise<number> {
	const snap = await firestore.collection(AGORA_CLASSES_COLLECTION).doc(classId).get();
	const homeId = snap.exists ? (snap.data() as AgoraClass).joinClassHomeId : undefined;
	if (!homeId) return 0;

	return revokeHomeAdminCopies(firestore, homeId, uid);
}
