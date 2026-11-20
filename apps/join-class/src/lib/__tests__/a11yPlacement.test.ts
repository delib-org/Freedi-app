import { describe, expect, it } from 'vitest';
import {
	A11Y_TOP_STORAGE_KEY,
	clampTop,
	firstClearTop,
	readSavedTop,
	saveTop,
} from '../a11yPlacement';

describe('firstClearTop', () => {
	it('stays where it is when nothing is under it', () => {
		expect(firstClearTop(200, 48, 0, 600, () => false)).toBe(200);
	});

	it('moves down to the first free spot', () => {
		const busy = (top: number): boolean => top < 300;

		expect(firstClearTop(200, 48, 0, 600, busy)).toBe(344);
	});

	it('goes up when the lower part of the edge is taken', () => {
		const busy = (top: number): boolean => top >= 200;

		expect(firstClearTop(200, 48, 0, 600, busy)).toBe(152);
	});

	it('gives up (null) when the whole edge is taken', () => {
		expect(firstClearTop(200, 48, 0, 600, () => true)).toBeNull();
	});
});

describe('the saved position of the tab', () => {
	const memory = (initial?: string) => {
		const data = new Map<string, string>(initial ? [[A11Y_TOP_STORAGE_KEY, initial]] : []);

		return {
			getItem: (key: string): string | null => data.get(key) ?? null,
			setItem: (key: string, value: string): void => void data.set(key, value),
		};
	};

	it('round-trips a dragged position', () => {
		const storage = memory();
		saveTop(storage, 311.6);

		expect(readSavedTop(storage)).toBe(312);
	});

	it('reads nothing when nothing was saved, the value is junk, or storage is blocked', () => {
		expect(readSavedTop(memory())).toBeNull();
		expect(readSavedTop(memory('abc'))).toBeNull();
		expect(readSavedTop(null)).toBeNull();
		const blocked = {
			getItem: (): string | null => {
				throw new Error('blocked');
			},
			setItem: (): void => {
				throw new Error('blocked');
			},
		};

		expect(readSavedTop(blocked)).toBeNull();
		expect(() => saveTop(blocked, 10)).not.toThrow();
	});

	it('is clamped into a smaller viewport', () => {
		expect(clampTop(900, 600, 8, 100)).toBe(500);
		expect(clampTop(-20, 600, 8, 100)).toBe(8);
		expect(clampTop(200, 600, 8, 100)).toBe(200);
	});
});
