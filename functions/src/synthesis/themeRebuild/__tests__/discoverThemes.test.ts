jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const callLLM = jest.fn();
jest.mock('../../../config/openai-chat', () => ({
	...jest.requireActual('../../../config/openai-chat'),
	callLLM: (...args: unknown[]) => callLLM(...args),
}));

import { TAXONOMY_MODEL } from '../../../config/openai-chat';
import { MAX_THEMES, MIN_THEMES, maxThemesFor } from '../constants';
import {
	discoverThemes,
	overCeilingReminder,
	parseDiscovery,
	sampleForDiscovery,
	themeBounds,
} from '../discoverThemes';
import { themeLanguageInstruction } from '../prompts';
import type { RebuildAtom } from '../types';

const atom = (i: number, isSynth = false): RebuildAtom => ({
	id: `a${i}`,
	title: `idea ${i}`,
	text: `idea ${i}`,
	isSynth,
});
const atoms = (n: number): RebuildAtom[] => Array.from({ length: n }, (_, i) => atom(i));
const answer = (names: string[]): string =>
	JSON.stringify({ themes: names.map((name) => ({ name, rule: `about ${name}` })) });

beforeEach(() => jest.clearAllMocks());

describe('themeBounds', () => {
	it('scales the ceiling with question size: round(atoms / 4) within 5..15', () => {
		expect(themeBounds(100)).toEqual({ min: 5, max: MAX_THEMES });
		expect(themeBounds(50)).toEqual({ min: 5, max: 13 });
		expect(themeBounds(40)).toEqual({ min: 5, max: 10 });
		expect(themeBounds(12)).toEqual({ min: 5, max: MIN_THEMES });
	});

	it('never lets the ceiling fall below the floor', () => {
		for (let n = 1; n <= 200; n++) {
			const { min, max } = themeBounds(n);
			expect(max).toBeGreaterThanOrEqual(min);
		}
	});

	it('relaxes the minimum for a tiny question', () => {
		expect(themeBounds(4).min).toBe(2);
		expect(themeBounds(1).min).toBe(1);
	});
});

describe('maxThemesFor', () => {
	it('clamps to MIN_THEMES and MAX_THEMES', () => {
		expect(maxThemesFor(0)).toBe(MIN_THEMES);
		expect(maxThemesFor(10_000)).toBe(MAX_THEMES);
		expect(maxThemesFor(30)).toBe(8);
	});
});

describe('parseDiscovery', () => {
	it('assigns local keys and drops duplicate names', () => {
		const themes = parseDiscovery(answer(['Funding', 'funding', 'Schools']));
		expect(themes).toEqual([
			{ key: 't1', name: 'Funding', rule: 'about Funding' },
			{ key: 't2', name: 'Schools', rule: 'about Schools' },
		]);
	});

	it('rejects a theme without a rule', () => {
		expect(() => parseDiscovery(JSON.stringify({ themes: [{ name: 'x' }] }))).toThrow();
	});

	it('does not cut to the ceiling (the caller retries instead)', () => {
		const names = Array.from({ length: 20 }, (_, i) => `n${i}`);
		expect(parseDiscovery(answer(names))).toHaveLength(20);
	});
});

describe('sampleForDiscovery', () => {
	it('sends everything up to the whole-input cap', () => {
		expect(sampleForDiscovery(atoms(10), 20)).toHaveLength(10);
	});

	it('samples above the cap, keeping syntheses and spreading over options', () => {
		const input = [atom(1000, true), ...atoms(100)];
		const sample = sampleForDiscovery(input, 11);
		expect(sample).toHaveLength(11);
		expect(sample[0].id).toBe('a1000');
		expect(sample.map((a) => a.id)).toContain('a90');
	});
});

describe('discoverThemes', () => {
	it('makes one call on the taxonomy model in JSON mode', async () => {
		callLLM.mockResolvedValue(answer(['A', 'B', 'C', 'D', 'E']));

		const themes = await discoverThemes('How?', atoms(30));

		expect(themes).toHaveLength(5);
		expect(callLLM).toHaveBeenCalledTimes(1);
		expect(callLLM.mock.calls[0][0]).toEqual(
			expect.objectContaining({ model: TAXONOMY_MODEL, jsonMode: true }),
		);
	});

	it('retries an unparseable answer once', async () => {
		callLLM
			.mockResolvedValueOnce('not json')
			.mockResolvedValueOnce(answer(['A', 'B', 'C', 'D', 'E']));

		await expect(discoverThemes('How?', atoms(30))).resolves.toHaveLength(5);
		expect(callLLM).toHaveBeenCalledTimes(2);
	});

	it('accepts fewer themes than asked after the retry, rather than nothing', async () => {
		callLLM.mockResolvedValue(answer(['A', 'B']));

		await expect(discoverThemes('How?', atoms(30))).resolves.toHaveLength(2);
		expect(callLLM).toHaveBeenCalledTimes(2);
	});

	it('retries an over-ceiling answer once with a reminder of the ceiling', async () => {
		const max = themeBounds(30).max;
		const tooMany = Array.from({ length: max + 3 }, (_, i) => `n${i}`);
		callLLM
			.mockResolvedValueOnce(answer(tooMany))
			.mockResolvedValueOnce(answer(['A', 'B', 'C', 'D', 'E']));

		await expect(discoverThemes('How?', atoms(30))).resolves.toHaveLength(5);
		expect(callLLM).toHaveBeenCalledTimes(2);
		expect(callLLM.mock.calls[1][0].user).toContain(overCeilingReminder(max + 3, max));
		expect(callLLM.mock.calls[0][0].user).not.toContain('REMINDER');
	});

	it('keeps the first max themes when the retry is still over the ceiling', async () => {
		const max = themeBounds(30).max;
		const tooMany = Array.from({ length: max + 3 }, (_, i) => `n${i}`);
		callLLM.mockResolvedValue(answer(tooMany));

		const themes = await discoverThemes('How?', atoms(30));

		expect(themes).toHaveLength(max);
		expect(themes[0].name).toBe('n0');
		expect(callLLM).toHaveBeenCalledTimes(2);
	});

	it('throws when both attempts fail', async () => {
		callLLM.mockResolvedValue('garbage');

		await expect(discoverThemes('How?', atoms(30))).rejects.toThrow('Theme discovery failed');
	});

	it('asks for Hebrew names on a Hebrew question', async () => {
		callLLM.mockResolvedValue(answer(['A', 'B', 'C', 'D', 'E']));

		await discoverThemes('איך משפרים את העיר?', atoms(30));

		expect(callLLM.mock.calls[0][0].user).toContain('in Hebrew');
	});
});

describe('themeLanguageInstruction', () => {
	it('detects Arabic and falls back to the question language', () => {
		expect(themeLanguageInstruction('كيف؟')).toContain('Arabic');
		expect(themeLanguageInstruction('How?')).toContain('same language as the QUESTION');
	});
});
