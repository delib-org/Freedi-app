import { describe, it, expect, vi } from 'vitest';
import type { CommentVerdict } from '../commentVerdicts';

// Mock firebase + user + listeners BEFORE importing the SUT — commentVerdicts
// imports them at module load. The pure helpers under test never touch them.
vi.mock('../firebase', () => ({
	db: {},
	collection: vi.fn(),
	doc: vi.fn(),
	setDoc: vi.fn(),
	deleteDoc: vi.fn(),
	query: vi.fn(),
	where: vi.fn(),
}));
vi.mock('../resilientListeners', () => ({
	resilientOnSnapshot: vi.fn(() => () => undefined),
}));
vi.mock('../user', () => ({
	getUserState: vi.fn(() => ({ user: { uid: 'author-1' } })),
}));

import { resolveVerdict, countHelpful } from '../commentVerdicts';

describe('resolveVerdict', () => {
	it('returns the confirmed verdict when nothing is in flight', () => {
		const confirmed = new Map<string, CommentVerdict>([['c1', 'helpful']]);
		expect(resolveVerdict(new Map(), confirmed, 'c1')).toBe('helpful');
	});

	it('prefers an in-flight optimistic verdict over the confirmed one', () => {
		const confirmed = new Map<string, CommentVerdict>([['c1', 'helpful']]);
		const optimistic = new Map<string, CommentVerdict | null>([['c1', 'ignored']]);
		expect(resolveVerdict(optimistic, confirmed, 'c1')).toBe('ignored');
	});

	it('treats an optimistic clear (null) as unmarked even when confirmed exists', () => {
		const confirmed = new Map<string, CommentVerdict>([['c1', 'helpful']]);
		const optimistic = new Map<string, CommentVerdict | null>([['c1', null]]);
		expect(resolveVerdict(optimistic, confirmed, 'c1')).toBeUndefined();
	});

	it('returns undefined for comments never marked', () => {
		expect(resolveVerdict(new Map(), new Map(), 'unknown')).toBeUndefined();
	});
});

describe('countHelpful', () => {
	it('counts only comments resolving to helpful', () => {
		const verdicts: Record<string, CommentVerdict | undefined> = {
			c1: 'helpful',
			c2: 'ignored',
			c3: undefined,
			c4: 'helpful',
		};
		expect(countHelpful(['c1', 'c2', 'c3', 'c4'], (id) => verdicts[id])).toBe(2);
	});

	it('returns 0 for an empty id list', () => {
		expect(countHelpful([], () => 'helpful')).toBe(0);
	});
});
