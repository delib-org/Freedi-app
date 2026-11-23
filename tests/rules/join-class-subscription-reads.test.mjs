import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getCountFromServer,
	getDoc,
	getDocs,
	query,
	setDoc,
	where,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Trello sN881XCU: who reads a Class lesson's subscriptions (names, tableId,
 * role, renameRequested). The owner, the lesson's teacher (creator, an admin,
 * the legacy 'creator' role, an admin of its top), a student the
 * subscriptions at their own table, system admins, and while the btMVQMM5
 * rollout window is open anyone holding a subscription to the lesson.
 * Everything else (other apps, homes, a lesson's sub-questions) is unchanged:
 * any signed-in user. The queries are the ones the apps send
 * (apps/join-class/src/lib/classroom/listeners.ts listenRoster,
 * c3Data.ts listenMates, src/controllers/db/membership/*, apps/admin queries.ts).
 */
describe('join-class: reading a lesson\'s subscriptions (Trello sN881XCU)', () => {
	let env;
	const T0 = 1_800_000_000_000;
	const TEACHER = 'u-teacher'; // creator of the lessons
	const COADMIN = 'u-coadmin'; // admin subscription on LESSON
	const LEGACY = 'u-legacy-creator'; // the literal 'creator' role on LESSON
	const COTEACHER = 'u-coteacher'; // admin of the class home only
	const SYSADMIN = 'u-sysadmin';
	const S1 = 'u-s1'; // table 1
	const S2 = 'u-s2'; // table 1
	const S3 = 'u-s3'; // table 2
	const S4 = 'u-s4'; // joined, no table yet
	const BANNED = 'u-banned';
	const STRANGER = 'u-stranger';

	const LESSON = 'lesson1';
	const HOME = 'jcClass_c1';
	const HOME_LESSON = 'lesson2';
	const QUESTION = 'q1'; // another app's question
	const SUB_QUESTION = 'lesson1-challenge';
	const T1 = `${LESSON}--1`;
	const T2 = `${LESSON}--2`;

	const plan = { lessonPlan: { steps: ['waiting', 'tables', 'vote'], stepIndex: 1 } };
	const statement = (id, extra = {}) => ({
		statementId: id,
		statement: `statement ${id}`,
		parentId: 'top',
		topParentId: id,
		parents: [],
		statementType: 'question',
		creatorId: TEACHER,
		creator: { uid: TEACHER, displayName: 'Teacher' },
		membership: { access: 'openToAll' },
		...extra,
	});
	const STATEMENTS = {
		[LESSON]: statement(LESSON, { statementSettings: plan }),
		[HOME]: statement(HOME, { statementSettings: { classHome: { kind: 'class', classId: 'c1' } } }),
		[HOME_LESSON]: statement(HOME_LESSON, {
			topParentId: HOME,
			parentId: HOME,
			parents: [HOME],
			statementSettings: plan,
		}),
		[QUESTION]: statement(QUESTION),
		[SUB_QUESTION]: statement(SUB_QUESTION, { topParentId: LESSON, parentId: LESSON, parents: [LESSON] }),
	};

	const sub = (uid, sid, role, extra = {}) => ({
		statementsSubscribeId: `${uid}--${sid}`,
		userId: uid,
		statementId: sid,
		role,
		user: { uid, displayName: `name ${uid}`, photoURL: null, isAnonymous: true },
		statementType: 'question',
		lastUpdate: T0,
		createdAt: T0,
		...extra,
	});

	const as = (uid) => env.authenticatedContext(uid).firestore();
	const subsOf = (uid) => collection(as(uid), 'statementsSubscribe');
	const docOf = (uid, id) => doc(as(uid), 'statementsSubscribe', id);
	const roster = (uid, sid = LESSON) => getDocs(query(subsOf(uid), where('statementId', '==', sid)));
	const table = (uid, tableId, sid = LESSON) =>
		getDocs(query(subsOf(uid), where('statementId', '==', sid), where('tableId', '==', tableId)));
	const windowFlag = (open) =>
		seed(env, (db) =>
			open
				? setDoc(doc(db, 'classFlags', 'legacySideWrites'), { open: true })
				: deleteDoc(doc(db, 'classFlags', 'legacySideWrites')),
		);

	before(async () => {
		env = await makeEnv('join-class-subscription-reads');
		await seed(env, async (db) => {
			for (const [id, data] of Object.entries(STATEMENTS)) await setDoc(doc(db, 'statements', id), data);
			const subs = [
				sub(TEACHER, LESSON, 'admin'),
				sub(COADMIN, LESSON, 'admin'),
				sub(LEGACY, LESSON, 'creator'),
				sub(S1, LESSON, 'member', { tableId: T1, renameRequested: true }),
				sub(S2, LESSON, 'member', { tableId: T1 }),
				sub(S3, LESSON, 'member', { tableId: T2 }),
				sub(S4, LESSON, 'member'),
				sub(BANNED, LESSON, 'banned'),
				sub(COTEACHER, HOME, 'admin'),
				sub(S1, HOME_LESSON, 'member', { tableId: `${HOME_LESSON}--1` }),
				sub(S1, QUESTION, 'member'),
				sub(S2, QUESTION, 'admin'),
				sub(S1, HOME, 'member'),
				sub(S1, SUB_QUESTION, 'member'),
			];
			for (const s of subs) await setDoc(doc(db, 'statementsSubscribe', s.statementsSubscribeId), s);
			await setDoc(doc(db, 'usersV2', SYSADMIN), { uid: SYSADMIN, systemAdmin: true });
			await setDoc(doc(db, 'usersV2', STRANGER), { uid: STRANGER });
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('a stranger who knows the lesson id', () => {
		it('cannot read a student\'s subscription, list the lesson, a table, or count it', async () => {
			await assertFails(getDoc(docOf(STRANGER, `${S1}--${LESSON}`)));
			await assertFails(roster(STRANGER));
			await assertFails(table(STRANGER, T1));
			await assertFails(getCountFromServer(query(subsOf(STRANGER), where('statementId', '==', LESSON))));
		});

		it('still gets "missing" for an id that is not there (as before)', async () => {
			await assertSucceeds(getDoc(docOf(STRANGER, `${STRANGER}--${LESSON}`)));
			await assertSucceeds(getDoc(docOf(STRANGER, `nobody--${LESSON}`)));
		});
	});

	describe('a student', () => {
		it('reads their own subscription, by id and by a query on themselves', async () => {
			await assertSucceeds(getDoc(docOf(S1, `${S1}--${LESSON}`)));
			await assertSucceeds(getDoc(docOf(S4, `${S4}--${LESSON}`)));
			await assertSucceeds(getDocs(query(subsOf(S1), where('userId', '==', S1))));
			await assertSucceeds(
				getDocs(query(subsOf(S1), where('userId', '==', S1), where('openedInClass', '>', 0))),
			);
		});

		it('reads the subscriptions at their own table: the names on the chips', async () => {
			await assertSucceeds(table(S1, T1));
			await assertSucceeds(table(S2, T1));
			await assertSucceeds(getDoc(docOf(S1, `${S2}--${LESSON}`)));
			await assertSucceeds(table(S3, T2));
		});

		it('cannot read another table, the whole lesson, or count it', async () => {
			await assertFails(table(S1, T2));
			await assertFails(getDoc(docOf(S1, `${S3}--${LESSON}`)));
			await assertFails(getDoc(docOf(S3, `${S1}--${LESSON}`)));
			await assertFails(roster(S1));
			await assertFails(getCountFromServer(query(subsOf(S1), where('statementId', '==', LESSON))));
		});

		it('with no table yet reads no one else\'s', async () => {
			await assertFails(table(S4, T1));
			await assertFails(getDoc(docOf(S4, `${S1}--${LESSON}`)));
			await assertFails(roster(S4));
		});

		it('a banned student reads only their own', async () => {
			await assertSucceeds(getDoc(docOf(BANNED, `${BANNED}--${LESSON}`)));
			await assertFails(roster(BANNED));
		});

		it('another lesson\'s table does not open this one', async () => {
			await assertFails(table(S1, `${HOME_LESSON}--1`));
			await assertSucceeds(table(S1, `${HOME_LESSON}--1`, HOME_LESSON));
		});
	});

	describe('the lesson\'s teacher', () => {
		it('the creator, an admin and the legacy \'creator\' role read the roster and any doc', async () => {
			for (const uid of [TEACHER, COADMIN, LEGACY]) {
				await assertSucceeds(roster(uid));
				await assertSucceeds(getDoc(docOf(uid, `${S1}--${LESSON}`)));
				await assertSucceeds(table(uid, T2));
				await assertSucceeds(getCountFromServer(query(subsOf(uid), where('statementId', '==', LESSON))));
			}
		});

		it('the creator reads it even without a subscription of their own', async () => {
			await seed(env, (db) => deleteDoc(doc(db, 'statementsSubscribe', `${TEACHER}--${LESSON}`)));
			await assertSucceeds(roster(TEACHER));
			await seed(env, (db) =>
				setDoc(doc(db, 'statementsSubscribe', `${TEACHER}--${LESSON}`), sub(TEACHER, LESSON, 'admin')),
			);
		});

		it('a teacher of the class home reads the roster of a lesson under it, not of another lesson', async () => {
			await assertSucceeds(roster(COTEACHER, HOME_LESSON));
			await assertFails(roster(COTEACHER, LESSON));
		});

		it('the main app\'s members page query (statementType filter) works for the teacher only', async () => {
			const members = (uid) =>
				getDocs(
					query(
						subsOf(uid),
						where('statementId', '==', LESSON),
						where('statementType', 'in', ['question', 'group', 'statement', 'option']),
					),
				);
			await assertSucceeds(members(COADMIN));
			await assertFails(members(S1));
		});
	});

	describe('system admins', () => {
		it('read a lesson\'s roster, and run the dashboards\' queries that name no statement', async () => {
			await assertSucceeds(roster(SYSADMIN));
			await assertSucceeds(getCountFromServer(query(subsOf(SYSADMIN), where('role', '==', 'admin'))));
		});

		it('a query that names neither userId nor statementId is refused to everyone else', async () => {
			// (a rule reading statementId with a default would let this list every lesson's subscriptions)
			await assertFails(getCountFromServer(query(subsOf(STRANGER), where('role', '==', 'admin'))));
			await assertFails(getDocs(query(subsOf(S1), where('role', '==', 'member'))));
		});
	});

	describe('no way around it with other filters', () => {
		it('statementId in [...] holding a lesson is refused; without one it is not', async () => {
			await assertFails(getDocs(query(subsOf(STRANGER), where('statementId', 'in', [QUESTION, LESSON]))));
			await assertSucceeds(getDocs(query(subsOf(STRANGER), where('statementId', 'in', [QUESTION]))));
		});

		it('a student cannot widen the table filter (in, a range, not-equal)', async () => {
			const tables = (...filters) => getDocs(query(subsOf(S1), where('statementId', '==', LESSON), ...filters));
			await assertFails(tables(where('tableId', 'in', [T1, T2])));
			await assertFails(tables(where('tableId', '>=', '')));
			await assertFails(tables(where('tableId', '!=', T2)));
		});

		it('a student\'s own query on userId does not reach the others', async () => {
			await assertFails(getDocs(query(subsOf(S1), where('userId', 'in', [S1, S2]), where('statementId', '==', LESSON))));
		});
	});

	describe('the rollout window (classFlags/legacySideWrites open)', () => {
		it('lets a student of the lesson list it (tabs from before the change), never a stranger or a banned one', async () => {
			await windowFlag(true);
			try {
				await assertSucceeds(roster(S3));
				await assertSucceeds(roster(S4));
				await assertSucceeds(getDoc(docOf(S3, `${S1}--${LESSON}`)));
				await assertFails(roster(STRANGER));
				await assertFails(roster(BANNED));
			} finally {
				await windowFlag(false);
			}
			await assertFails(roster(S3));
		});
	});

	describe('everything that is not a Class lesson is unchanged', () => {
		it('another app\'s question: anyone signed in reads a doc, the members list and its count', async () => {
			await assertSucceeds(getDoc(docOf(STRANGER, `${S1}--${QUESTION}`)));
			await assertSucceeds(roster(STRANGER, QUESTION));
			await assertSucceeds(
				getCountFromServer(
					query(
						subsOf(STRANGER),
						where('statementId', '==', QUESTION),
						where('statementType', 'in', ['question', 'group']),
					),
				),
			);
			await assertSucceeds(
				getDocs(query(subsOf(STRANGER), where('statementId', '==', QUESTION), where('userId', 'in', [S1, S2]))),
			);
		});

		it('a class home and a lesson\'s sub-question', async () => {
			await assertSucceeds(roster(STRANGER, HOME));
			await assertSucceeds(roster(STRANGER, SUB_QUESTION));
			await assertSucceeds(getDoc(docOf(STRANGER, `${S1}--${SUB_QUESTION}`)));
		});

		it('a query on one\'s own subscriptions, every shape the apps send', async () => {
			await assertSucceeds(getDocs(query(subsOf(S1), where('userId', '==', S1), where('parentId', '==', 'top'))));
			await assertSucceeds(getDocs(query(subsOf(S1), where('userId', '==', S1), where('role', '==', 'admin'))));
			await assertSucceeds(getDocs(query(subsOf(S1), where('userId', '==', S1), where('topParentId', '==', LESSON))));
		});

		it('signed out: nothing, as before', async () => {
			const out = env.unauthenticatedContext().firestore();
			await assertFails(getDoc(doc(out, 'statementsSubscribe', `${S1}--${QUESTION}`)));
			await assertFails(getDoc(doc(out, 'statementsSubscribe', `${S1}--${LESSON}`)));
		});
	});
});
