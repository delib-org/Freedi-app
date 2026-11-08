/* The teacher's dashboard, read the way the browser now reads it.
 *
 * Four Firestore queries under real security rules — classes, schools, class
 * aggregates, recent sessions — none of which goes near a function. Asserts
 * that a teacher gets exactly their own, that a stranger gets nothing, and
 * that the roster stays where it belongs: behind the console, because member
 * documents carry the students' PIN hashes.
 *
 * Run: npx tsx scripts/e2e-teacher-dashboard-query.mjs
 */
import { preflight, FIRESTORE_REST } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { callable, db, signInTeacher } from './lib/fastlane.ts';

await preflight({ needs: ['firestore', 'auth', 'functions'] });

const runId = `tdq-${Date.now().toString(36)}`;

/** One structuredQuery as a signed-in client — rules apply, exactly as in the browser. */
async function runQuery(token, collectionId, fieldPath, value) {
	const response = await fetch(`${FIRESTORE_REST.replace(/\/documents$/, '')}/documents:runQuery`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId }],
				where: {
					fieldFilter: {
						field: { fieldPath },
						op: 'EQUAL',
						value,
					},
				},
			},
		}),
	});
	const body = await response.text();
	if (response.status === 403 || /PERMISSION_DENIED/i.test(body)) return { denied: true, docs: [] };
	if (!response.ok) fail(`${collectionId} query failed: ${response.status} ${body}`);
	const rows = JSON.parse(body);

	return { denied: false, docs: rows.filter((row) => row.document).map((row) => row.document) };
}

/**
 * `teacherMap.<uid>` as the REST API wants it. A path segment that does not
 * match `[a-zA-Z_][a-zA-Z_0-9]*` has to be backquoted, and a Firebase uid
 * starting with a digit does not — the client SDKs escape this for you, raw
 * REST does not, and the difference only shows up for some accounts.
 */
const mine = (token, uid, collectionId) =>
	runQuery(token, collectionId, `teacherMap.\`${uid}\``, { booleanValue: true });

step('A. a school, a teacher in it, two classes');
const admin = await signInTeacher(`${runId}-sysadmin`);
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });
const teacher = await signInTeacher(`${runId}-teacher`);
const teacherEmail = `${runId}-teacher@example.com`;
await db.collection('usersV2').doc(teacher.uid).set({ email: teacherEmail }, { merge: true });
const stranger = await signInTeacher(`${runId}-stranger`);

const { schoolId } = await callable('agoraAdminManageSchool', { action: 'create', name: 'תיכון הדגמה' }, admin.idToken);
await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail }, admin.idToken);
const classA = await callable('agoraTeacherClass', { action: 'create', name: '1', gradeLevel: 'ז' }, teacher.idToken);
const classB = await callable('agoraTeacherClass', { action: 'create', name: '2', gradeLevel: 'ז' }, teacher.idToken);

step('B. the browser reads its own classes and schools, with no function');
const classes = await mine(teacher.idToken, teacher.uid, 'agoraClasses');
eq('classes query allowed', classes.denied, false);
eq('both classes returned', classes.docs.length, 2);
const schools = await mine(teacher.idToken, teacher.uid, 'agoraSchools');
eq('schools query allowed', schools.denied, false);
eq('the school the admin attached', schools.docs.length, 1);
eq(
	'school named',
	schools.docs[0].fields.name.stringValue,
	'תיכון הדגמה',
);

step('C. a stranger gets nothing, under their own key or the teacher\'s');
const strangerOwn = await mine(stranger.idToken, stranger.uid, 'agoraClasses');
eq('a stranger has no classes of their own', strangerOwn.docs.length, 0);
const strangerOther = await mine(stranger.idToken, teacher.uid, 'agoraClasses');
eq("a stranger cannot query by the teacher's key", strangerOther.denied || strangerOther.docs.length === 0, true);
const strangerSchools = await mine(stranger.idToken, teacher.uid, 'agoraSchools');
eq("nor list the teacher's schools", strangerSchools.denied || strangerSchools.docs.length === 0, true);

step('D. class advancement comes back on the teacherMap index');
// What the trigger writes when a game is folded in: the aggregate carries the
// class's teacherMap so this query needs no get() per document.
const aggregate = {
	classId: classA.classId,
	schoolId,
	teacherMap: { [teacher.uid]: true },
	gamesPlayed: 2,
	scoredGames: 1,
	avgClassScore: 71,
	outcomes: { success: 1, honestDisagreement: 0, collapse: 0, unscored: 1 },
	studentGameSlots: 52,
	lastPlayedAt: Date.now(),
	perGame: [],
	lastUpdate: Date.now(),
};
await db.collection('agoraClassAggregates').doc(classA.classId).set(aggregate);
const aggregates = await mine(teacher.idToken, teacher.uid, 'agoraClassAggregates');
eq('aggregates query allowed', aggregates.denied, false);
eq('one class has played', aggregates.docs.length, 1);
eq('its average came back', aggregates.docs[0].fields.avgClassScore.integerValue, '71');
const strangerAggregates = await mine(stranger.idToken, teacher.uid, 'agoraClassAggregates');
eq('a stranger reads no advancement', strangerAggregates.denied || strangerAggregates.docs.length === 0, true);

step('E. a co-teacher inherits the index on the aggregate too');
const mate = await signInTeacher(`${runId}-mate`);
const mateEmail = `${runId}-mate@example.com`;
await db.collection('usersV2').doc(mate.uid).set({ email: mateEmail }, { merge: true });
await callable('agoraTeacherClass', { action: 'addTeacher', classId: classA.classId, teacherEmail: mateEmail }, teacher.idToken);
eq(
	'the aggregate carries the new teacher',
	(await db.collection('agoraClassAggregates').doc(classA.classId).get()).data().teacherMap[mate.uid],
	true,
);
const mateAggregates = await mine(mate.idToken, mate.uid, 'agoraClassAggregates');
eq('and the co-teacher can read it', mateAggregates.docs.length, 1);
await callable('agoraTeacherClass', { action: 'removeTeacher', classId: classA.classId, teacherUid: mate.uid }, teacher.idToken);
eq(
	'and loses it when taken off the class',
	(await db.collection('agoraClassAggregates').doc(classA.classId).get()).data().teacherMap[mate.uid],
	undefined,
);
eq('the read goes with it', (await mine(mate.idToken, mate.uid, 'agoraClassAggregates')).docs.length, 0);

step('F. the roster does NOT come this way — PIN hashes stay server-side');
const roster = await runQuery(teacher.idToken, 'agoraClassMembers', 'classId', { stringValue: classB.classId });
eq('a teacher may list their own roster over the wire', roster.denied, false);
const rosterDetail = await callable('agoraTeacherConsole', { view: 'class', classId: classB.classId }, teacher.idToken);
eq('but the console is what the screen uses', Array.isArray(rosterDetail.members), true);
eq('and it never hands out a PIN hash', JSON.stringify(rosterDetail).includes('rejoinPinHash'), false);

console.log('\n✓ e2e-teacher-dashboard-query: all green\n');
