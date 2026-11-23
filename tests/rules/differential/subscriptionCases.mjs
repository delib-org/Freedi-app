/**
 * The statementsSubscribe case table for the differential runner
 * (subscriptionDiff.mjs). Each case is (setup, actor, operation): the runner
 * applies the same table to two rule files and compares allow / deny.
 *
 * `privacy: true` marks a case that writes one of the join-class privacy
 * fields (side / camp / decisionSupport / sidePickedAt): those are expected to
 * differ (Trello btMVQMM5 refuses them on the subscription). Every other case
 * must come out the same under both files.
 */

export const T0 = 1_800_000_000_000;
export const OWNER = 'u-owner'; // creator of every statement
export const S1 = 'u-s1'; // the subscriber whose doc is written
export const S2 = 'u-s2'; // another member
export const ADMIN = 'u-admin'; // admin subscription on every statement
export const NEWU = 'u-new'; // has no subscription yet
export const DELETE = '__DELETE__';

/** Statements, keyed by id. Access: own, inherited from the top, or through a class home. */
export const STATEMENTS = {
	open: { access: 'openToAll' },
	pub: { access: 'public' },
	reg: { access: 'openForRegistered' },
	mod: { access: 'moderated' },
	legacyOpen: { access: 'open' },
	secret: { access: 'secret' },
	none: {},
	inheritTop: { top: 'topOpen' },
	inheritTopMod: { top: 'topMod' },
	topOpen: { access: 'openToAll' },
	topMod: { access: 'moderated' },
	inHome: { top: 'home', parents: ['home', 'homeLesson'] },
	inHomeShort: { top: 'home', parents: ['home'] },
	home: { home: true },
	homeLesson: { top: 'home', parents: ['home'], access: 'openToAll' },
};

/**
 * Statements only the READ cases use (Trello sN881XCU): Class lessons, one at
 * the top and one under a class home, and a sub-question of a lesson. Kept
 * out of STATEMENTS so the write cases stay as they were.
 */
export const READ_STATEMENTS = {
	classLesson: { access: 'openToAll', lesson: true },
	homeClassLesson: { top: 'home', parents: ['home'], access: 'openToAll', lesson: true },
	lessonQuestion: { top: 'classLesson', parents: ['classLesson'] },
};

export function statementDoc(id) {
	const def = STATEMENTS[id] ?? READ_STATEMENTS[id];
	return {
		statementId: id,
		statement: `statement ${id}`,
		parentId: def.parents ? def.parents[def.parents.length - 1] : def.top ?? 'top',
		topParentId: def.top ?? id,
		parents: def.parents ?? (def.top ? [def.top] : []),
		statementType: 'question',
		creatorId: OWNER,
		creator: { uid: OWNER, displayName: 'Owner', photoURL: null, isAnonymous: false },
		...(def.access ? { membership: { access: def.access } } : {}),
		...(def.home ? { statementSettings: { classHome: { kind: 'teacher' } } } : {}),
		...(def.lesson ? { statementSettings: { lessonPlan: { steps: ['waiting', 'tables'], stepIndex: 1 } } } : {}),
		createdAt: T0,
		lastUpdate: T0,
	};
}

const userMap = (uid) => ({ uid, displayName: `name ${uid}`, photoURL: null, isAnonymous: false });

/**
 * Subscription doc shapes the apps write (see the report: main app, MC, Sign, Join, Class).
 * `uid` is the subscriber, `sid` the statement.
 */
