/* Supervision and analytics, end to end.
 *
 * The sys-admin opens a school, attaches two teachers by email and opens a
 * class for each → attaches a supervisor by email (a teacher calling is
 * refused; an unknown email is refused) → the supervisor's overview lists the
 * school with both teachers and both classes; an outsider and a plain
 * teacher are refused; the admin sees the school without being attached →
 * two fastlane games for teacher 1 reach results and the finished-session
 * trigger folds them into the teacher's aggregate (lessonsRun 2, duration
 * > 0); ending one again is a no-op → heartbeats: 300 s credits at most
 * 300 s, an immediate second beat credits 0, a huge claim is clamped, an
 * anonymous caller is refused, the month doc's day slice equals the sum →
 * narrowing the supervisor to teacher 2 hides teacher 1's teacher, class and
 * student views and serves teacher 2's with aliases only → clearing the
 * scope restores → the system view is the admin's alone → the backfill folds
 * one seeded old session exactly once → removing the supervisor empties the
 * overview.
 *
 * Asserts Firestore state and callable responses, not pixels.
 * Run: npx tsx scripts/e2e-supervisor.mjs (needs emulators + seed)
 */
import { preflight } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher, signUpAnonymous } from './lib/fastlane.ts';

await preflight();

const runId = `sup-${Date.now().toString(36)}`;
const refuses = (promise, pattern) =>
	promise.then(
		() => false,
		(error) => pattern.test(String(error)),
	);
const DENIED = /PERMISSION_DENIED|do not supervise|outside your scope|System admin/i;

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

const sessionDoc = async (sessionId) => (await db.collection('agoraSessions').doc(sessionId).get()).data();
const teacherAgg = async (uid) => (await db.collection('agoraTeacherAggregates').doc(uid).get()).data();

step('A. the admin opens a school, two teachers, a class each');
const admin = await signInTeacher(`${runId}-sysadmin`);
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });
const teacher1 = await signInTeacher(`${runId}-t1`);
const teacher1Email = `${runId}-t1@example.com`;
await db.collection('usersV2').doc(teacher1.uid).set({ email: teacher1Email, displayName: 'דנה' }, { merge: true });
const teacher2 = await signInTeacher(`${runId}-t2`);
const teacher2Email = `${runId}-t2@example.com`;
await db.collection('usersV2').doc(teacher2.uid).set({ email: teacher2Email, displayName: 'יואב' }, { merge: true });
const supervisor = await signInTeacher(`${runId}-sup`);
const supervisorEmail = `${runId}-sup@example.com`;
await db.collection('usersV2').doc(supervisor.uid).set({ email: supervisorEmail, displayName: 'המפקחת' }, { merge: true });
const outsider = await signInTeacher(`${runId}-outsider`);

const { schoolId } = await callable('agoraAdminManageSchool', { action: 'create', name: 'תיכון פיקוח' }, admin.idToken);
await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail: teacher1Email }, admin.idToken);
await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail: teacher2Email }, admin.idToken);
const class1 = await callable('agoraAdminOpenClass', { action: 'create', schoolId, name: 'ז1', gradeLevel: 'ז', teacherEmail: teacher1Email }, admin.idToken);
const class2 = await callable('agoraAdminOpenClass', { action: 'create', schoolId, name: 'ז2', gradeLevel: 'ז', teacherEmail: teacher2Email }, admin.idToken);
eq('class 1 belongs to teacher 1', class1.teacherUid, teacher1.uid);
eq('class 2 belongs to teacher 2', class2.teacherUid, teacher2.uid);

step('B. the supervisor is attached by email');
eq('a teacher cannot assign a supervisor', await refuses(callable('agoraAdminManageSchool', { action: 'assignSupervisor', schoolId, supervisorEmail }, teacher1.idToken), DENIED), true);
eq('an unknown email is refused', await refuses(callable('agoraAdminManageSchool', { action: 'assignSupervisor', schoolId, supervisorEmail: 'nobody@example.com' }, admin.idToken), /NOT_FOUND|No account/i), true);
const assigned = await callable('agoraAdminManageSchool', { action: 'assignSupervisor', schoolId, supervisorEmail }, admin.idToken);
eq('supervisor uid echoed', assigned.supervisorUid, supervisor.uid);
const schoolDoc = (await db.collection('agoraSchools').doc(schoolId).get()).data();
eq('school supervisorIds', schoolDoc.supervisorIds.join(), supervisor.uid);
eq('school supervisorMap', schoolDoc.supervisorMap[supervisor.uid], true);

