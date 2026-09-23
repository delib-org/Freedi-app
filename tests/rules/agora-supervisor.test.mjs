import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Supervision reads nothing from Firestore directly. The teacher aggregate
 * and usage collections are sys-admin-only; a supervisor — who is, to the
 * rules, just another signed-in user — gets everything through the
 * agoraSupervisorConsole callable, and nobody writes any of it.
 */
describe('agora supervision collections', () => {
	let env;

	before(async () => {
		env = await makeEnv('agora-supervisor');
	});

	after(async () => {
		await env?.cleanup();
	});

	const SYSADMIN = 'sysadmin-1';
	const SUPERVISOR = 'supervisor-1';
	const TEACHER = 'teacher-1';
	const SCHOOL = 'school-1';
	const CLASS = 'class-1';
	const MEMBER = 'member-1';
	const MONTH = '2026-03';

	before(async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'usersV2', SYSADMIN), { systemAdmin: true });
			await setDoc(doc(db, 'agoraSchools', SCHOOL), {
				schoolId: SCHOOL,
				name: 'Alpha',
				status: 'active',
				createdBy: SYSADMIN,
				classCount: 1,
				teacherIds: [TEACHER],
				teacherMap: { [TEACHER]: true },
				supervisorIds: [SUPERVISOR],
				supervisorMap: { [SUPERVISOR]: true },
				createdAt: 1_700_000_000_000,
				lastUpdate: 1_700_000_000_000,
			});
			await setDoc(doc(db, 'agoraClasses', CLASS), {
				classId: CLASS,
				schoolId: SCHOOL,
				name: 'ז2',
				teacherIds: [TEACHER],
				teacherMap: { [TEACHER]: true },
				classCode: '123456',
				memberCount: 1,
				status: 'active',
				createdBy: SYSADMIN,
				createdAt: 1_700_000_000_000,
				lastUpdate: 1_700_000_000_000,
			});
			await setDoc(doc(db, 'agoraClassMembers', `${CLASS}--${MEMBER}`), {
				memberId: MEMBER,
				classId: CLASS,
				schoolId: SCHOOL,
				alias: 'שועל',
				currentUid: 'student-1',
				status: 'active',
				joinedAt: 1_700_000_000_000,
				lastActive: 1_700_000_000_000,
				lastUpdate: 1_700_000_000_000,
			});
			await setDoc(doc(db, 'agoraStudentAggregates', MEMBER), {
				memberId: MEMBER,
				classId: CLASS,
				schoolId: SCHOOL,
				gamesPlayed: 1,
			});
			await setDoc(doc(db, 'agoraTeacherAggregates', TEACHER), {
				teacherId: TEACHER,
				lessonsRun: 3,
				classLessons: 2,
			});
			await setDoc(doc(db, 'agoraTeacherUsage', `${TEACHER}--${MONTH}`), {
				teacherId: TEACHER,
				month: MONTH,
				activeMs: 60_000,
			});
		});
	});

	describe('agoraTeacherAggregates / agoraTeacherUsage', () => {
		it('lets the sys-admin get and list both', async () => {
			const db = env.authenticatedContext(SYSADMIN).firestore();
			await assertSucceeds(getDoc(doc(db, 'agoraTeacherAggregates', TEACHER)));
			await assertSucceeds(getDocs(collection(db, 'agoraTeacherAggregates')));
			await assertSucceeds(getDoc(doc(db, 'agoraTeacherUsage', `${TEACHER}--${MONTH}`)));
			await assertSucceeds(
				getDocs(query(collection(db, 'agoraTeacherUsage'), where('teacherId', '==', TEACHER))),
			);
		});

		it('refuses a teacher reading their OWN aggregate and usage', async () => {
			const db = env.authenticatedContext(TEACHER).firestore();
			await assertFails(getDoc(doc(db, 'agoraTeacherAggregates', TEACHER)));
			await assertFails(getDoc(doc(db, 'agoraTeacherUsage', `${TEACHER}--${MONTH}`)));
		});

		it('refuses a supervisor reading them directly', async () => {
			const db = env.authenticatedContext(SUPERVISOR).firestore();
			await assertFails(getDoc(doc(db, 'agoraTeacherAggregates', TEACHER)));
			await assertFails(
				getDocs(query(collection(db, 'agoraTeacherUsage'), where('teacherId', '==', TEACHER))),
			);
		});

		it('refuses every client write, the sys-admin included', async () => {
			const admin = env.authenticatedContext(SYSADMIN).firestore();
			await assertFails(
				setDoc(doc(admin, 'agoraTeacherAggregates', 'forged'), { teacherId: 'forged', lessonsRun: 99 }),
			);
			await assertFails(updateDoc(doc(admin, 'agoraTeacherAggregates', TEACHER), { lessonsRun: 99 }));
			const teacher = env.authenticatedContext(TEACHER).firestore();
			await assertFails(
				setDoc(doc(teacher, 'agoraTeacherUsage', `${TEACHER}--2026-04`), {
					teacherId: TEACHER,
					month: '2026-04',
					activeMs: 10_000_000,
				}),
			);
		});
	});

	describe('a supervisor is a plain user to the rules', () => {
		it('cannot list the school’s classes', async () => {
			const db = env.authenticatedContext(SUPERVISOR).firestore();
			await assertFails(
				getDocs(query(collection(db, 'agoraClasses'), where('schoolId', '==', SCHOOL))),
			);
		});

		it('cannot list the roster', async () => {
			const db = env.authenticatedContext(SUPERVISOR).firestore();
			await assertFails(
				getDocs(query(collection(db, 'agoraClassMembers'), where('classId', '==', CLASS))),
			);
		});

		it('cannot get a career', async () => {
			const db = env.authenticatedContext(SUPERVISOR).firestore();
			await assertFails(getDoc(doc(db, 'agoraStudentAggregates', MEMBER)));
		});

		it('cannot list the schools it supervises (the callable does that)', async () => {
			const db = env.authenticatedContext(SUPERVISOR).firestore();
			await assertFails(
				getDocs(
					query(collection(db, 'agoraSchools'), where(`supervisorMap.${SUPERVISOR}`, '==', true)),
				),
			);
		});
	});

	describe('supervisorMap is callable-owned', () => {
		it('refuses the supervisor, a teacher and the sys-admin writing it', async () => {
			for (const uid of [SUPERVISOR, TEACHER, SYSADMIN]) {
				const db = env.authenticatedContext(uid).firestore();
				await assertFails(
					updateDoc(doc(db, 'agoraSchools', SCHOOL), { [`supervisorMap.${uid}`]: true }),
				);
				await assertFails(
					updateDoc(doc(db, 'agoraSchools', SCHOOL), {
						[`supervisorScopes.${SUPERVISOR}`]: { teacherIds: [] },
					}),
				);
			}
		});
	});
});
