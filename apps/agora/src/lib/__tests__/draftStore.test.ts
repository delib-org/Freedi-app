import { describe, it, expect } from 'vitest';
import { draftKey, sessionDraft, type StringStore } from '../draftStore';

function memoryStore(): StringStore & { map: Map<string, string> } {
	const map = new Map<string, string>();

	return {
		map,
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key),
	};
}

/** Private browsing, a full quota, a locked-down school device. */
const hostileStore: StringStore = {
	getItem() {
		throw new Error('blocked');
	},
	setItem() {
		throw new Error('quota');
	},
	removeItem() {
		throw new Error('blocked');
	},
};

describe('sessionDraft', () => {
	it('starts empty rather than undefined', () => {
		expect(sessionDraft('s1', 'first', memoryStore()).read()).toBe('');
	});

	it('keeps a sentence across a read', () => {
		const draft = sessionDraft('s1', 'first', memoryStore());
		draft.write('the tax should fall on the estates');
		expect(draft.read()).toBe('the tax should fall on the estates');
	});

	it('forgets on request', () => {
		const draft = sessionDraft('s1', 'first', memoryStore());
		draft.write('something');
		draft.forget();
		expect(draft.read()).toBe('');
	});

	it('keeps two boxes in the same session apart', () => {
		const store = memoryStore();
		const first = sessionDraft('s1', 'first', store);
		const mine = sessionDraft('s1', 'mine', store);
		first.write('opening sentence');
		mine.write('an edit in progress');
		expect(first.read()).toBe('opening sentence');
		expect(mine.read()).toBe('an edit in progress');
	});

	it('keeps the same box in two sessions apart', () => {
		// A draft must never reappear in a different lesson
		const store = memoryStore();
		sessionDraft('s1', 'first', store).write('yesterday');
		expect(sessionDraft('s2', 'first', store).read()).toBe('');
	});

	it('survives a storage that throws on every operation', () => {
		// None of these should cost a student their sentence
		const draft = sessionDraft('s1', 'first', hostileStore);
		expect(() => draft.write('still typing')).not.toThrow();
		expect(draft.read()).toBe('');
		expect(() => draft.forget()).not.toThrow();
	});

	it('survives storage being absent entirely', () => {
		const draft = sessionDraft('s1', 'first', null);
		expect(() => draft.write('x')).not.toThrow();
		expect(draft.read()).toBe('');
		expect(() => draft.forget()).not.toThrow();
	});

	it('an empty write is kept, not treated as forgetting', () => {
		// Clearing the box is a real state: it must not resurrect the old text
		const store = memoryStore();
		const draft = sessionDraft('s1', 'first', store);
		draft.write('typed then deleted');
		draft.write('');
		expect(draft.read()).toBe('');
		expect(store.map.has(draft.key)).toBe(true);
	});
});

describe('draftKey', () => {
	it('namespaces by session and box', () => {
		expect(draftKey('abc', 'first')).toBe('agora_abc_first_draft');
		expect(draftKey('abc', 'mine')).toBe('agora_abc_mine_draft');
	});
});