step('C. the overview');
const overview = await callable('agoraSupervisorConsole', { view: 'overview' }, supervisor.idToken);
eq('role', overview.role, 'supervisor');
eq('one school listed', overview.schools.map((s) => s.schoolId).join(), schoolId);
eq('selected school', overview.school.schoolId, schoolId);
eq('scope is the whole school', overview.school.scope, 'all');
eq('two teachers', overview.school.teachers.length, 2);
eq('two classes', overview.school.classes.length, 2);
eq('teacher 1 named by display name', overview.school.teachers.find((t) => t.uid === teacher1.uid).name, 'דנה');
eq('no lessons yet', overview.school.teachers.reduce((sum, t) => sum + t.lessonsRun, 0), 0);
eq('period is 90 days', overview.school.usage.days.length, 90);
eq('outsider refused', await refuses(callable('agoraSupervisorConsole', { view: 'overview' }, outsider.idToken), DENIED), true);
eq('plain teacher refused', await refuses(callable('agoraSupervisorConsole', { view: 'overview' }, teacher1.idToken), DENIED), true);
eq('supervisor cannot name another school', await refuses(callable('agoraSupervisorConsole', { view: 'overview', schoolId: 'not-mine' }, supervisor.idToken), DENIED), true);
const adminOverview = await callable('agoraSupervisorConsole', { view: 'overview', schoolId }, admin.idToken);
eq('admin role', adminOverview.role, 'sysadmin');
eq('admin sees the school unattached', adminOverview.school.scope, 'admin');
const teacherDash = await callable('agoraTeacherConsole', { view: 'dashboard' }, supervisor.idToken);
eq('the dashboard names the supervised school', teacherDash.supervisedSchools.map((s) => s.schoolId).join(), schoolId);
eq('the dashboard knows the supervisor is not a sys-admin', teacherDash.isSystemAdmin, false);
eq('a plain teacher supervises nothing', (await callable('agoraTeacherConsole', { view: 'dashboard' }, teacher1.idToken)).supervisedSchools.length, 0);

step('D. two games for teacher 1 fold into the teacher aggregate');
const game1 = await fastlane({
	stage: 'results',
	students: 3,
	proposals: 2,
	runId: `${runId}-g1`,
	teacher: teacher1,
	classGame: { classId: class1.classId, classCode: class1.classCode },
	quiet: true,
});
const game2 = await fastlane({
	stage: 'results',
	students: 3,
	proposals: 2,
	runId: `${runId}-g2`,
	teacher: teacher1,
	classGame: { classId: class1.classId, classCode: class1.classCode },
	quiet: true,
});
for (const game of [game1, game2]) {
	await waitFor(`session ${game.sessionId} teacherAggregatedAt`, async () => {
		const session = await sessionDoc(game.sessionId);
		return session?.teacherAggregatedAt !== undefined ? session : null;
	});
}
const agg1 = await teacherAgg(teacher1.uid);
if (!agg1) fail('teacher aggregate missing after two games');
eq('lessonsRun', agg1.lessonsRun, 2);
eq('classLessons', agg1.classLessons, 2);
eq('classesTaught', agg1.classesTaught.join(), class1.classId);
eq('schoolIds', agg1.schoolIds.join(), schoolId);
eq('studentGameSlots', agg1.studentGameSlots, 6);
if (!(agg1.totalDurationMs > 0)) fail(`totalDurationMs should be > 0, got ${agg1.totalDurationMs}`);
console.log(`   ✓ totalDurationMs = ${agg1.totalDurationMs}`);
eq('perLesson rows', agg1.perLesson.length, 2);
eq('teacher 2 has no aggregate', await teacherAgg(teacher2.uid), undefined);

await callable('agoraAdvanceStage', { sessionId: game2.sessionId, stage: 'ended' }, teacher1.idToken);
await new Promise((resolve) => setTimeout(resolve, 2500));
eq('ending again does not double-count', (await teacherAgg(teacher1.uid)).lessonsRun, 2);

