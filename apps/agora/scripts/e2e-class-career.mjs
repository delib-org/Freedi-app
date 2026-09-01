/* The classroom hierarchy, end to end.
 *
 * Sys-admin opens a school and a class and assigns a teacher by email →
 * students claim roster spots (alias + PIN) → the teacher runs a class game
 * through the real callables → the finished-session trigger folds the game
 * into career/class aggregates and the sys-admin period stats → a second game
 * accumulates → ending the session again is a no-op (idempotency) → a student
 * on a new device reclaims their spot with the PIN, a wrong PIN is refused,
 * and a teacher reset issues a working new one. Also proves the rules: a
 * student cannot list the roster.
 *
 * Asserts Firestore state, not pixels.
 *
 * Run: node scripts/e2e-class-career.mjs (needs emulators + vite + seed)
 */
import { preflight, FIRESTORE_REST, PROJECT_ID } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import {
	callable,
	db,
	fastlane,
	signInTeacher,
	signUpAnonymous,
} from './lib/fastlane.ts';

await preflight();

const runId = `career-${Date.now().toString(36)}`;

/** Poll until `probe` returns a truthy value or the deadline passes. */
async function waitFor(label, probe, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) fail(`${label}: not observed within ${timeoutMs}ms`);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

// ─── A. Sys-admin opens the hierarchy ────────────────────────────────────────

step('A. sys-admin opens a school and a class, assigns the teacher by email');

const admin = await signInTeacher(`${runId}-sysadmin`);
// systemAdmin is only ever granted server-side; the Admin SDK write here IS
// that server-side grant.
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });

const teacher = await signInTeacher(`${runId}-teacher`);
const teacherEmail = `${runId}-teacher@example.com`;
await db.collection('usersV2').doc(teacher.uid).set({ email: teacherEmail }, { merge: true });

const { schoolId } = await callable(
	'agoraAdminManageSchool',
	{ action: 'create', name: 'בית ספר יסודי הדגמה', city: 'תל אביב' },
	admin.idToken,
);
console.log(`   ✓ school ${schoolId}`);

const opened = await callable(
	'agoraAdminOpenClass',
	{ action: 'create', schoolId, name: 'כיתה ח2', gradeLevel: 'ח', teacherEmail },
	admin.idToken,
);
const { classId, classCode } = opened;
if (!classCode || classCode.length !== 6) fail(`class code should be 6 digits, got ${classCode}`);
eq('assigned teacher uid', opened.teacherUid, teacher.uid);
console.log(`   ✓ class ${classId} (code ${classCode})`);

// A non-admin is turned away at the door
const notAdmin = await signInTeacher(`${runId}-mortal`);
const refused = await callable(
	'agoraAdminManageSchool',
	{ action: 'create', name: 'לא אמור לקום' },
	notAdmin.idToken,
).then(
	() => false,
	(error) => /PERMISSION_DENIED|System admin/i.test(String(error)),
);
eq('non-admin refused school creation', refused, true);

// ─── B. Game 1 — class game through the fastlane ────────────────────────────

step('B. game 1: bots claim roster spots, play to results');

const game1 = await fastlane({
	stage: 'results',
	students: 3,
	proposals: 2,
	runId: `${runId}-g1`,
	teacher,
	classGame: { classId, classCode },
});
const [bot0, bot1] = game1.bots;
if (!bot0.memberId || !bot0.pin) fail('bot 0 has no roster spot');
eq('roster alias is the display name', bot0.anonName, `${runId}-g1-bot-0`);

const owner = { Authorization: 'Bearer owner' };
const plainDoc = async (path) => {
	const response = await fetch(`${FIRESTORE_REST}/${path}`, { headers: owner });
	if (!response.ok) return null;
	return response.json();
};

const field = (doc, name) => {
	const value = doc?.fields?.[name];
	if (value === undefined) return undefined;
	if ('stringValue' in value) return value.stringValue;
	if ('integerValue' in value) return Number(value.integerValue);
	if ('doubleValue' in value) return value.doubleValue;
	if ('nullValue' in value) return null;
	return value;
};

