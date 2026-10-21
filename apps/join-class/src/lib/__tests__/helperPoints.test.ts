import { describe, it, expect, vi } from 'vitest';

// Mock everything helperPoints imports at module load — the pure helper under
// test never touches them.
vi.mock('../firebase', () => ({
	db: {},
	doc: vi.fn(),
	getDoc: vi.fn(),
}));
vi.mock('../resilientListeners', () => ({
	resilientOnSnapshot: vi.fn(() => () => undefined),
}));
vi.mock('../user', () => ({
	getUserState: vi.fn(() => ({ user: { uid: 'u1' } })),
}));
vi.mock('../facilitatorToast', () => ({
	showFacilitatorToast: vi.fn(),
}));
vi.mock('../i18n', () => ({
	t: vi.fn((key: string) => key),
}));

import { shouldToastOnPoints } from '../helperPoints';

describe('shouldToastOnPoints', () => {
	it('never toasts on the initial snapshot (not yet initialized)', () => {
		expect(shouldToastOnPoints(0, 5, false)).toBe(false);
	});

	it('toasts when the total grows after initialization', () => {
		expect(shouldToastOnPoints(4, 5, true)).toBe(true);
	});

	it('stays silent when the total is unchanged or drops (revoked mark)', () => {
		expect(shouldToastOnPoints(5, 5, true)).toBe(false);
		expect(shouldToastOnPoints(5, 4, true)).toBe(false);
	});
});