const overviewAfter = await callable('agoraSupervisorConsole', { view: 'overview', days: 7 }, admin.idToken);
const t1Row = overviewAfter.school.teachers.find((t) => t.uid === teacher1.uid);
eq('overview row lessonsRun', t1Row.lessonsRun, 2);
eq('overview row classCount', t1Row.classCount, 1);
eq('overview lessons this week', overviewAfter.school.lessons.weeks.reduce((sum, w) => sum + w.lessons, 0), 2);
eq('days clamped up to 7', overviewAfter.school.usage.days.length, 7);

step('E. heartbeats');
const beat1 = await callable('agoraTeacherHeartbeat', { surface: 'home', sinceMs: 300_000 }, teacher1.idToken);
if (beat1.creditedMs <= 0 || beat1.creditedMs > 300_000) fail(`first beat credited ${beat1.creditedMs}`);
console.log(`   ✓ first beat credited ${beat1.creditedMs} ms on ${beat1.day}`);
const beat2 = await callable('agoraTeacherHeartbeat', { surface: 'home', sinceMs: 300_000 }, teacher1.idToken);
eq('an immediate second beat credits 0', beat2.creditedMs, 0);
eq('day total unchanged by the burst', beat2.dayActiveMs, beat1.dayActiveMs);
eq('unknown surface refused', await refuses(callable('agoraTeacherHeartbeat', { surface: 'kitchen', sinceMs: 1000 }, teacher1.idToken), /INVALID_ARGUMENT|Unknown surface/i), true);
eq('non-finite sinceMs refused', await refuses(callable('agoraTeacherHeartbeat', { surface: 'home', sinceMs: 'lots' }, teacher1.idToken), /INVALID_ARGUMENT|finite/i), true);
const anon = await signUpAnonymous();
eq('anonymous refused', await refuses(callable('agoraTeacherHeartbeat', { surface: 'home', sinceMs: 1000 }, anon.idToken), DENIED), true);
// A huge claim from a fresh teacher (no previous beat) is clamped to the max
const huge = await callable('agoraTeacherHeartbeat', { surface: 'class', sinceMs: 99_999_999 }, teacher2.idToken);
eq('huge claim clamped', huge.creditedMs, 330_000);
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const usageDoc = (await db.collection('agoraTeacherUsage').doc(`${teacher1.uid}--${month}`).get()).data();
if (!usageDoc) fail('usage month doc missing');
eq('month doc day slice equals the credited sum', usageDoc.days[today].activeMs, beat1.creditedMs);
eq('month total equals the day', usageDoc.activeMs, beat1.creditedMs);
eq('surface tally', usageDoc.bySurface.home, beat1.creditedMs);
eq('heartbeats counted once', usageDoc.heartbeats, 1);
// The overview is memoised for a minute per caller+args; a different period
// makes this a fresh read rather than step C's cached answer.
const withUsage = await callable('agoraSupervisorConsole', { view: 'overview', days: 60 }, supervisor.idToken);
eq('overview usage carries the beat', withUsage.school.usage.days.find((d) => d.day === today).activeMs, beat1.creditedMs + huge.creditedMs);