step('C. the finished-session trigger folds game 1 into the aggregates');

await waitFor('session 1 aggregatedAt', async () => {
	const doc = await plainDoc(`agoraSessions/${game1.sessionId}`);
	return field(doc, 'aggregatedAt') !== undefined ? doc : null;
});
console.log('   ✓ session 1 stamped aggregatedAt');

const studentAgg1 = await plainDoc(`agoraStudentAggregates/${bot0.memberId}`);
if (!studentAgg1) fail('student aggregate missing after game 1');
eq('student career gamesPlayed', field(studentAgg1, 'gamesPlayed'), 1);
eq('student career classId', field(studentAgg1, 'classId'), classId);

const classAgg1 = await plainDoc(`agoraClassAggregates/${classId}`);
if (!classAgg1) fail('class aggregate missing after game 1');
eq('class gamesPlayed', field(classAgg1, 'gamesPlayed'), 1);
eq('class studentGameSlots', field(classAgg1, 'studentGameSlots'), 3);

const dayKey = new Date().toISOString().slice(0, 10);
const stats1 = await plainDoc(`agoraStats/${dayKey}`);
if (!stats1) fail(`agoraStats/${dayKey} missing`);
const gamesFinishedAfter1 = field(stats1, 'gamesFinished');
const classesPlayedAfter1 = field(stats1, 'classesPlayed');
console.log(
	`   ✓ stats day doc: gamesFinished=${gamesFinishedAfter1}, classesPlayed=${classesPlayedAfter1}`,
);

// ─── D. Game 2 — same class, same members, accumulation ─────────────────────

step('D. game 2: the same two students play again (flow: no voting)');

const create2 = await callable(
	'agoraCreateSession',
	{
		topicPackageId: 'demo-french-revolution',
		deviceMode: 'individual',
		classId,
		flow: { voting: false, rounds: 99 },
	},
	teacher.idToken,
);
const session2Doc = await plainDoc(`agoraSessions/${create2.sessionId}`);
const flowStored = session2Doc?.fields?.flow?.mapValue?.fields;
eq('flow.voting stored', flowStored?.voting?.booleanValue, false);
eq('flow.rounds clamped', Number(flowStored?.rounds?.integerValue), 5);

for (const bot of [bot0, bot1]) {
	const joined = await callable('agoraJoinSession', { code: create2.code }, bot.idToken);
	if (joined.anonName !== bot.anonName) {
		fail(`alias should follow the member across games (${joined.anonName})`);
	}
}
console.log('   ✓ both members joined game 2 under the same alias');

// An unrostered guest is turned away from a class game
const guest = await signUpAnonymous();
const guestRefused = await callable('agoraJoinSession', { code: create2.code }, guest.idToken).then(
	() => false,
	(error) => /class-membership-required/.test(String(error)),
);
eq('unrostered guest refused', guestRefused, true);

await callable(
	'agoraAdvanceStage',
	{ sessionId: create2.sessionId, stage: 'results' },
	teacher.idToken,
);

await waitFor('session 2 aggregatedAt', async () => {
	const doc = await plainDoc(`agoraSessions/${create2.sessionId}`);
	return field(doc, 'aggregatedAt') !== undefined ? doc : null;
});

const studentAgg2 = await plainDoc(`agoraStudentAggregates/${bot0.memberId}`);
eq('student career gamesPlayed after game 2', field(studentAgg2, 'gamesPlayed'), 2);
const classAgg2 = await plainDoc(`agoraClassAggregates/${classId}`);
eq('class gamesPlayed after game 2', field(classAgg2, 'gamesPlayed'), 2);

const stats2 = await plainDoc(`agoraStats/${dayKey}`);
eq('stats gamesFinished grew by 1', field(stats2, 'gamesFinished'), gamesFinishedAfter1 + 1);
eq(
	'classesPlayed still counts the class once today',
	field(stats2, 'classesPlayed'),
	classesPlayedAfter1,
);

// ─── E. Idempotency — ending the already-aggregated session is a no-op ──────

step('E. ending game 2 does not double-count it');

