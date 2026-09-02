import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * "Start a question with AI" — plan sessions, scheduled actions and the
 * per-user AI rate limit are Cloud-Function-only writes:
 *  1. a plan session is readable only by its creator (and sysadmins);
 *  2. scheduled actions are readable by members of the owning organization,
 *     listed with an `organizationId ==` filter;
 *  3. nothing here is client-writable; the rate-limit doc is not even readable.
 */
describe('studio plans', () => {
	let env;

	before(async () => {
		env = await makeEnv('studio');
	});

	after(async () => {
		await env?.cleanup();
	});

	const SYSADMIN = 'sysadmin-1';
	const OWNER = 'consultant-owner';
	const MEMBER = 'consultant-admin';
	const STRANGER = 'stranger';
	const ORG = 'org-1';
	const SESSION = 'session-1';
	const ACTION = 'action-1';
	const NOW = 1_700_000_000_000;

	function memberDoc(uid, role) {
		return {
			memberId: `${ORG}--${uid}`,
			organizationId: ORG,
			userId: uid,
			email: `${uid}@example.com`,
			displayName: uid,
			role,
			addedAt: NOW,
			addedBy: SYSADMIN,
			lastUpdate: NOW,
		};
	}

	const sessionDoc = {
		sessionId: SESSION,
		organizationId: ORG,
		organizationName: 'Acme',
		createdBy: OWNER,
		language: 'he',
		uiLanguage: 'he',
		timezone: 'Asia/Jerusalem',
		status: 'draft',
		messages: [],
		planVersion: 0,
		readyToBuild: false,
		userTurns: 0,
		createdAt: NOW,
		lastUpdate: NOW,
	};

	const actionDoc = {
		scheduledActionId: ACTION,
		statementId: 'child-1',
		topParentId: 'top-1',
		organizationId: ORG,
		action: 'open',
		runAt: NOW + 86_400_000,
		status: 'pending',
		createdBy: OWNER,
		source: 'plan',
		createdAt: NOW,
		lastUpdate: NOW,
	};

	before(async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'usersV2', SYSADMIN), { uid: SYSADMIN, systemAdmin: true });
			await setDoc(doc(db, 'organizationMembers', `${ORG}--${OWNER}`), memberDoc(OWNER, 'owner'));
			await setDoc(doc(db, 'organizationMembers', `${ORG}--${MEMBER}`), memberDoc(MEMBER, 'admin'));
			await setDoc(doc(db, 'studioPlanSessions', SESSION), sessionDoc);
			await setDoc(doc(db, 'scheduledActions', ACTION), actionDoc);
			await setDoc(doc(db, 'studioRateLimits', OWNER), { windowStart: NOW, count: 3 });
		});
	});

	describe('/studioPlanSessions', () => {
		it('lets the creator read their session', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertSucceeds(getDoc(doc(db, 'studioPlanSessions', SESSION)));
		});

		it('lets a sysadmin read any session', async () => {
			const db = env.authenticatedContext(SYSADMIN).firestore();
			await assertSucceeds(getDoc(doc(db, 'studioPlanSessions', SESSION)));
		});

		it('rejects another org admin reading it', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertFails(getDoc(doc(db, 'studioPlanSessions', SESSION)));
		});

		it('lists only with a createdBy == me filter', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertSucceeds(
				getDocs(query(collection(db, 'studioPlanSessions'), where('createdBy', '==', OWNER))),
			);
			await assertFails(getDocs(collection(db, 'studioPlanSessions')));
		});

		it('rejects every client write', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertFails(updateDoc(doc(db, 'studioPlanSessions', SESSION), { readyToBuild: true }));
			await assertFails(setDoc(doc(db, 'studioPlanSessions', 'new'), { ...sessionDoc, sessionId: 'new' }));
		});
	});

	describe('/scheduledActions', () => {
		it('lets an org member read and list with the org filter', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertSucceeds(getDoc(doc(db, 'scheduledActions', ACTION)));
			await assertSucceeds(
				getDocs(
					query(
						collection(db, 'scheduledActions'),
						where('organizationId', '==', ORG),
						where('topParentId', '==', 'top-1'),
					),
				),
			);
		});

		it('rejects a stranger and an unfiltered list', async () => {
			const stranger = env.authenticatedContext(STRANGER).firestore();
			await assertFails(getDoc(doc(stranger, 'scheduledActions', ACTION)));
			await assertFails(getDocs(query(collection(stranger, 'scheduledActions'), where('organizationId', '==', ORG))));
			const member = env.authenticatedContext(MEMBER).firestore();
			await assertFails(getDocs(collection(member, 'scheduledActions')));
		});

		it('rejects client writes (cancel goes through the callable)', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertFails(updateDoc(doc(db, 'scheduledActions', ACTION), { status: 'cancelled' }));
			await assertFails(setDoc(doc(db, 'scheduledActions', 'new'), { ...actionDoc, scheduledActionId: 'new' }));
		});
	});

	describe('/studioRateLimits', () => {
		it('is neither readable nor writable by its own user', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertFails(getDoc(doc(db, 'studioRateLimits', OWNER)));
			await assertFails(setDoc(doc(db, 'studioRateLimits', OWNER), { count: 0 }));
		});
	});
});