step('F. narrowing the supervisor to teacher 2');
eq('scope before assignment refused', await refuses(callable('agoraAdminManageSchool', { action: 'setSupervisorScope', schoolId, supervisorEmail: `${runId}-outsider@example.com`, teacherIds: [teacher2.uid] }, admin.idToken), /FAILED_PRECONDITION|NOT_FOUND|Assign the supervisor|No account/i), true);
eq('a stranger uid in the scope refused', await refuses(callable('agoraAdminManageSchool', { action: 'setSupervisorScope', schoolId, supervisorEmail, teacherIds: [outsider.uid] }, admin.idToken), /INVALID_ARGUMENT|Not teachers/i), true);
await callable('agoraAdminManageSchool', { action: 'setSupervisorScope', schoolId, supervisorEmail, teacherIds: [teacher2.uid] }, admin.idToken);
eq('scope stored', (await db.collection('agoraSchools').doc(schoolId).get()).data().supervisorScopes[supervisor.uid].teacherIds.join(), teacher2.uid);
// The overview is memoised for a minute per caller+args; ask with a different
// period so the narrowed answer is computed fresh.
const narrowed = await callable('agoraSupervisorConsole', { view: 'overview', days: 30 }, supervisor.idToken);
eq('scope label', narrowed.school.scope, 'narrowed');
eq('only teacher 2 listed', narrowed.school.teachers.map((t) => t.uid).join(), teacher2.uid);
eq('only class 2 listed', narrowed.school.classes.map((c) => c.classId).join(), class2.classId);
eq('teacher 1 view refused', await refuses(callable('agoraSupervisorConsole', { view: 'teacher', schoolId, teacherId: teacher1.uid }, supervisor.idToken), DENIED), true);
eq('class 1 view refused', await refuses(callable('agoraSupervisorConsole', { view: 'class', classId: class1.classId }, supervisor.idToken), DENIED), true);
const bot = game1.bots[0];
if (!bot.memberId) fail('bot 0 has no roster spot');
eq('student of class 1 refused', await refuses(callable('agoraSupervisorConsole', { view: 'student', memberId: bot.memberId }, supervisor.idToken), DENIED), true);
const t2Detail = await callable('agoraSupervisorConsole', { view: 'teacher', schoolId, teacherId: teacher2.uid }, supervisor.idToken);
eq('teacher 2 detail served', t2Detail.teacher.uid, teacher2.uid);
eq('teacher 2 has class 2', t2Detail.classes.map((c) => c.classId).join(), class2.classId);
eq('teacher 2 usage carries the clamped beat', t2Detail.usage.days.find((d) => d.day === today).activeMs, huge.creditedMs);
const c2Detail = await callable('agoraSupervisorConsole', { view: 'class', classId: class2.classId }, supervisor.idToken);
eq('class 2 detail served', c2Detail.classId, class2.classId);
eq('school name on the class', c2Detail.schoolName, 'תיכון פיקוח');
if ('classCode' in c2Detail) fail('class detail must not carry the class code');
console.log('   ✓ class detail carries no classCode');

step('G. clearing the scope restores everything');
await callable('agoraAdminManageSchool', { action: 'setSupervisorScope', schoolId, supervisorEmail, teacherIds: null }, admin.idToken);
eq('scope key gone', (await db.collection('agoraSchools').doc(schoolId).get()).data().supervisorScopes?.[supervisor.uid], undefined);
const restored = await callable('agoraSupervisorConsole', { view: 'overview', days: 14 }, supervisor.idToken);
eq('both teachers again', restored.school.teachers.length, 2);
const c1Detail = await callable('agoraSupervisorConsole', { view: 'class', classId: class1.classId }, supervisor.idToken);
eq('class 1 members are aliases', c1Detail.members.length, 3);
for (const member of c1Detail.members) {
	if ('rejoinPinHash' in member || 'currentUid' in member || 'uidHistory' in member) fail('member row leaks a private field');
}
console.log('   ✓ member rows carry alias, joinedAt, lastActive only');
eq('class 1 sessions projected', c1Detail.sessions.length, 2);
const sessionRow = c1Detail.sessions[0];
for (const key of ['code', 'stagePlan', 'votingSettings', 'classScore']) {
	if (key in sessionRow) fail(`session row leaks ${key}`);
}
if (!(sessionRow.durationMs >= 0)) fail('session row has no duration');
console.log(`   ✓ session rows are projections (durationMs ${sessionRow.durationMs})`);
const student = await callable('agoraSupervisorConsole', { view: 'student', memberId: bot.memberId }, supervisor.idToken);
eq('student alias', student.alias, bot.anonName);
eq('student class', student.classId, class1.classId);
eq('student career games', student.career.gamesPlayed, 2);
eq('class games', student.classGames, 2);
const t1Detail = await callable('agoraSupervisorConsole', { view: 'teacher', schoolId, teacherId: teacher1.uid }, supervisor.idToken);
eq('teacher 1 lesson rows', t1Detail.lessonRows.length, 2);
eq('teacher 1 newest first', t1Detail.lessonRows[0].sessionId, game2.sessionId);

step('H. the system view is the admin’s alone');
eq('supervisor refused', await refuses(callable('agoraSupervisorConsole', { view: 'system' }, supervisor.idToken), DENIED), true);
const system = await callable('agoraSupervisorConsole', { view: 'system', days: 7 }, admin.idToken);
const systemSchool = system.schools.find((s) => s.schoolId === schoolId);
if (!systemSchool) fail('system view misses the school');
eq('system school supervisors', systemSchool.supervisors.map((s) => s.uid).join(), supervisor.uid);
eq('system school teachers', systemSchool.teacherCount, 2);
if (!(systemSchool.lastLessonAt > 0)) fail('system school has no lastLessonAt');
eq('gamesFinished series covers the period', system.series.gamesFinished.length, 7);
if (!(system.series.gamesFinished[6].value >= 2)) fail(`today's gamesFinished should be ≥ 2, got ${system.series.gamesFinished[6].value}`);
if (!(system.teachersActive >= 2)) fail(`teachersActive should be ≥ 2, got ${system.teachersActive}`);
console.log(`   ✓ system: gamesFinished today ${system.series.gamesFinished[6].value}, teachersActive ${system.teachersActive}`);

