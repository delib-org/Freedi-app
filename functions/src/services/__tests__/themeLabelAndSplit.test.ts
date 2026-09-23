import type { Statement } from '@freedi/shared-types';

/**
 * The three prompt-level fixes for the narrow-question collapse
 * (scientific-research/2026-09-18-theme-layer-narrow-questions/HANDOFF.md):
 *
 *   A. a theme label may not restate the question — generated, checked,
 *      regenerated once, then the fallback;
 *   B. the filing and merge judges are told that answering the question is
 *      never a reason to file or merge;
 *   C. the split judge's output is validated the way the merge judge's is.
 */

const generateContent = jest.fn();
jest.mock('../../config/gemini', () => ({
	LLM_MODEL_FAST: 'fast',
	LLM_MODEL_HEAVY: 'heavy',
	getGenAI: () => ({
		getGenerativeModel: () => ({ generateContent }),
	}),
}));
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('firebase-admin/firestore', () => ({ getFirestore: jest.fn() }));

import {
	assignToTheme,
	generateTopicLabel,
	groupEquivalentThemes,
	labelRestatesQuestion,
	proposeThemeSplit,
} from '../integration-ai-service';

const Q = 'How can we harness the power of research to change reality?';
const synth = { statementId: 's1', statement: 'Fund applied research projects' } as Statement;

const reply = (json: unknown) => ({ response: { text: () => JSON.stringify(json) } });

beforeEach(() => {
	jest.clearAllMocks();
});

describe('A — a theme label may not restate the question', () => {
	it('tells the labeller to name a sub-area and never restate the question', async () => {
		generateContent
			.mockResolvedValueOnce(reply({ title: 'Research funding', description: 'd' }))
			.mockResolvedValueOnce(reply({ restatesQuestion: false }));

		await generateTopicLabel([synth], Q);

		const prompt: string = generateContent.mock.calls[0][0];
		expect(prompt).toContain('NEVER restate, paraphrase, or generalise the question');
		expect(prompt).toContain('SPECIFIC sub-area');
	});

	it('accepts a label the guard passes, with exactly two calls', async () => {
		generateContent
			.mockResolvedValueOnce(reply({ title: 'Research funding', description: 'd' }))
			.mockResolvedValueOnce(reply({ restatesQuestion: false }));

		const label = await generateTopicLabel([synth], Q);

		expect(label).toEqual({ title: 'Research funding', description: 'd' });
		expect(generateContent).toHaveBeenCalledTimes(2);
	});

	it('regenerates once, more strictly, when the label restates the question', async () => {
		generateContent
			.mockResolvedValueOnce(reply({ title: 'Harnessing research for change', description: 'd' }))
			.mockResolvedValueOnce(reply({ restatesQuestion: true, reason: 'paraphrases it' }))
			.mockResolvedValueOnce(reply({ title: 'Research funding', description: 'd2' }))
			.mockResolvedValueOnce(reply({ restatesQuestion: false }));

		const label = await generateTopicLabel([synth], Q);

		expect(label.title).toBe('Research funding');
		const strictPrompt: string = generateContent.mock.calls[2][0];
		expect(strictPrompt).toContain('"Harnessing research for change" was REJECTED');
	});

	it('falls back to the synthesis title when the second label restates it too', async () => {
		generateContent
			.mockResolvedValueOnce(reply({ title: 'Harnessing research for change', description: 'd' }))
			.mockResolvedValueOnce(reply({ restatesQuestion: true }))
			.mockResolvedValueOnce(reply({ title: 'Research to change reality', description: 'd' }))
			.mockResolvedValueOnce(reply({ restatesQuestion: true }));

		const label = await generateTopicLabel([synth], Q);

		expect(label.title).toBe('Topic: Fund applied research projects');
	});

	it('the guard fails open: an error accepts the label', async () => {
		generateContent.mockRejectedValueOnce(new Error('boom'));

		expect(await labelRestatesQuestion('Anything', Q)).toBe(false);
	});

	it('the guard is skipped when the context is not a question', async () => {
		expect(await labelRestatesQuestion('Anything', 'Bq-VQPMPiG7b')).toBe(false);
		expect(generateContent).not.toHaveBeenCalled();
	});
});