export const SHAPES = {
	// main app setStatementSubscriptionToDB: full copy with user + statement + notification flags
	main: (uid, sid, role) => ({
		statementsSubscribeId: `${uid}--${sid}`, userId: uid, statementId: sid, role,
		user: userMap(uid), statement: statementDoc(sid),
		getInAppNotification: true, getEmailNotification: false, getPushNotification: false,
		lastUpdate: T0, createdAt: T0,
	}),
	// a subscription without a user map (some app paths write only ids)
	noUser: (uid, sid, role) => ({
		statementsSubscribeId: `${uid}--${sid}`, userId: uid, statementId: sid, role, lastUpdate: T0, createdAt: T0,
	}),
	// asked for notifications, with one device token (old cached versions)
	tokens: (uid, sid, role) => ({
		statementsSubscribeId: `${uid}--${sid}`, userId: uid, statementId: sid, role, user: userMap(uid),
		userAskedForNotification: true, getPushNotification: true, tokens: ['tok-1'], lastUpdate: T0, createdAt: T0,
	}),
	// join / class: openedInJoin / openedInClass marks
	join: (uid, sid, role) => ({
		statementsSubscribeId: `${uid}--${sid}`, userId: uid, statementId: sid, role, user: userMap(uid),
		openedInJoin: T0, joinOrder: 3, lastUpdate: T0, createdAt: T0,
	}),
	// legacy docs
	legacyNoStatementId: (uid, sid, role) => ({ userId: uid, role, lastUpdate: T0 }),
	legacyNoRole: (uid, sid) => ({ statementsSubscribeId: `${uid}--${sid}`, userId: uid, statementId: sid, lastUpdate: T0 }),
	legacyNoUserId: (uid, sid, role) => ({ statementId: sid, role, lastUpdate: T0 }),
	legacyBare: () => ({ lastUpdate: T0 }),
	// sign (apps/sign/app/api/documents/mark-visited/route.ts:80): no promoted fields, isDocument
	sign: (uid, sid, role) => ({
		role, userId: uid, statementId: sid, lastUpdate: T0, createdAt: T0, statementsSubscribeId: `${uid}--${sid}`,
		isDocument: true, statement: statementDoc(sid), user: { displayName: `name ${uid}`, uid },
	}),
	// studio via packages/event-core/src/createEvent.ts:98: role creator, getInAppNotification only
	studio: (uid, sid, role) => ({
		role, userId: uid, statementId: sid, statementsSubscribeId: `${uid}--${sid}`, statement: statementDoc(sid),
		user: userMap(uid), lastUpdate: T0, createdAt: T0, parentId: 'top', statementType: 'group', topParentId: sid,
		getInAppNotification: true,
	}),
	// a server copy: user = the statement's creator
	serverCopy: (uid, sid, role) => ({
		statementsSubscribeId: `${uid}--${sid}`, userId: uid, statementId: sid, role, user: userMap(OWNER), lastUpdate: T0,
	}),
};

const ROLES_EXISTING = ['member', 'waiting', 'banned', 'admin'];
const NARROW_SHAPES = ['main', 'noUser', 'sign', 'legacyNoStatementId', 'legacyNoRole'];