await callable(
	'agoraAdvanceStage',
	{ sessionId: create2.sessionId, stage: 'ended' },
	teacher.idToken,
);
await new Promise((resolve) => setTimeout(resolve, 2500));
const studentAgg3 = await plainDoc(`agoraStudentAggregates/${bot0.memberId}`);
eq('student career still 2 games', field(studentAgg3, 'gamesPlayed'), 2);
const classAgg3 = await plainDoc(`agoraClassAggregates/${classId}`);
eq('class still 2 games', field(classAgg3, 'gamesPlayed'), 2);

// ─── F. Device switch: reclaim with PIN, teacher reset ──────────────────────

step('F. new device: wrong PIN refused, right PIN rebinds, teacher reset works');

const newDevice = await signUpAnonymous();
const wrongPin = bot0.pin === '0000' ? '1111' : '0000';
const wrongRefused = await callable(
	'agoraJoinClass',
	{ classCode, mode: 'reclaim', memberId: bot0.memberId, pin: wrongPin },
	newDevice.idToken,
).then(
	() => false,
	(error) => /Wrong PIN|PERMISSION_DENIED/i.test(String(error)),
);
eq('wrong PIN refused', wrongRefused, true);

const aliasList = await callable(
	'agoraJoinClass',
	{ classCode, mode: 'listAliases' },
	newDevice.idToken,
);
if (!aliasList.aliases?.some((row) => row.memberId === bot0.memberId)) {
	fail('alias picker should list the claimed spots');
}
console.log(`   ✓ alias picker lists ${aliasList.aliases.length} spots`);

const reclaimed = await callable(
	'agoraJoinClass',
	{ classCode, mode: 'reclaim', memberId: bot0.memberId, pin: bot0.pin },
	newDevice.idToken,
);
eq('reclaim returns the same alias', reclaimed.alias, bot0.anonName);

const memberDoc = await plainDoc(`agoraClassMembers/${classId}--${bot0.memberId}`);
eq('member now bound to the new device', field(memberDoc, 'currentUid'), newDevice.uid);

const reset = await callable(
	'agoraTeacherRoster',
	{ classId, action: 'resetBinding', memberId: bot1.memberId },
	teacher.idToken,
);
if (!reset.pin || reset.pin.length !== 4) fail('teacher reset should hand back a fresh PIN');
const thirdDevice = await signUpAnonymous();
const reclaimedAfterReset = await callable(
	'agoraJoinClass',
	{ classCode, mode: 'reclaim', memberId: bot1.memberId, pin: reset.pin },
	thirdDevice.idToken,
);
eq('reset PIN works on the next device', reclaimedAfterReset.memberId, bot1.memberId);

// ─── G. Rules: a student must not enumerate the roster ──────────────────────

step('G. rules: a student cannot list agoraClassMembers');

const listAttempt = await fetch(
	`${FIRESTORE_REST.replace(/\/documents$/, '')}/documents:runQuery`,
	{
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${newDevice.idToken}`,
		},
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'agoraClassMembers' }],
				where: {
					fieldFilter: {
						field: { fieldPath: 'classId' },
						op: 'EQUAL',
						value: { stringValue: classId },
					},
				},
			},
		}),
	},
);
const listBody = await listAttempt.text();
const denied = /PERMISSION_DENIED|permission/i.test(listBody) || listAttempt.status === 403;
eq('student roster list denied', denied, true);

// A teacher CAN list their roster (the console's roster table depends on it)
const teacherList = await fetch(
	`${FIRESTORE_REST.replace(/\/documents$/, '')}/documents:runQuery`,
	{
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${teacher.idToken}`,
		},
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'agoraClassMembers' }],
				where: {
					fieldFilter: {
						field: { fieldPath: 'classId' },
						op: 'EQUAL',
						value: { stringValue: classId },
					},
				},
			},
		}),
	},
);
const teacherRows = (await teacherList.json()).filter((row) => row.document);
eq('teacher lists the roster', teacherRows.length, 3);

console.log(`\nOK — classroom hierarchy e2e passed (project ${PROJECT_ID})`);
process.exit(0);
