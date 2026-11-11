// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	A11Y_STORAGE_KEY,
	DEFAULT_A11Y_PREFS,
	applyA11yPrefs,
	getA11yPrefs,
	isDarkTheme,
	parseA11yPrefs,
	resolveTheme,
	setA11yPrefs,
	startA11yPrefs,
	stepScale,
} from '../a11yPrefs';

interface FakeQuery {
	matches: boolean;
	listeners: Array<() => void>;
	addEventListener: (type: string, listener: () => void) => void;
}

function fakeSystemTheme(isDark: boolean): FakeQuery {
	const query: FakeQuery = {
		matches: isDark,
		listeners: [],
		addEventListener: (_type, listener) => query.listeners.push(listener),
	};

	vi.stubGlobal('matchMedia', () => query);

	return query;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	window.localStorage.clear();
	setA11yPrefs({ ...DEFAULT_A11Y_PREFS });
});

describe('parseA11yPrefs', () => {
	it('returns the defaults for nothing or garbage', () => {
		expect(parseA11yPrefs(null)).toEqual(DEFAULT_A11Y_PREFS);
		expect(parseA11yPrefs('{oops')).toEqual(DEFAULT_A11Y_PREFS);
		expect(parseA11yPrefs('7')).toEqual(DEFAULT_A11Y_PREFS);
	});

	it('keeps valid fields and replaces invalid ones', () => {
		expect(parseA11yPrefs('{"theme":"dark","contrast":true,"scale":125}')).toEqual({
			theme: 'dark',
			contrast: true,
			scale: 125,
		});
		expect(parseA11yPrefs('{"theme":"pink","contrast":"yes","scale":90}')).toEqual(
			DEFAULT_A11Y_PREFS,
		);
	});
});

describe('stepScale', () => {
	it('walks the ladder and stops at both ends', () => {
		expect(stepScale(100, 1)).toBe(112.5);
		expect(stepScale(100, -1)).toBe(87.5);
		expect(stepScale(87.5, -1)).toBe(87.5);
		expect(stepScale(150, 1)).toBe(150);
	});
});

describe('resolveTheme', () => {
	it('follows the device only in system mode', () => {
		expect(resolveTheme('system', true)).toBe('dark');
		expect(resolveTheme('system', false)).toBe('light');
		expect(resolveTheme('light', true)).toBe('light');
		expect(resolveTheme('dark', false)).toBe('dark');
	});
});

describe('applyA11yPrefs', () => {
	it('writes the resolved theme, the contrast and the root font size', () => {
		const root = document.createElement('html');

		applyA11yPrefs(root, { theme: 'system', contrast: true, scale: 150 }, true);

		expect(root.dataset.theme).toBe('dark');
		expect(root.dataset.contrast).toBe('high');
		expect(root.style.fontSize).toBe('150%');
	});

	it('leaves the browser default at 100%', () => {
		const root = document.createElement('html');

		root.style.fontSize = '150%';
		applyA11yPrefs(root, DEFAULT_A11Y_PREFS, false);

		expect(root.style.fontSize).toBe('');
	});
});

describe('the live settings', () => {
	it('persists a change under one key', () => {
		setA11yPrefs({ theme: 'dark', contrast: false, scale: 112.5 });

		expect(parseA11yPrefs(window.localStorage.getItem(A11Y_STORAGE_KEY))).toEqual({
			theme: 'dark',
			contrast: false,
			scale: 112.5,
		});
		expect(document.documentElement.dataset.theme).toBe('dark');
	});

	it('follows the device theme live and tells the screen to redraw', () => {
		const query = fakeSystemTheme(false);
		const onChange = vi.fn();

		startA11yPrefs(onChange);
		expect(isDarkTheme()).toBe(false);

		query.matches = true;
		query.listeners.forEach((listener) => listener());

		expect(document.documentElement.dataset.theme).toBe('dark');
		expect(isDarkTheme()).toBe(true);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('still works for this visit when storage is blocked', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});

		expect(() => setA11yPrefs({ theme: 'light', contrast: true, scale: 87.5 })).not.toThrow();
		expect(getA11yPrefs().contrast).toBe(true);
		expect(document.documentElement.dataset.contrast).toBe('high');
	});
});

describe('the script in index.html', () => {
	it('reads the same storage key as the app, before the first paint', () => {
		const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

		expect(html).toContain(`localStorage.getItem('${A11Y_STORAGE_KEY}')`);
	});
});
