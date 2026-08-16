import { describe, it, expect, vi } from 'vitest';
import { createSubPage, type HistoryLike } from '../subPage';

/**
 * The failure this guards is not cosmetic: get the ordering wrong and a student
 * pressing back to leave a conversation leaves the GAME instead, mid-lesson.
 */
function harness() {
	const entries: unknown[] = [];
	let popHandler: (() => void) | null = null;
	const changes: Array<string | null> = [];

	const history: HistoryLike = {
		get state() {
			return entries.length ? entries[entries.length - 1] : null;
		},
		pushState(state) {
			entries.push(state);
		},
		back() {
			entries.pop();
			popHandler?.();
		},
	};

	const page = createSubPage<string>({
		history,
		onPopState(handler) {
			popHandler = handler;

			return () => {
				popHandler = null;
			};
		},
		onChange: (open) => changes.push(open),
	});

	return {
		page,
		changes,
		entryCount: () => entries.length,
		/** The phone's back gesture: pop the entry, then notify. */
		pressBack: () => {
			entries.pop();
			popHandler?.();
		},
		hasHandler: () => popHandler !== null,
	};
}

describe('createSubPage', () => {
	it('starts closed', () => {
		expect(harness().page.current()).toBeNull();
	});

	it('opening pushes exactly one history entry', () => {
		const h = harness();
		h.page.open('thread-1');
		expect(h.page.current()).toBe('thread-1');
		expect(h.entryCount()).toBe(1);
		expect(h.changes).toEqual(['thread-1']);
	});

	it('the back gesture closes the sub-page, not the game', () => {
		const h = harness();
		h.page.open('thread-1');
		h.pressBack();
		expect(h.page.current()).toBeNull();
		expect(h.entryCount()).toBe(0);
	});

	it('closing from a button unwinds the entry it pushed', () => {
		const h = harness();
		h.page.open('thread-1');
		h.page.close();
		expect(h.page.current()).toBeNull();
		expect(h.entryCount()).toBe(0);
	});

	it('closing by back does not unwind a second time', () => {
		// The bug this prevents: back pops the entry, then the handler calls
		// back() again and walks the student out of the game.
		const h = harness();
		h.page.open('thread-1');
		h.pressBack();
		expect(h.entryCount()).toBe(0);
		h.page.close(); // a stray close afterwards must be inert
		expect(h.entryCount()).toBe(0);
	});

	it('closing when nothing is open does nothing at all', () => {
		const h = harness();
		h.page.close();
		expect(h.entryCount()).toBe(0);
		expect(h.changes).toEqual([]);
	});

	it('never unwinds an entry it did not push', () => {
		const h = harness();
		// Something else owns the current history entry
		h.page.open('thread-1');
		h.pressBack();
		const before = h.entryCount();
		h.page.close();
		expect(h.entryCount()).toBe(before);
	});

	it('opens a second conversation without stacking a second entry per switch', () => {
		const h = harness();
		h.page.open('thread-1');
		h.page.close();
		h.page.open('thread-2');
		expect(h.page.current()).toBe('thread-2');
		expect(h.entryCount()).toBe(1);
	});

	it('still opens when history is unavailable', () => {
		// Rare sandboxes throw on pushState. Degrading the back gesture beats
		// refusing to open the conversation.
		const changes: Array<string | null> = [];
		const page = createSubPage<string>({
			history: {
				get state() {
					return null;
				},
				pushState() {
					throw new Error('denied');
				},
				back() {
					throw new Error('denied');
				},
			},
			onPopState: () => () => {},
			onChange: (open) => changes.push(open),
		});
		page.open('thread-1');
		expect(page.current()).toBe('thread-1');
		expect(changes).toEqual(['thread-1']);
		page.close();
		expect(page.current()).toBeNull();
	});

	it('dispose stops listening', () => {
		const h = harness();
		expect(h.hasHandler()).toBe(true);
		h.page.dispose();
		expect(h.hasHandler()).toBe(false);
	});

	it('redraws on every transition, and only on transitions', () => {
		const h = harness();
		const onChange = vi.fn();
		h.page.open('a');
		h.page.close();
		expect(h.changes).toEqual(['a', null]);
		expect(onChange).not.toHaveBeenCalled();
	});
});
