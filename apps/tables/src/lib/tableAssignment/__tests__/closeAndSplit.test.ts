import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ app: {}, auth: {}, db: {}, functions: {} }));
vi.mock('@/lib/navigate', () => ({ goTo: vi.fn() }));
vi.mock('@/lib/tableAssignment/client', () => ({ tablesApi: {} }));

import { computeActionFor } from '../closeAndSplit';

describe('computeActionFor', () => {
	it('is one action per assignment, so an error or a busy state stays with its own', () => {
		expect(computeActionFor('s1')).toBe(computeActionFor('s1'));
		expect(computeActionFor('s1')).not.toBe(computeActionFor('s2'));
	});
});
