import type { CallableRequest } from 'firebase-functions/v2/https';
import type { AgoraTopicPackage } from '@freedi/shared-types';

const mockSet = jest.fn().mockResolvedValue(undefined);
jest.mock('../../db', () => ({ db: { collection: () => ({ doc: () => ({ set: mockSet }) }) } }));
jest.mock('../../config/openai-chat', () => ({
	callLLM: jest.fn(),
	extractJson: (value: string) => value,
	TAXONOMY_MODEL: 'test-model',
}));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));

import { agoraGenerateTopicPackage } from '../fn_agoraGenerateTopicPackage';
import { callLLM } from '../../config/openai-chat';
import { FIXTURE_TOPIC_PACKAGE } from '../fixtureTopicPackage';

const brief = {
	statement: 'כיצד נוכל לפתור את הסכסוך הישראלי־פלסטיני?',
	description: 'לפתח פתרונות לצרכים של שני העמים ולבחון הסכמה רחבה, בלי לקבוע פתרון מראש.',
	language: 'he',
};
type GenerationRequest = Parameters<typeof agoraGenerateTopicPackage.run>[0];
const request = (data: unknown): GenerationRequest =>
	({
		data,
		auth: { uid: 'teacher', token: { firebase: { sign_in_provider: 'google.com' } } },
	}) as CallableRequest<GenerationRequest['data']>;

describe('question-led scenario generation', () => {
	const originalKey = process.env.OPENAI_API_KEY;
	beforeEach(() => {
		process.env.OPENAI_API_KEY = 'test-key';
		jest.mocked(callLLM).mockResolvedValue(
			JSON.stringify({
				...FIXTURE_TOPIC_PACKAGE,
				title: 'Oslo 1993',
				challengeQuestion: 'Should we sign Oslo?',
			}),
		);
	});
	afterAll(() => {
		if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
		else process.env.OPENAI_API_KEY = originalKey;
	});

	it('sends both fields to AI and preserves the question even if AI substitutes Oslo', async () => {
		await agoraGenerateTopicPackage.run(request(brief));
		const input = jest.mocked(callLLM).mock.calls[0][0];
		expect(JSON.parse(input.user)).toEqual({
			statement: brief.statement,
			description: brief.description,
		});
		expect(input.system).toContain('WITHOUT the vision stage');
		expect(input.system).toContain('not become a lesson about the Oslo Accords');
		const saved = mockSet.mock.calls[0][0] as AgoraTopicPackage;
		expect(saved.title).toBe(brief.statement);
		expect(saved.challengeQuestion).toBe(brief.statement);
		expect(saved.authoringBrief).toEqual({
			statement: brief.statement,
			description: brief.description,
		});
		expect(saved.status).toBe('draft');
	});

	it.each([
		{ ...brief, statement: ' ' },
		{ ...brief, statement: 'x'.repeat(201) },
		{ ...brief, description: ' ' },
		{ ...brief, description: 42 },
		{ ...brief, description: 'x'.repeat(2001) },
	])('rejects invalid input before calling AI or writing', async (data) => {
		await expect(agoraGenerateTopicPackage.run(request(data))).rejects.toMatchObject({
			code: 'invalid-argument',
		});
		expect(callLLM).not.toHaveBeenCalled();
		expect(mockSet).not.toHaveBeenCalled();
	});

	it('supports older topic-only clients during rollout', async () => {
		await agoraGenerateTopicPackage.run(request({ topic: brief.statement, language: 'he' }));
		expect((mockSet.mock.calls[0][0] as AgoraTopicPackage).title).toBe(brief.statement);
	});

	it('never passes off a French Revolution fixture as the requested scenario', async () => {
		delete process.env.OPENAI_API_KEY;
		await expect(agoraGenerateTopicPackage.run(request(brief))).rejects.toMatchObject({
			code: 'failed-precondition',
		});
		expect(mockSet).not.toHaveBeenCalled();
	});

	it('rejects malformed AI output without saving a broken draft', async () => {
		jest.mocked(callLLM).mockResolvedValue('{"characters": []}');
		await expect(agoraGenerateTopicPackage.run(request(brief))).rejects.toMatchObject({
			code: 'internal',
		});
		expect(mockSet).not.toHaveBeenCalled();
	});
});
