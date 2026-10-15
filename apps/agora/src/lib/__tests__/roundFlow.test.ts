import { describe, expect, it } from 'vitest';
import { roundRatedCount } from '../flows/roundFlow';

// The deal itself is server-side now (agoraHands); see handFlow.test.ts and
// shared-types' agoraHand.test.ts for who gets which texts.
describe('roundRatedCount', () => {
	it('counts what I weighed among the dealt', () => {
		expect(roundRatedCount(['a', 'b', 'c'], new Set(['b', 'z']))).toBe(1);
		expect(roundRatedCount([], new Set(['b']))).toBe(0);
	});
});
