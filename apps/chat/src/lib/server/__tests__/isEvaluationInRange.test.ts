import { describe, expect, it, vi } from 'vitest';

vi.mock('@sveltejs/kit', () => ({ error: vi.fn() }));
vi.mock('../firebaseAdmin', () => ({ adminDb: {} }));
vi.mock('../conversation', () => ({ getStatement: vi.fn() }));
vi.mock('$lib/chat/node', () => ({
	toNodeKind: vi.fn(),
	resolveKind: vi.fn(),
	composerChoicesFor: vi.fn(),
}));
vi.mock('@freedi/evidence', () => ({ assertAllowedEdge: vi.fn() }));

import { isEvaluationInRange } from '../writeActions';

describe('isEvaluationInRange', () => {
	it('accepts the whole scale, including the slider’s fractions', () => {
		for (const value of [-1, -0.5, 0, 0.37, 0.5, 1]) {
			expect(isEvaluationInRange(value)).toBe(true);
		}
	});

	it('rejects anything a forged form could post', () => {
		for (const value of [1.01, -1.01, 1000, -1000, NaN, Infinity, -Infinity]) {
			expect(isEvaluationInRange(value)).toBe(false);
		}
	});
});
