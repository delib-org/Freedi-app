import { isRemovedFromAgoraSession } from '../models/agora';

describe('isRemovedFromAgoraSession', () => {
	it('is true only for a uid on the block list', () => {
		const session = { removedUids: { 'uid-a': 1000 } };
		expect(isRemovedFromAgoraSession(session, 'uid-a')).toBe(true);
		expect(isRemovedFromAgoraSession(session, 'uid-b')).toBe(false);
	});

	it('is false for a session with no block list, a missing session or no uid', () => {
		expect(isRemovedFromAgoraSession({}, 'uid-a')).toBe(false);
		expect(isRemovedFromAgoraSession(null, 'uid-a')).toBe(false);
		expect(isRemovedFromAgoraSession(undefined, 'uid-a')).toBe(false);
		expect(isRemovedFromAgoraSession({ removedUids: { '': 1 } }, '')).toBe(false);
		expect(isRemovedFromAgoraSession({ removedUids: { 'uid-a': 1 } }, null)).toBe(false);
	});

	it('does not treat inherited object keys as removals', () => {
		expect(isRemovedFromAgoraSession({ removedUids: {} }, 'toString')).toBe(false);
		expect(isRemovedFromAgoraSession({ removedUids: {} }, 'constructor')).toBe(false);
	});
});
