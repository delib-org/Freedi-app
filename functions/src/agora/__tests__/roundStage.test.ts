import { describe, it, expect, jest } from '@jest/globals';
import { AgoraStage, AgoraCarriedAnswer } from '@freedi/shared-types';

// The module imports ../db (getFirestore on an uninitialised app) and the
// question-stage batch writer; the fixture and the summariser are pure when
// no model is configured.
jest.mock('../../db', () => ({ db: {} }));
jest.mock('../../config/openai-chat', () => ({
	callLLM: jest.fn(),
	extractJson: (raw: string) => raw,
	WORKER_MODEL: 'test-model',
}));

import { roundFixture, summariseRound } from '../roundStage';
import { buildQuestionStatement } from '../questionStage';

const row = (statementId: string, statement: string, mean = 0, raters = 0): AgoraCarriedAnswer => ({
	statementId,
	statement,
	mean,
	raters,
});

const creator = { uid: 't', displayName: 'T', email: null, photoURL: null, isAnonymous: false };

describe('roundFixture — the record without a model', () => {
	it('lists needs as bullet lines, one per line', () => {
		expect(roundFixture('needs', [row('a', 'safe streets'), row('b', 'quiet nights')])).toBe(
			'• safe streets\n• quiet nights',
		);
	});

	it('joins stories and visions on one line', () => {
		expect(roundFixture('story', [row('a', 'once'), row('b', 'twice')])).toBe('once · twice');
		expect(roundFixture('vision', [row('a', 'we thrive')])).toBe('we thrive');
	});

	it('is empty for an empty round', () => {
		expect(roundFixture('story', [])).toBe('');
	});
});

describe('summariseRound', () => {
	it('returns the fixture when no model is configured', async () => {
		const key = process.env.OPENAI_API_KEY;
		delete process.env.OPENAI_API_KEY;
		try {
			const summary = await summariseRound(
				'needs',
				'my needs',
				'How do we wake up?',
				[row('a', 'sleep', 0.75, 2)],
				'en',
			);
			expect(summary).toBe('• sleep');
		} finally {
			if (key !== undefined) process.env.OPENAI_API_KEY = key;
		}
	});
});

describe('buildQuestionStatement for a round', () => {
	it('falls back to the kind as the text and keeps the explanation', () => {
		const built = buildQuestionStatement({
			item: {
				itemId: 'round-story',
				stage: AgoraStage.question,
				kind: 'story',
				explanation: 'a story, not a position',
			},
			sessionId: 's1',
			rootStatementId: 'root',
			creatorId: 't',
			creator,
		});

		expect(built?.statement).toBe('story');
		expect(built?.description).toBe('a story, not a position');
		expect(built?.parentId).toBe('root');
		expect(built?.agoraSessionId).toBe('s1');
	});

	it('uses the teacher’s title when there is one', () => {
		const built = buildQuestionStatement({
			item: {
				itemId: 'round-vision',
				stage: AgoraStage.question,
				kind: 'vision',
				title: 'Our street in 2030',
			},
			sessionId: 's1',
			rootStatementId: 'root',
			creatorId: 't',
			creator,
		});

		expect(built?.statement).toBe('Our street in 2030');
	});
});
