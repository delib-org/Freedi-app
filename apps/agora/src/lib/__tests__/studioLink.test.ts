import { describe, expect, it } from 'vitest';
import { studioAgoraUrl } from '../studioLink';

describe('studioAgoraUrl', () => {
	it("points at Studio's Agora overview", () => {
		expect(studioAgoraUrl('https://studio.example.com')).toBe('https://studio.example.com/agora');
		expect(studioAgoraUrl('https://studio.example.com/')).toBe('https://studio.example.com/agora');
	});

	it('gives no link when no origin is configured', () => {
		expect(studioAgoraUrl(undefined)).toBe('');
		expect(studioAgoraUrl('  ')).toBe('');
	});
});