/** Update patches; `privacy` ones touch the join-class private fields. */
const PATCHES = {
	lastUpdate: { lastUpdate: T0 + 1 },
	notifyInApp: { getInAppNotification: false },
	notifyEmail: { getEmailNotification: true },
	askedNotify: { userAskedForNotification: true },
	displayName: { 'user.displayName': 'New name' },
	userReplaced: { user: userMap(S1) },
	userUidOther: { 'user.uid': S2 },
	userRemoved: { user: DELETE },
	roleMember: { role: 'member' },
	roleWaiting: { role: 'waiting' },
	roleAdmin: { role: 'admin' },
	roleCreator: { role: 'statement-creator' },
	roleCreatorLiteral: { role: 'creator' },
	roleBanned: { role: 'banned' },
	roleUnsub: { role: 'unsubscribed' },
	userIdOther: { userId: S2 },
	userIdSelf: { userId: S1 },
	statementIdOther: { statementId: 'pub' },
	statementIdSelf: { statementId: '__SID__' },
	tokensRemove: { tokens: [] },
	tokensAdd: { tokens: ['tok-1', 'tok-2'] },
	tableId: { tableId: 'x--1' },
	repliesRead: { proposalRepliesReadAt: T0 + 2 },
	repliesReadBad: { proposalRepliesReadAt: 'soon' },
	renameRequested: { renameRequested: true },
	openedInJoin: { openedInJoin: T0 + 3 },
	openedInClass: { openedInClass: T0 + 3 },
	statementCopy: { statement: { statementId: '__SID__', statement: 'changed' } },
	// the other apps' update shapes (see the report for file:line)
	readMark: { lastReadTimestamp: T0 + 4, statementId: '__SID__', seenMessageCount: 3 },
	bookmark: { isBookmarked: true, statementId: '__SID__', lastUpdate: T0 + 4 },
	branchPref: { 'branchPreferences.b1': { frequency: 'daily', lastNotifiedAt: 0 }, lastUpdate: T0 + 4 },
	frequency: { notificationFrequency: 'weekly', lastUpdate: T0 + 4 },
	notifyPrompt: { notifyPromptClosedAt: T0 + 4, notifyOnReplies: true, statementId: '__SID__', lastUpdate: T0 + 4 },
	notifyPrefs: { getInAppNotification: true, getPushNotification: true, statementId: '__SID__', lastUpdate: T0 + 4 },
	isDocument: { isDocument: true, lastUpdate: T0 + 4 },
	joinOrder: { joinOrder: 7, lastUpdate: T0 + 4 },
	unmarkJoin: { openedInJoin: DELETE, joinOrder: DELETE, lastUpdate: T0 + 4 },
	roleWithStatementId: { role: 'member', statementId: '__SID__', lastUpdate: T0 + 4 },
	nameAndRename: { 'user.displayName': 'Renamed', renameRequested: false, lastUpdate: T0 + 4 },
	// privacy fields
	side: { side: 30, camp: 'a', privacy: true },
	support: { decisionSupport: 1, privacy: true },
	sidePickedAt: { sidePickedAt: T0, privacy: true },
};

/** Actors writing S1's doc. */
const ACTORS = ['owner', 'other', 'admin', 'creator', 'signedOut'];
const ACTOR_UID = { owner: S1, other: S2, admin: ADMIN, creator: OWNER, signedOut: null };

