import { AGORA_LIMITS, isAgoraTextLongEnough } from '../models/agora';

describe('isAgoraTextLongEnough', () => {
	it('uses a four-character minimum', () => {
		expect(AGORA_LIMITS.MIN_TEXT_LENGTH).toBe(4);
	});

	it('refuses empty and whitespace-only text', () => {
		expect(isAgoraTextLongEnough('')).toBe(false);
		expect(isAgoraTextLongEnough('     \n\t ')).toBe(false);
	});

	it('refuses text one character short of the minimum', () => {
		expect(isAgoraTextLongEnough('abc')).toBe(false);
		expect(isAgoraTextLongEnough('שלו')).toBe(false);
	});

	it('accepts text at exactly the minimum, in Latin, Hebrew and Arabic', () => {
		expect(isAgoraTextLongEnough('abcd')).toBe(true);
		expect(isAgoraTextLongEnough('שלום')).toBe(true);
		expect(isAgoraTextLongEnough('سلام')).toBe(true);
	});

	it('counts the trimmed text, not the surrounding whitespace', () => {
		expect(isAgoraTextLongEnough('   abc   ')).toBe(false);
		expect(isAgoraTextLongEnough('  abcd  ')).toBe(true);
	});
});
