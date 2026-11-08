/* Teacher self-serve classes, end to end.
 *
 * The sys-admin opens a school and attaches a teacher by email → the teacher
 * opens their own class (grade + label) → the dashboard lists the school and
 * the class → a co-teacher is added by email and named in the class view →
 * the last teacher cannot leave → a teacher outside the school cannot open a
 * class in it → a stranger cannot rename → archiving gives the seat back.
 *
 * Asserts Firestore state, not pixels. Run: npx tsx scripts/e2e-teacher-classes.mjs
 */
import { preflight } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { callable, db, signInTeacher } from './lib/fastlane.ts';

await preflight();

const runId = `tclass-${Date.now().toString(36)}`;
const refuses = (promise, pattern) =>
	promise.then(
		() => false,
		(error) => pattern.test(String(error)),
	);

step('A. the admin opens a school and attaches the teacher');
const admin = await signInTeacher(`${runId}-sysadmin`);
await db.collection('usersV2').doc(admin.uid).set({ systemAdmin: true }, { merge: true });
const teacher = await signInTeacher(`${runId}-teacher`);
const teacherEmail = `${runId}-teacher@example.com`;
await db.collection('usersV2').doc(teacher.uid).set({ email: teacherEmail, displayName: 'דנה המורה' }, { merge: true });
const mate = await signInTeacher(`${runId}-mate`);
const mateEmail = `${runId}-mate@example.com`;
await db.collection('usersV2').doc(mate.uid).set({ email: mateEmail }, { merge: true });
const outsider = await signInTeacher(`${runId}-outsider`);

const { schoolId } = await callable('agoraAdminManageSchool', { action: 'create', name: 'תיכון הדגמה' }, admin.idToken);
const assigned = await callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail }, admin.idToken);
eq('assigned uid echoed', assigned.teacherUid, teacher.uid);
const school = (await db.collection('agoraSchools').doc(schoolId).get()).data();
eq('school teacherIds', school.teacherIds.join(), teacher.uid);
eq('school teacherMap', school.teacherMap[teacher.uid], true);
eq('a teacher cannot assign school teachers', await refuses(callable('agoraAdminManageSchool', { action: 'assignTeacher', schoolId, teacherEmail: mateEmail }, teacher.idToken), /PERMISSION_DENIED|System admin/i), true);

step('B. the teacher opens their own class');
const before = await callable('agoraTeacherConsole', { view: 'dashboard' }, teacher.idToken);
eq('dashboard lists the school', before.schools.map((s) => s.schoolId).join(), schoolId);
eq('no classes yet', before.classes.length, 0);
const created = await callable('agoraTeacherClass', { action: 'create', name: " ז'2 ", gradeLevel: 'ז' }, teacher.idToken);
if (!created.classCode || created.classCode.length !== 6) fail(`class code should be 6 chars, got ${created.classCode}`);
const stored = (await db.collection('agoraClasses').doc(created.classId).get()).data();
eq('class in the school', stored.schoolId, schoolId);
eq('label trimmed', stored.name, "ז'2");
eq('grade kept', stored.gradeLevel, 'ז');
eq('teacher on it', stored.teacherIds.join(), teacher.uid);
eq('teacher index', stored.teacherMap[teacher.uid], true);
eq('opened by the teacher', stored.createdBy, teacher.uid);
eq('school classCount +1', (await db.collection('agoraSchools').doc(schoolId).get()).data().classCount, 1);
const after = await callable('agoraTeacherConsole', { view: 'dashboard' }, teacher.idToken);
eq('dashboard lists the class', after.classes.map((c) => c.classId).join(), created.classId);

step('C. co-teachers');
const added = await callable('agoraTeacherClass', { action: 'addTeacher', classId: created.classId, teacherEmail: mateEmail }, teacher.idToken);
eq('co-teacher uid', added.teacherUid, mate.uid);
const detail = await callable('agoraTeacherConsole', { view: 'class', classId: created.classId }, mate.idToken);
eq('two teachers named', detail.teachers.length, 2);
eq('display name used', detail.teachers.find((t) => t.uid === teacher.uid).name, 'דנה המורה');
const mateName = detail.teachers.find((t) => t.uid === mate.uid).name;
eq('email never returned whole', mateName.includes(mateEmail), false);
eq('unknown email refused', await refuses(callable('agoraTeacherClass', { action: 'addTeacher', classId: created.classId, teacherEmail: 'nobody@example.com' }, teacher.idToken), /NOT_FOUND|No account/i), true);
await callable('agoraTeacherClass', { action: 'removeTeacher', classId: created.classId, teacherUid: mate.uid }, teacher.idToken);
eq('co-teacher removed', (await db.collection('agoraClasses').doc(created.classId).get()).data().teacherIds.join(), teacher.uid);
eq('the last teacher cannot leave', await refuses(callable('agoraTeacherClass', { action: 'removeTeacher', classId: created.classId, teacherUid: teacher.uid }, teacher.idToken), /FAILED_PRECONDITION|at least one/i), true);

step('D. doors that stay shut');
eq('outsider cannot open a class', await refuses(callable('agoraTeacherClass', { action: 'create', name: 'פולש' }, outsider.idToken), /PERMISSION_DENIED|attach you/i), true);
eq('outsider cannot name the school either', await refuses(callable('agoraTeacherClass', { action: 'create', schoolId, name: 'פולש' }, outsider.idToken), /PERMISSION_DENIED|attach you/i), true);
eq('stranger cannot rename', await refuses(callable('agoraTeacherClass', { action: 'rename', classId: created.classId, name: 'שלי' }, outsider.idToken), /PERMISSION_DENIED|teacher of this class/i), true);
eq('blank label refused', await refuses(callable('agoraTeacherClass', { action: 'create', name: '   ' }, teacher.idToken), /INVALID_ARGUMENT|needs a name/i), true);

step('E. rename and archive');
await callable('agoraTeacherClass', { action: 'rename', classId: created.classId, name: "ז'3", gradeLevel: 'ז' }, teacher.idToken);
eq('renamed', (await db.collection('agoraClasses').doc(created.classId).get()).data().name, "ז'3");
await callable('agoraTeacherClass', { action: 'archive', classId: created.classId }, teacher.idToken);
const archived = (await db.collection('agoraClasses').doc(created.classId).get()).data();
eq('archived', archived.status, 'archived');
eq('school classCount back to 0', (await db.collection('agoraSchools').doc(schoolId).get()).data().classCount, 0);
const gone = await callable('agoraTeacherConsole', { view: 'dashboard' }, teacher.idToken);
eq('archived class off the dashboard', gone.classes.length, 0);

console.log('\n✓ e2e-teacher-classes: all green');