step('I. the backfill folds an old session once');
const oldSessionId = `${runId}-old`;
const oldStart = Date.now() - 3 * 24 * 60 * 60 * 1000;
await db.collection('agoraSessions').doc(oldSessionId).set({
	sessionId: oldSessionId,
	code: '00000',
	teacherId: teacher2.uid,
	topicPackageId: 'demo-french-revolution',
	challengeQuestionId: 'none',
	deviceMode: 'individual',
	teamSizeMax: 1,
	stage: 'ended',
	roundNumber: 0,
	participantCount: 0,
	status: 'ended',
	classId: class2.classId,
	schoolId,
	stageState: { a: { openedAt: oldStart }, b: { openedAt: oldStart + 40 * 60_000 } },
	aggregatedAt: oldStart + 60 * 60_000,
	createdAt: oldStart,
	lastUpdate: oldStart + 60 * 60_000,
});
eq('backfill is admin-only', await refuses(callable('agoraAdminBackfillTeacherAggregates', {}, supervisor.idToken), DENIED), true);
const dry = await callable('agoraAdminBackfillTeacherAggregates', { dryRun: true, limit: 500 }, admin.idToken);
if (!(dry.folded >= 1)) fail(`dry run should count the old session, got ${dry.folded}`);
eq('dry run writes nothing', (await sessionDoc(oldSessionId)).teacherAggregatedAt, undefined);
let cursor;
let foldedTotal = 0;
for (let page = 0; page < 50; page++) {
	const result = await callable('agoraAdminBackfillTeacherAggregates', { limit: 500, ...(cursor ? { cursor } : {}) }, admin.idToken);
	foldedTotal += result.folded;
	if (result.nextCursor === undefined) break;
	cursor = result.nextCursor;
}
if (!(foldedTotal >= 1)) fail(`backfill should fold the old session, got ${foldedTotal}`);
const oldAfter = await sessionDoc(oldSessionId);
if (oldAfter.teacherAggregatedAt === undefined) fail('old session not stamped teacherAggregatedAt');
eq('aggregatedAt untouched', oldAfter.aggregatedAt, oldStart + 60 * 60_000);
const agg2 = await teacherAgg(teacher2.uid);
eq('teacher 2 lessonsRun', agg2.lessonsRun, 1);
eq('old lesson duration is the 40 minutes between stage openings', agg2.perLesson[0].durationMs, 40 * 60_000);
const again = await callable('agoraAdminBackfillTeacherAggregates', { limit: 500 }, admin.idToken);
let foldedAgain = again.folded;
cursor = again.nextCursor;
while (cursor !== undefined) {
	const result = await callable('agoraAdminBackfillTeacherAggregates', { limit: 500, cursor }, admin.idToken);
	foldedAgain += result.folded;
	cursor = result.nextCursor;
}
eq('second run folds nothing', foldedAgain, 0);
eq('teacher 2 still one lesson', (await teacherAgg(teacher2.uid)).lessonsRun, 1);

step('J. removing the supervisor');
await callable('agoraAdminManageSchool', { action: 'removeSupervisor', schoolId, supervisorEmail }, admin.idToken);
const removedDoc = (await db.collection('agoraSchools').doc(schoolId).get()).data();
eq('supervisorIds empty', (removedDoc.supervisorIds ?? []).length, 0);
eq('supervisorMap key gone', removedDoc.supervisorMap?.[supervisor.uid], undefined);
eq('removed supervisor refused', await refuses(callable('agoraSupervisorConsole', { view: 'overview', days: 21 }, supervisor.idToken), DENIED), true);
eq('removed supervisor sees no supervised school', (await callable('agoraTeacherConsole', { view: 'dashboard' }, supervisor.idToken)).supervisedSchools.length, 0);

console.log('\n✓ e2e-supervisor: all green');
process.exit(0);
