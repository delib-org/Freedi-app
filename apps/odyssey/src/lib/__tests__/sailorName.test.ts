import { describe, expect, it } from 'vitest';
import { GUEST_NAME, publicSailorName } from '../sailorName';

describe('publicSailorName', () => {
	it('shows only the first name of a named player', () => {
		expect(publicSailorName('דנה כהן', false)).toBe('דנה');
	});

	it('calls anonymous players a guest even if a name is present', () => {
		expect(publicSailorName('דנה', true)).toBe(GUEST_NAME);
	});

	it('falls back to guest for missing, empty and legacy names', () => {
		expect(publicSailorName(undefined)).toBe(GUEST_NAME);
		expect(publicSailorName('   ')).toBe(GUEST_NAME);
		expect(publicSailorName('מפליג/ה')).toBe(GUEST_NAME);
	});

	it('never exposes an email', () => {
		expect(publicSailorName('someone@example.com', false)).toBe(GUEST_NAME);
	});
});
