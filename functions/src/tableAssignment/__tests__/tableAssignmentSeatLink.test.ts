import type { TableAssignmentParticipant } from '@freedi/shared-types';
import { FakeFirestore } from '../../classroom/__tests__/fakeFirestore';
import { cancelRegistration } from '../fn_tablesCancelRegistration';
import { register } from '../fn_tablesRegister';
import { seatLink } from '../fn_tablesSeatLink';
import { setStatus } from '../fn_tablesSetStatus';
import { isWellFormedSeatCode, newSeatCode, seatCodeHash } from '../seatCodes';
import { rosterEntryFrom } from '../roster';
import {
	HOST,
	NOW,
	SID,
	expectRefusal,
	participantPath,
	rosterPath,
	seedCounter,
	seedRegistration,
	seedSession,
	seedTopics,
} from './tablesTestKit';

/** The personal link (IA tables-class-bridge 5.1), Tables side. */

const codePath = (code: string): string => `tableAssignmentSeatCodes/${seatCodeHash(code)}`;

function connectedRoom(overrides: Record<string, unknown> = {}): FakeFirestore {
	const fake = new FakeFirestore();
	seedSession(fake, { contextStatementId: 'lesson-1', ...overrides }, { allowReturnByName: true });
	seedTopics(fake, ['a']);
	seedRegistration(fake, 'u1', { fullName: 'Dana Levi', preferences: ['a'] });
	seedCounter(fake, 1);

	return fake;
}

describe('newSeatCode', () => {
	it('makes long random URL-safe codes that never repeat', () => {
		const codes = new Set(Array.from({ length: 200 }, () => newSeatCode()));

		expect(codes.size).toBe(200);
		for (const code of codes) expect(isWellFormedSeatCode(code)).toBe(true);
	});

	it('refuses anything that does not look like one of its codes', () => {
		for (const bad of ['', 'short', 'a/b'.repeat(20), 42, undefined, 'x'.repeat(65)]) {
			expect(isWellFormedSeatCode(bad)).toBe(false);
		}
	});
});

describe('tablesSeatLink', () => {
	it('makes the code once, stores it on the owner record and its hash in the server map', async () => {
		const fake = connectedRoom();
		const first = await seatLink(fake.asFirestore(), 'u1', { sessionId: SID }, NOW, () =>
			'c'.repeat(43),
		);

		expect(first).toEqual({ seatCode: 'c'.repeat(43) });
		expect(fake.read(participantPath('u1'))).toMatchObject({ seatCode: first.seatCode });
		expect(fake.read(codePath(first.seatCode))).toEqual({
			sessionId: SID,
			uid: 'u1',
			createdAt: NOW,
		});
		// The map is keyed by the hash: the code itself is nowhere in it.
		expect(JSON.stringify(fake.list('tableAssignmentSeatCodes'))).not.toContain(first.seatCode);
	});

	it('answers the same code every time (the link is reusable)', async () => {
		const fake = connectedRoom();
		const firestore = fake.asFirestore();
		const first = await seatLink(firestore, 'u1', { sessionId: SID });
		const again = await seatLink(firestore, 'u1', { sessionId: SID });

		expect(again).toEqual(first);
		expect(fake.list('tableAssignmentSeatCodes')).toHaveLength(1);
	});

	it('never puts the code on the name card others read', async () => {
		const fake = connectedRoom();
		await seatLink(fake.asFirestore(), 'u1', { sessionId: SID });
		const stored = fake.read(participantPath('u1')) as TableAssignmentParticipant;

		expect(rosterEntryFrom(stored)).not.toHaveProperty('seatCode');
		expect(fake.read(rosterPath('u1'))).not.toHaveProperty('seatCode');
	});

	it('refuses when no lesson uses the session, when not registered, and once ended', async () => {
		await expectRefusal(
			seatLink(connectedRoom({ contextStatementId: undefined }).asFirestore(), 'u1', {
				sessionId: SID,
			}),
			'failed-precondition',
			'not-connected',
		);
		await expectRefusal(
			seatLink(connectedRoom().asFirestore(), 'stranger', { sessionId: SID }),
			'failed-precondition',
			'not-registered',
		);
		await expectRefusal(
			seatLink(connectedRoom({ status: 'ended' }).asFirestore(), 'u1', { sessionId: SID }),
			'failed-precondition',
		);
	});

	it('ends the link when the registration is cancelled', async () => {
		const fake = connectedRoom();
		const { seatCode } = await seatLink(fake.asFirestore(), 'u1', { sessionId: SID });
		await cancelRegistration(fake.asFirestore(), 'u1', { sessionId: SID });

		expect(fake.read(codePath(seatCode))).toBeUndefined();
	});

	it('keeps the link with a registration continued on another browser by full name', async () => {
		const fake = connectedRoom();
		const { seatCode } = await seatLink(fake.asFirestore(), 'u1', { sessionId: SID });
		await register(
			fake.asFirestore(),
			'u2',
			{ sessionId: SID, fullName: 'dana  LEVI', nameMatch: 'claim' },
			NOW,
		);

		expect(fake.read(participantPath('u2'))).toMatchObject({ seatCode, claimedByName: true });
		expect(fake.read(codePath(seatCode))).toMatchObject({ sessionId: SID, uid: 'u2' });
	});

	it('removes every code of the session when it ends', async () => {
		const fake = connectedRoom({ status: 'published' });
		const { seatCode } = await seatLink(fake.asFirestore(), 'u1', { sessionId: SID });
		await setStatus(fake.asFirestore(), HOST, { sessionId: SID, status: 'ended' }, NOW);

		expect(fake.read(codePath(seatCode))).toBeUndefined();
		expect(fake.read(participantPath('u1'))).not.toHaveProperty('seatCode');
	});
});