describe('B — the judges are question-relative', () => {
	it('the filing judge is told that answering the question is never a reason to file', async () => {
		generateContent.mockResolvedValueOnce(reply({ topicId: 'NONE', reason: 'r' }));

		await assignToTheme({
			proposalTitle: 'Fund applied research',
			themes: [{ id: 't1', title: 'Harnessing research for change', contents: ['x'] }],
			questionContext: Q,
		});

		const prompt: string = generateContent.mock.calls[0][0];
		expect(prompt).toContain(
			'relating to the question — or\nto its subject — is never a reason to file',
		);
		expect(prompt).toContain('catch-all');
	});

	it('the merge judge is told that sharing the question is never a reason to group', async () => {
		generateContent.mockResolvedValueOnce(reply({ groups: [] }));

		await groupEquivalentThemes({
			themes: [
				{ id: 't1', title: 'Funding' },
				{ id: 't2', title: 'Partnerships' },
				{ id: 't3', title: 'Education' },
			],
			questionContext: Q,
		});

		const prompt: string = generateContent.mock.calls[0][0];
		expect(prompt).toContain("sharing the\nquestion's subject is never a reason to group");
		expect(prompt).toContain('Never\ngive a merged group a heading that restates');
	});
});

describe('C — the split judge', () => {
	const members = [
		{ id: 'a', title: 'Fund applied research' },
		{ id: 'b', title: 'Grants for field studies' },
		{ id: 'c', title: 'Pair researchers with NGOs' },
		{ id: 'd', title: 'Joint academia–industry labs' },
	];
	const input = {
		theme: { id: 'big', title: 'Harnessing research for change' },
		members,
		questionContext: Q,
		otherThemeTitles: ['Education'],
		placedTotal: 12,
	};

	it('shows the judge the members by id, the other headings and the N-of-M framing', async () => {
		generateContent.mockResolvedValueOnce(reply({ subTopics: [] }));

		await proposeThemeSplit(input);

		const prompt: string = generateContent.mock.calls[0][0];
		expect(prompt).toContain('[a] Fund applied research');
		expect(prompt).toContain('holds 4 of the 12 proposals');
		expect(prompt).toContain('- Education');
		expect(prompt).toContain('restates or paraphrases the question');
	});

	it('keeps only offered ids, gives a twice-claimed member to the first sub-topic, and drops empty ones', async () => {
		generateContent.mockResolvedValueOnce(
			reply({
				subTopics: [
					{ title: 'Funding', description: 'd', memberIds: ['a', 'b', 'ghost'] },
					{ title: 'Partnerships', description: 'd', memberIds: ['c', 'd', 'a'] },
					{ title: 'Empty', description: 'd', memberIds: ['ghost'] },
				],
			}),
		);

		const result = await proposeThemeSplit(input);

		expect(result).toEqual([
			{ title: 'Funding', description: 'd', memberIds: ['a', 'b'] },
			{ title: 'Partnerships', description: 'd', memberIds: ['c', 'd'] },
		]);
	});

	it('one surviving sub-topic is no split', async () => {
		generateContent.mockResolvedValueOnce(
			reply({
				subTopics: [{ title: 'Everything', description: 'd', memberIds: ['a', 'b', 'c', 'd'] }],
			}),
		);

		expect(await proposeThemeSplit(input)).toEqual([]);
	});

	it('an error leaves the theme as it is', async () => {
		generateContent.mockRejectedValueOnce(new Error('boom'));

		expect(await proposeThemeSplit(input)).toEqual([]);
	});

	it('does not consult the judge for a theme too small to split in two', async () => {
		expect(await proposeThemeSplit({ ...input, members: members.slice(0, 3) })).toEqual([]);
		expect(generateContent).not.toHaveBeenCalled();
	});
});
