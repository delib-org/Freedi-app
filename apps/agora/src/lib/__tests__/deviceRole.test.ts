import { describe, expect, it } from 'vitest';
import { decideDeviceRole, nextNeedsArming } from '../flows/deviceRole';

const laptop = { stored: null, coarsePointer: false, viewportWidth: 1280, namesCollected: true };
const phone = { stored: null, coarsePointer: true, viewportWidth: 390, namesCollected: true };

describe('decideDeviceRole', () => {
	it('treats a phone in the hand as private without asking', () => {
		expect(decideDeviceRole(phone)).toEqual({ role: 'private', ask: false });
	});

	it('asks a laptop once, and treats it as a wall until it answers', () => {
		expect(decideDeviceRole(laptop)).toEqual({ role: 'wall', ask: true });
	});

	it('a wide touch screen is a tablet on a stand: asked, not assumed', () => {
		expect(decideDeviceRole({ ...phone, viewportWidth: 1024 })).toEqual({
			role: 'wall',
			ask: true,
		});
	});

	it('keeps the answer the device gave before', () => {
		expect(decideDeviceRole({ ...laptop, stored: 'private' })).toEqual({
			role: 'private',
			ask: false,
		});
		expect(decideDeviceRole({ ...phone, stored: 'wall' })).toEqual({ role: 'wall', ask: false });
	});

	it('has nothing to hide when the lesson collects no names', () => {
		expect(decideDeviceRole({ ...laptop, namesCollected: false })).toEqual({
			role: 'private',
			ask: false,
		});
	});
});

describe('nextNeedsArming', () => {
	it('arms NEXT only on a wall', () => {
		expect(nextNeedsArming('wall')).toBe(true);
		expect(nextNeedsArming('private')).toBe(false);
	});
});