export function buildCases() {
	const cases = [];
	const sidsForUpdates = ['open', 'mod', 'none', 'inheritTop', 'inHome', 'home'];
	// 1. updates of S1's existing doc: statement x shape x role x actor x patch (pruned)
	for (const sid of sidsForUpdates) {
		for (const [shapeName, shape] of Object.entries(SHAPES)) {
			if (sid !== 'open' && !NARROW_SHAPES.includes(shapeName)) continue;
			const roles = shapeName === 'legacyNoRole' || shapeName === 'legacyBare' ? [null] : sid === 'open' ? ROLES_EXISTING : ['member', 'banned'];
			for (const role of roles) {
				const data = shape(S1, sid, role ?? undefined);
				if (role === null) delete data.role;
				for (const actor of ACTORS) {
					const patchNames = sid === 'open' || actor === 'owner' ? Object.keys(PATCHES) : ['lastUpdate', 'roleMember', 'roleAdmin', 'userIdOther', 'displayName'];
					for (const pName of patchNames) {
						const { privacy, ...patch } = PATCHES[pName];
						const resolved = Object.fromEntries(
							Object.entries(patch).map(([k, v]) => [k, v === '__SID__' ? sid : typeof v === 'object' && v && v.statementId === '__SID__' ? { ...v, statementId: sid } : v]),
						);
						cases.push({
							name: `update ${sid}/${shapeName}/${role ?? 'norole'} by ${actor}: ${pName}`,
							statementId: sid,
							target: { id: `${S1}--${sid}`, data },
							actor: ACTOR_UID[actor],
							op: { kind: 'update', patch: resolved },
							privacy: Boolean(privacy),
						});
					}
				}
			}
		}
	}
	// 2. deletes
	for (const sid of ['open', 'home', 'mod']) {
		for (const role of ['member', 'banned', 'admin']) {
			for (const actor of ACTORS) {
				cases.push({
					name: `delete ${sid}/${role} by ${actor}`,
					statementId: sid,
					target: { id: `${S1}--${sid}`, data: SHAPES.main(S1, sid, role) },
					actor: ACTOR_UID[actor],
					op: { kind: 'delete' },
					privacy: false,
				});
			}
		}
	}
	// 3. creates: every statement x role x shape, by self, and by others for someone else
	for (const sid of Object.keys(STATEMENTS)) {
		for (const role of ['member', 'waiting', 'unsubscribed', 'admin', 'statement-creator', 'creator', 'banned']) {
			for (const shapeName of ['main', 'noUser', 'tokens', 'join', 'sign', 'studio']) {
				cases.push({
					name: `create ${sid}/${shapeName}/${role} by self`,
					statementId: sid,
					target: { id: `${NEWU}--${sid}`, data: null },
					actor: NEWU,
					op: { kind: 'create', id: `${NEWU}--${sid}`, data: SHAPES[shapeName](NEWU, sid, role) },
					privacy: false,
				});
			}
			for (const actor of ['admin', 'creator', 'other']) {
				cases.push({
					name: `create ${sid}/main/${role} for someone else by ${actor}`,
					statementId: sid,
					target: { id: `${NEWU}--${sid}`, data: null },
					actor: ACTOR_UID[actor],
					op: { kind: 'create', id: `${NEWU}--${sid}`, data: SHAPES.main(NEWU, sid, role) },
					privacy: false,
				});
			}
		}
		// identity mismatches on create
		cases.push({
			name: `create ${sid} with a mismatching id`,
			statementId: sid,
			target: { id: `${NEWU}--other`, data: null },
			actor: NEWU,
			op: { kind: 'create', id: `${NEWU}--other`, data: SHAPES.main(NEWU, sid, 'member') },
			privacy: false,
		});
		cases.push({
			name: `create ${sid} with two tokens`,
			statementId: sid,
			target: { id: `${NEWU}--${sid}`, data: null },
			actor: NEWU,
			op: { kind: 'create', id: `${NEWU}--${sid}`, data: { ...SHAPES.tokens(NEWU, sid, 'member'), tokens: ['a', 'b'] } },
			privacy: false,
		});
		cases.push({
			name: `create ${sid} carrying a side (privacy)`,
			statementId: sid,
			target: { id: `${NEWU}--${sid}`, data: null },
			actor: NEWU,
			op: { kind: 'create', id: `${NEWU}--${sid}`, data: { ...SHAPES.main(NEWU, sid, 'member'), side: 20 } },
			privacy: true,
		});
	}
	// 4. role moves (self) across every access, from waiting / member / banned
	for (const sid of Object.keys(STATEMENTS)) {
		for (const from of ['waiting', 'member', 'banned', 'unsubscribed']) {
			for (const to of ['member', 'waiting', 'admin', 'unsubscribed']) {
				cases.push({
					name: `role move ${sid}: ${from} -> ${to} by owner`,
					statementId: sid,
					target: { id: `${S1}--${sid}`, data: SHAPES.main(S1, sid, from) },
					actor: S1,
					op: { kind: 'update', patch: { role: to, lastUpdate: T0 + 1 } },
					privacy: false,
				});
			}
		}
	}

	return cases;
}

// ---- reads (Trello sN881XCU) -------------------------------------------------

export const S3 = 'u-s3'; // a member at another table
export const SYSADMIN = 'u-sysadmin'; // usersV2 systemAdmin: true

const READ_SIDS = [...Object.keys(STATEMENTS), ...Object.keys(READ_STATEMENTS)];
const isLessonSid = (sid) => Boolean(READ_STATEMENTS[sid]?.lesson);
const tableOf = (sid, n) => `${sid}--${n}`;

