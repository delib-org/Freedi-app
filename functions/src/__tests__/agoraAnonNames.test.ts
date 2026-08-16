import { generateAnonName } from '../agora/anonNames';

/**
 * A class does not trickle in — it arrives at once, on a teacher's "scan this
 * code". Three students joining 26ms apart in production all received the name
 * "פנס אמיץ" (session BxDE3d1DmbLq): agoraJoinSession read participantCount
 * from a snapshot taken before the transaction, so every concurrent join saw
 * the same count.
 *
 * The fix is in fn_agoraJoinSession — the count is now read inside the
 * transaction that writes the participant, so indices are handed out once each.
 * These tests pin the property that fix relies on: distinct indices must give
 * distinct names, across the whole range a classroom can reach.
 */
describe('generateAnonName', () => {
	it('gives every index in a large class a distinct name', () => {
		const names = new Set<string>();
		for (let index = 0; index < 100; index++) names.add(generateAnonName('he', index));
		expect(names.size).toBe(100);
	});

	it('stays distinct past the combination space, where the suffix takes over', () => {
		// 10 adjectives × 10 nouns = 100 combinations; 101 must not repeat 1.
		expect(generateAnonName('he', 100)).not.toBe(generateAnonName('he', 0));
		expect(generateAnonName('en', 100)).not.toBe(generateAnonName('en', 0));

		const names = new Set<string>();
		for (let index = 0; index < 250; index++) names.add(generateAnonName('en', index));
		expect(names.size).toBe(250);
	});

	it('is deterministic — the same index is always the same traveler', () => {
		expect(generateAnonName('he', 7)).toBe(generateAnonName('he', 7));
	});

	it('falls back to English for an unknown language rather than throwing', () => {
		expect(generateAnonName('fr', 0)).toBe(generateAnonName('en', 0));
	});

	it('orders the words per language', () => {
		// Hebrew reads noun-then-adjective; English adjective-then-noun.
		expect(generateAnonName('he', 0)).toBe('פנס אמיץ');
		expect(generateAnonName('en', 0)).toBe('Brave Lantern');
	});
});
