jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const callLLM = jest.fn();
jest.mock('../../../config/openai-chat', () => ({
	...jest.requireActual('../../../config/openai-chat'),
	callLLM: (...args: unknown[]) => callLLM(...args),
}));

import { TAXONOMY_MODEL } from '../../../config/openai-chat';
import { MAX_THEMES } from '../constants';
import { discoverThemes, parseDiscovery, sampleForDiscovery, themeBounds } from '../discoverThemes';
import { discoveryUserPrompt, minProposalsPerTheme, themeLanguageInstruction } from '../prompts';
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
	it('asks for 5-15 themes on a normal question', () => {
		expect(themeBounds(100)).toEqual({ min: 5, max: MAX_THEMES });
	});

	it('relaxes the minimum for a tiny question', () => {
		expect(themeBounds(4).min).toBe(2);
		expect(themeBounds(1).min).toBe(1);
	});
});

describe('parseDiscovery', () => {
	it('assigns local keys and drops duplicate names', () => {
		const themes = parseDiscovery(answer(['Funding', 'funding', 'Schools']), { min: 1, max: 15 });
		expect(themes).toEqual([
			{ key: 't1', name: 'Funding', rule: 'about Funding' },
			{ key: 't2', name: 'Schools', rule: 'about Schools' },
		]);
	});

	it('rejects a theme without a rule', () => {
		expect(() =>
			parseDiscovery(JSON.stringify({ themes: [{ name: 'x' }] }), { min: 1, max: 15 }),
		).toThrow();
	});

	it('truncates to the maximum', () => {
		const names = Array.from({ length: 20 }, (_, i) => `n${i}`);
		expect(parseDiscovery(answer(names), { min: 1, max: 15 })).toHaveLength(15);
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

describe('discoveryUserPrompt minimum theme size', () => {
	it('asks for at least 3 proposals per theme on a normal question', () => {
		const prompt = discoveryUserPrompt(
			'Q?',
			Array.from({ length: 50 }, (_, i) => `p${i}`),
			{
				min: 5,
				max: 15,
			},
		);
		expect(prompt).toContain('at least 3 of the proposals');
	});

	it('relaxes the minimum on a question too small to fill it', () => {
		expect(minProposalsPerTheme(8, 4)).toBe(2);
		expect(minProposalsPerTheme(3, 1)).toBe(3);
		expect(minProposalsPerTheme(1, 1)).toBe(2);
	});
});