/**
 * The documents the read cases look at, seeded after the write cases (which
 * overwrite S1's docs): on every statement S1 and S2 at table 1, S3 at table 2
 * (tableId only on a lesson, as in Class), the admin, and no doc of NEWU.
 */
export function readFixture() {
	const docs = [];
	for (const sid of READ_SIDS) {
		const at = (uid, n) => ({ ...SHAPES.main(uid, sid, 'member'), ...(isLessonSid(sid) ? { tableId: tableOf(sid, n) } : {}) });
		docs.push({ id: `${S1}--${sid}`, data: at(S1, 1) });
		docs.push({ id: `${S2}--${sid}`, data: at(S2, 1) });
		docs.push({ id: `${S3}--${sid}`, data: at(S3, 2) });
		docs.push({ id: `${ADMIN}--${sid}`, data: SHAPES.main(ADMIN, sid, 'admin') });
		docs.push({ id: `${NEWU}--${sid}`, data: null });
	}
	docs.push({ id: `${S1}--legacy`, data: SHAPES.legacyNoStatementId(S1, 'open', 'member') });

	return docs;
}

const READERS = { owner: S1, tablemate: S2, otherTable: S3, stranger: NEWU, admin: ADMIN, creator: OWNER, sysadmin: SYSADMIN, signedOut: null };

/**
 * Read cases: every statement x reader x the read shapes the apps send.
 * `privacy: true` = expected to differ: any read of a Class lesson's
 * subscriptions, the unfiltered dashboard query, and another person's legacy
 * doc without statementId (the rule needs it to tell a lesson). Everything
 * else must come out the same.
 */
export function buildReadCases() {
	const cases = [];
	for (const sid of READ_SIDS) {
		const expected = isLessonSid(sid);
		const shapes = {
			getOwnersDoc: { kind: 'get', id: `${S1}--${sid}` },
			getMissing: { kind: 'get', id: `${NEWU}--${sid}` },
			listStatement: { kind: 'list', filters: [['statementId', '==', sid]] },
			listTable1: { kind: 'list', filters: [['statementId', '==', sid], ['tableId', '==', tableOf(sid, 1)]] },
			countStatement: { kind: 'count', filters: [['statementId', '==', sid]] },
			membersPage: { kind: 'list', filters: [['statementId', '==', sid], ['statementType', 'in', ['question', 'group']]] },
			roleOnStatement: { kind: 'list', filters: [['statementId', '==', sid], ['role', '==', 'admin']] },
		};
		for (const [reader, uid] of Object.entries(READERS)) {
			for (const [shapeName, op] of Object.entries(shapes)) {
				cases.push({ name: `read ${sid} by ${reader}: ${shapeName}`, statementId: sid, actor: uid, op, privacy: expected });
			}
			cases.push({
				name: `read own subscriptions by ${reader} (userId ==, topParentId ==) on ${sid}`,
				statementId: sid,
				actor: uid,
				op: { kind: 'list', filters: [['userId', '==', uid ?? 'nobody'], ['topParentId', '==', sid]] },
				privacy: false,
			});
		}
	}
	for (const [reader, uid] of Object.entries(READERS)) {
		cases.push({
			name: `read every subscription by role (no statementId) by ${reader}`,
			actor: uid,
			op: { kind: 'count', filters: [['role', '==', 'admin']] },
			privacy: true,
		});
		cases.push({
			name: `read own subscriptions by ${reader} (userId ==)`,
			actor: uid,
			op: { kind: 'list', filters: [['userId', '==', uid ?? 'nobody']] },
			privacy: false,
		});
		cases.push({
			name: `read S1's legacy doc without statementId by ${reader}`,
			actor: uid,
			op: { kind: 'get', id: `${S1}--legacy` },
			privacy: uid !== S1,
		});
	}

	return cases;
}
