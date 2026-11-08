import { describe, it, expect, jest } from '@jest/globals';
import { AgoraStage, AgoraSession } from '@freedi/shared-types';

// The module imports ../db (getFirestore on an uninitialised app); the
// candidate builder and the parent set are pure.
jest.mock('../../db', () => ({ db: {} }));

import { buildCandidates, dealableParents } from '../dealNotes';

const note = (statementId: string, creatorId: string, hide = false) => ({
	statementId,
	creatorId,
	hide,
});

describe('buildCandidates', () => {
	const pool = [
		note('mine', 'me'),
		note('held', 'u1'),
		note('rated', 'u2'),
		note('hidden', 'u3', true),
		note('moderated', 'u4'),
		note('fresh', 'u5'),
		note('popular', 'u6'),
	];
	const hands = [['held', 'popular'], ['popular', 'rated'], ['popular']];

	it('excludes my own, held, rated and hidden notes', () => {
		const candidates = buildCandidates({
			pool,
			uid: 'me',
			hand: ['held'],
			rated: new Set(['rated']),
			hands,
			hidden: (id) => id === 'moderated',
		});
		expect(candidates.map((c) => c.statementId).sort()).toEqual(['fresh', 'popular']);
	});

	it('counts how many hands in the session hold each note', () => {
		const candidates = buildCandidates({ pool, uid: 'me', hand: [], rated: new Set(), hands });
		const byId = Object.fromEntries(candidates.map((c) => [c.statementId, c.dealtCount]));
		expect(byId.popular).toBe(3);
		expect(byId.held).toBe(1);
		expect(byId.fresh).toBe(0);
	});
});

describe('dealableParents', () => {
	it('allows the challenge question and every planned question', () => {
		const session = {
			challengeQuestionId: 'challenge',
			stage: AgoraStage.deliberation,
			stageIndex: 1,
			stagePlan: [
				{ itemId: 'q1', stage: AgoraStage.question, statementId: 'q1-statement' },
				{ itemId: 'd', stage: AgoraStage.deliberation },
			],
		} as unknown as AgoraSession;
		const parents = dealableParents(session);
		expect(parents.has('challenge')).toBe(true);
		expect(parents.has('q1-statement')).toBe(true);
		expect(parents.has('elsewhere')).toBe(false);
	});
});
