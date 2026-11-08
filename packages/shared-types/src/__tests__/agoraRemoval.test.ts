import {
	AGORA_REJOIN,
	isRejoinDeclined,
	isRejoinPending,
	isRemovedFromAgoraSession,
	pendingRejoinRequests,
	rejoinAllowedAt,
	removalOf,
} from '../models/agora';

const removed = (extra: Record<string, number> = {}) => ({
	removedAt: 1000,
	anonName: 'Blue Fox',
	...extra,
});

describe('isRemovedFromAgoraSession', () => {
	it('is true only for a uid on the block list', () => {
		const session = { removedUids: { 'uid-a': removed() } };
		expect(isRemovedFromAgoraSession(session, 'uid-a')).toBe(true);
		expect(isRemovedFromAgoraSession(session, 'uid-b')).toBe(false);
		expect(removalOf(session, 'uid-a')?.anonName).toBe('Blue Fox');
	});

	it('is false for a session with no block list, a missing session or no uid', () => {
		expect(isRemovedFromAgoraSession({}, 'uid-a')).toBe(false);
		expect(isRemovedFromAgoraSession(null, 'uid-a')).toBe(false);
		expect(isRemovedFromAgoraSession(undefined, 'uid-a')).toBe(false);
		expect(isRemovedFromAgoraSession({ removedUids: { 'uid-a': removed() } }, null)).toBe(false);
	});

	it('does not treat inherited object keys as removals', () => {
		expect(isRemovedFromAgoraSession({ removedUids: {} }, 'toString')).toBe(false);
		expect(isRemovedFromAgoraSession({ removedUids: {} }, 'constructor')).toBe(false);
	});
});

describe('the knock to come back', () => {
	it('no request: not pending, not declined, may knock now', () => {
		const entry = removed();
		expect(isRejoinPending(entry)).toBe(false);
		expect(isRejoinDeclined(entry)).toBe(false);
		expect(rejoinAllowedAt(entry)).toBe(0);
	});

	it('a request is pending until the teacher answers it', () => {
		expect(isRejoinPending(removed({ requestedAt: 2000 }))).toBe(true);
	});

	it('a decline answers the request before it; a newer knock is pending again', () => {
		const declined = removed({ requestedAt: 2000, declinedAt: 3000 });
		expect(isRejoinPending(declined)).toBe(false);
		expect(isRejoinDeclined(declined)).toBe(true);
		expect(rejoinAllowedAt(declined)).toBe(3000 + AGORA_REJOIN.REQUEST_COOLDOWN_MS);

		const again = removed({ requestedAt: 9000, declinedAt: 3000 });
		expect(isRejoinPending(again)).toBe(true);
		expect(isRejoinDeclined(again)).toBe(false);
		expect(rejoinAllowedAt(again)).toBe(0);
	});

	it('lists pending requests only, oldest first, with the old pseudonym', () => {
		const session = {
			removedUids: {
				late: { ...removed({ requestedAt: 5000 }), anonName: 'Red Owl' },
				early: removed({ requestedAt: 4000 }),
				quiet: removed(),
				answered: removed({ requestedAt: 2000, declinedAt: 3000 }),
			},
		};
		expect(pendingRejoinRequests(session)).toEqual([
			{ uid: 'early', anonName: 'Blue Fox', requestedAt: 4000 },
			{ uid: 'late', anonName: 'Red Owl', requestedAt: 5000 },
		]);
		expect(pendingRejoinRequests(null)).toEqual([]);
	});
});
