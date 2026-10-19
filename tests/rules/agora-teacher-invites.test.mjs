import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	where,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Teacher email invites (`agoraTeacherInvites`): they hold an email address,
 * so only system admins (the people who manage a school's teachers) read
 * them. Nobody writes from a client — agoraAdminManageSchool files, re-sends
 * and cancels them, and the claim on sign-in happens server-side.
 */
describe('agora teacher invites', () => {
	let env;

	const ADMIN = 'admin-1';
	const TEACHER = 'teacher-1';
	const COORDINATOR = 'coordinator-1';
	const INVITED = 'invited-1';
	const SCHOOL = 'school-1';
	const INVITE_ID = `${SCHOOL}--abc`;

	const invite = {
		inviteId: INVITE_ID,
		schoolId: SCHOOL,
		email: 'new.teacher@school.org',
		status: 'pending',
		invitedBy: ADMIN,
		lastSentAt: 1,
		sendCount: 1,
		createdAt: 1,
		lastUpdate: 1,
	};

	before(async () => {
		env = await makeEnv('agora-teacher-invites');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'usersV2', ADMIN), { systemAdmin: true });
			await setDoc(doc(db, 'usersV2', TEACHER), { email: 'teacher@school.org' });
			await setDoc(doc(db, 'agoraSchools', SCHOOL), {
				schoolId: SCHOOL,
				name: 'School',
				status: 'active',
				createdBy: ADMIN,
				classCount: 0,
				teacherIds: [TEACHER],
				teacherMap: { [TEACHER]: true },
				supervisorIds: [COORDINATOR],
				supervisorMap: { [COORDINATOR]: true },
				createdAt: 1,
				lastUpdate: 1,
			});
			await setDoc(doc(db, 'agoraTeacherInvites', INVITE_ID), invite);
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it("lets a sys-admin read an invite and list a school's invites", async () => {
		const db = env.authenticatedContext(ADMIN).firestore();
		await assertSucceeds(getDoc(doc(db, 'agoraTeacherInvites', INVITE_ID)));
		await assertSucceeds(
			getDocs(query(collection(db, 'agoraTeacherInvites'), where('schoolId', '==', SCHOOL))),
		);
	});

	it('refuses reads to teachers, coordinators, the invited person and strangers', async () => {
		for (const uid of [TEACHER, COORDINATOR, INVITED]) {
			const db = env.authenticatedContext(uid, { email: invite.email, email_verified: true }).firestore();
			await assertFails(getDoc(doc(db, 'agoraTeacherInvites', INVITE_ID)));
			await assertFails(
				getDocs(query(collection(db, 'agoraTeacherInvites'), where('schoolId', '==', SCHOOL))),
			);
			await assertFails(
				getDocs(query(collection(db, 'agoraTeacherInvites'), where('email', '==', invite.email))),
			);
		}
		const anon = env.unauthenticatedContext().firestore();
		await assertFails(getDoc(doc(anon, 'agoraTeacherInvites', INVITE_ID)));
	});

	it('refuses every client write, even from a sys-admin', async () => {
		for (const uid of [ADMIN, TEACHER, INVITED]) {
			const db = env.authenticatedContext(uid).firestore();
			await assertFails(setDoc(doc(db, 'agoraTeacherInvites', `${SCHOOL}--new`), { ...invite }));
			await assertFails(
				updateDoc(doc(db, 'agoraTeacherInvites', INVITE_ID), { status: 'accepted', acceptedBy: uid }),
			);
			await assertFails(deleteDoc(doc(db, 'agoraTeacherInvites', INVITE_ID)));
		}
	});
});
