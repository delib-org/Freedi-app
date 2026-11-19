import { describe, expect, it } from 'vitest';
import { dragHintKey, isDragHintSeen, markDragHintSeen } from '../dragHint';
import type { HintStorage } from '../dragHint';

function fakeStorage(): HintStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();

	return {
		data,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => {
			data.set(key, value);
		},
	};
}

const BLOCKED: HintStorage = {
	getItem: () => {
		throw new Error('blocked');
	},
	setItem: () => {
		throw new Error('blocked');
	},
};

describe('drag hint, once per teacher', () => {
	it('shows until it is marked, then never again', () => {
		const storage = fakeStorage();
		expect(isDragHintSeen('teacher1', storage)).toBe(false);
		expect(markDragHintSeen('teacher1', storage)).toBe(true);
		expect(isDragHintSeen('teacher1', storage)).toBe(true);
	});

	it('is kept per teacher, not per browser', () => {
		const storage = fakeStorage();
		markDragHintSeen('teacher1', storage);
		expect(isDragHintSeen('teacher2', storage)).toBe(false);
		expect(storage.data.has(dragHintKey('teacher1'))).toBe(true);
	});

	it('with blocked storage it shows and never throws', () => {
		expect(isDragHintSeen('teacher1', BLOCKED)).toBe(false);
		expect(markDragHintSeen('teacher1', BLOCKED)).toBe(false);
	});

	it('with no storage or no teacher yet it shows', () => {
		expect(isDragHintSeen('teacher1', null)).toBe(false);
		expect(markDragHintSeen('teacher1', null)).toBe(false);
		expect(isDragHintSeen(null, fakeStorage())).toBe(false);
		expect(markDragHintSeen(null, fakeStorage())).toBe(false);
	});
});
