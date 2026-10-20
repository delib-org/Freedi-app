import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Linked stations (docs/ia/agora-linked-app-stations.md): a student stamps
 * their own visit — opened, came back — on their own participant doc, and
 * nobody else's. The one-time codes behind the handoff are the server's
 * alone: no client reads or writes `appHandoffs`, not even the uid a code
 * was minted for.
 */
describe('agora station visits and app handoffs', () => {
	let env;

	const SESSION = 'session-linked';
	const STUDENT = 'student-linked';
	const CLASSMATE = 'student-other';
	const seatId = (uid) => `${SESSION}--${uid}`;

	function seat(uid) {
		return {
			participantId: seatId(uid),
			sessionId: SESSION,
			userId: uid,
			anonName: `name-${uid}`,
			points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
			joinedAt: 1,
			lastActive: 1,
		};
	}

	before(async () => {
		env = await makeEnv('agora-station-visits');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'agoraParticipants', seatId(STUDENT)), seat(STUDENT));
			await setDoc(doc(db, 'agoraParticipants', seatId(CLASSMATE)), seat(CLASSMATE));
			await setDoc(doc(db, 'appHandoffs', 'digest-1'), {
				uid: STUDENT,
				app: 'main',
				sessionId: SESSION,
				itemId: 'linked-1',
				statementId: 'q1',
				expiresAt: Date.now() + 300000,
				createdAt: Date.now(),
			});
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it('lets a student stamp opened and came back on their own seat', async () => {
		const db = env.authenticatedContext(STUDENT).firestore();
		await assertSucceeds(
			updateDoc(doc(db, 'agoraParticipants', seatId(STUDENT)), {
				'stationVisits.linked-1.openedAt': 10,
				lastActive: 10,
			}),
		);
		await assertSucceeds(
			updateDoc(doc(db, 'agoraParticipants', seatId(STUDENT)), {
				'stationVisits.linked-1.returnedAt': 20,
				lastActive: 20,
			}),
		);
	});

	it("refuses a stamp on a classmate's seat", async () => {
		const db = env.authenticatedContext(STUDENT).firestore();
		await assertFails(
			updateDoc(doc(db, 'agoraParticipants', seatId(CLASSMATE)), {
				'stationVisits.linked-1.openedAt': 10,
			}),
		);
	});

	it('keeps the handoff codes server-only', async () => {
		const owner = env.authenticatedContext(STUDENT).firestore();
		await assertFails(getDoc(doc(owner, 'appHandoffs', 'digest-1')));
		await assertFails(setDoc(doc(owner, 'appHandoffs', 'digest-2'), { uid: STUDENT }));
		await assertFails(updateDoc(doc(owner, 'appHandoffs', 'digest-1'), { expiresAt: 0 }));
		const stranger = env.unauthenticatedContext().firestore();
		await assertFails(getDoc(doc(stranger, 'appHandoffs', 'digest-1')));
	});
});
