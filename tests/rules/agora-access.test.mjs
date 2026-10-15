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
 * Access requests (`agoraAccessRequests`): the applicant reads their own, a
 * sys-admin reads all, coordinators and everyone else read nothing directly
 * (they go through agoraManageAccess). Nobody writes from a client.
 */
describe('agora access requests', () => {
	let env;

	const APPLICANT = 'applicant-1';
	const OTHER = 'applicant-2';
	const COORDINATOR = 'coordinator-1';
	const ADMIN = 'admin-1';
	const SCHOOL = 'school-1';

	function accessRequest(id, uid, overrides = {}) {
		return {
			requestId: id,
			uid,
			role: 'teacher',
			fullName: 'Dana Levi',
			schoolId: SCHOOL,
			source: 'link',
			status: 'pending',
			createdAt: 1,
			lastUpdate: 1,
			...overrides,
		};
	}

	before(async () => {
		env = await makeEnv('agora-access');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'usersV2', ADMIN), { systemAdmin: true });
			await setDoc(doc(db, 'agoraSchools', SCHOOL), {
				schoolId: SCHOOL,
				name: 'School',
				status: 'active',
				createdBy: ADMIN,
				classCount: 0,
				supervisorIds: [COORDINATOR],
				supervisorMap: { [COORDINATOR]: true },
				createdAt: 1,
				lastUpdate: 1,
			});
			await setDoc(doc(db, 'agoraAccessRequests', 'mine'), accessRequest('mine', APPLICANT));
			await setDoc(doc(db, 'agoraAccessRequests', 'theirs'), accessRequest('theirs', OTHER));
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it('lets the applicant read their own request by id', async () => {
		const db = env.authenticatedContext(APPLICANT).firestore();
		await assertSucceeds(getDoc(doc(db, 'agoraAccessRequests', 'mine')));
	});

	it("refuses reading someone else's request by id", async () => {
		const db = env.authenticatedContext(APPLICANT).firestore();
		await assertFails(getDoc(doc(db, 'agoraAccessRequests', 'theirs')));
	});

	it('refuses a get of a missing request for a non-admin (resource == null is guarded)', async () => {
		const db = env.authenticatedContext(APPLICANT).firestore();
		await assertFails(getDoc(doc(db, 'agoraAccessRequests', 'missing')));
	});

	it('lets the applicant list only a query constrained to their own uid', async () => {
		const db = env.authenticatedContext(APPLICANT).firestore();
		await assertSucceeds(
			getDocs(query(collection(db, 'agoraAccessRequests'), where('uid', '==', APPLICANT))),
		);
		await assertFails(getDocs(collection(db, 'agoraAccessRequests')));
		await assertFails(
			getDocs(query(collection(db, 'agoraAccessRequests'), where('schoolId', '==', SCHOOL))),
		);
	});

	it("refuses a coordinator reading their school's requests directly (callable only)", async () => {
		const db = env.authenticatedContext(COORDINATOR).firestore();
		await assertFails(getDoc(doc(db, 'agoraAccessRequests', 'mine')));
		await assertFails(
			getDocs(query(collection(db, 'agoraAccessRequests'), where('schoolId', '==', SCHOOL))),
		);
	});

	it('lets a sys-admin read and list everything', async () => {
		const db = env.authenticatedContext(ADMIN).firestore();
		await assertSucceeds(getDoc(doc(db, 'agoraAccessRequests', 'theirs')));
		await assertSucceeds(getDocs(collection(db, 'agoraAccessRequests')));
	});

	it('refuses anonymous visitors', async () => {
		const db = env.unauthenticatedContext().firestore();
		await assertFails(getDoc(doc(db, 'agoraAccessRequests', 'mine')));
	});

	it('refuses every client write, even the applicant on their own request, even an admin', async () => {
		const applicant = env.authenticatedContext(APPLICANT).firestore();
		await assertFails(
			setDoc(doc(applicant, 'agoraAccessRequests', 'new'), accessRequest('new', APPLICANT)),
		);
		await assertFails(
			updateDoc(doc(applicant, 'agoraAccessRequests', 'mine'), { status: 'approved' }),
		);
		await assertFails(deleteDoc(doc(applicant, 'agoraAccessRequests', 'mine')));
		const admin = env.authenticatedContext(ADMIN).firestore();
		await assertFails(updateDoc(doc(admin, 'agoraAccessRequests', 'mine'), { status: 'approved' }));
	});

	it('refuses a client writing its own approval marker (grant is server-only)', async () => {
		const db = env.authenticatedContext(APPLICANT).firestore();
		await assertFails(
			setDoc(doc(db, 'agoraApprovedTeachers', APPLICANT), {
				teacherId: APPLICANT,
				via: 'granted',
				checkedAt: 1,
				grant: { source: 'request', grantedAt: 1, grantedBy: APPLICANT },
			}),
		);
	});
});
