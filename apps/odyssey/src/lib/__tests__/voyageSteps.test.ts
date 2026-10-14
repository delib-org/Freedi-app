import { describe, expect, it } from 'vitest';
import type { OdysseyJourney } from '@freedi/shared-types';
import type { GameContent, IslandContent } from '../game';
import type { AttitudeMap } from '../distance';
import { TOP_VALUES, voyageSteps, type VoyageStep } from '../voyageSteps';

/** Minimal island fixture — the strip reads statementId, enabled and stance ids. */
function island(statementId: string, stanceIds: string[], enabled = true): IslandContent {
	return {
		statementId,
		enabled,
		stances: stanceIds.map((id) => ({ statementId: id })),
	} as unknown as IslandContent;
}

function content({
	questions = ['q1', 'q2'],
	elders = ['ben-gurion'],
	islands = [island('i1', ['s1', 's2']), island('i2', ['s3', 's4'])],
}: {
	questions?: string[];
	elders?: string[];
	islands?: IslandContent[];
} = {}): GameContent {
	return {
		game: {
			compassQuestions: questions.map((questionId, index) => ({
				questionId,
				enabled: true,
				sortOrder: index + 1,
			})),
			elders: elders.map((elderId, index) => ({
				elderId,
				enabled: true,
				sortOrder: index + 1,
			})),
		},
		islands,
	} as unknown as GameContent;
}

function journey(patch: Partial<OdysseyJourney> = {}): OdysseyJourney {
	return {
		journeyId: 'u1--default',
		gameId: 'default',
		userId: 'u1',
		compassAnswers: {},
		valueRankings: {},
		selectedIslandIds: [],
		depthAnswers: {},
		logEntries: [],
		createdAt: 1,
		lastUpdate: 1,
		...patch,
	} as OdysseyJourney;
}

/** Every wind lit: both questions answered and the values ranked. */
const compassFinished: Partial<OdysseyJourney> = {
	compassAnswers: {
		q1: { answer: 'כן', chips: [] },
		q2: { answer: '', chips: ['ביטחון'] },
	},
	valueRankings: Object.fromEntries(
		Array.from({ length: TOP_VALUES }, (_, index) => [`v${index}`, index + 1]),
	),
};

function steps(
	journeyPatch: Partial<OdysseyJourney> = {},
	attitudes: AttitudeMap = {},
	pathname = '/voyage',
	gameContent: GameContent = content(),
): VoyageStep[] {
	return voyageSteps({
		content: gameContent,
		journey: journey(journeyPatch),
		attitudes,
		pathname,
	});
}

function byPath(all: VoyageStep[], path: string): VoyageStep {
	const step = all.find((entry) => entry.path === path);
	if (!step) throw new Error(`no step for ${path}`);

	return step;
}

describe('voyageSteps', () => {
	it('shows nothing before there is a game and a journey', () => {
		expect(
			voyageSteps({ content: null, journey: journey(), attitudes: {}, pathname: '/' }),
		).toEqual([]);
		expect(
			voyageSteps({ content: content(), journey: null, attitudes: {}, pathname: '/' }),
		).toEqual([]);
	});

	it('lists the legs of the voyage in order — no map and no crew to choose', () => {
		expect(steps().map((step) => step.path)).toEqual(['/', '/compass', '/voyage', '/summary']);
	});

	it('counts the compass winds, values included', () => {
		expect(byPath(steps(), '/compass').detail).toBe('0/3 רוחות');
		expect(
			byPath(steps({ compassAnswers: { q1: { answer: 'כן', chips: [] } } }), '/compass'),
		).toMatchObject({ detail: '1/3 רוחות', status: 'open' });
		expect(byPath(steps(compassFinished), '/compass')).toMatchObject({
			detail: '3/3 רוחות',
			status: 'done',
		});
	});

	it('treats chips alone as an answered wind', () => {
		expect(
			byPath(steps({ compassAnswers: { q1: { answer: '  ', chips: ['ביטחון'] } } }), '/compass')
				.detail,
		).toBe('1/3 רוחות');
	});

	it('counts every enabled island as the route, and the ones already sailed', () => {
		expect(byPath(steps(compassFinished, {}, '/summary'), '/voyage')).toMatchObject({
			status: 'open',
			detail: '0/2 איים',
		});
		// One marked stance is what the island screen itself requires to sail on.
		expect(byPath(steps(compassFinished, { s1: 1 }, '/summary'), '/voyage')).toMatchObject({
			status: 'open',
			detail: '1/2 איים',
		});
		expect(byPath(steps(compassFinished, { s1: 1, s4: -1 }, '/summary'), '/voyage')).toMatchObject({
			status: 'done',
			detail: '2/2 איים',
		});
	});

	it('ignores a legacy island choice: the route is every island', () => {
		// Journeys from before the choosing was removed still carry
		// selectedIslandIds; it must neither shrink nor grow the route.
		expect(byPath(steps({ ...compassFinished, selectedIslandIds: ['i1'] }), '/voyage').detail).toBe(
			'0/2 איים',
		);
	});

	it('ignores islands the organizer switched off', () => {
		const game = content({ islands: [island('i1', ['s1']), island('i2', ['s3'], false)] });
		expect(byPath(steps(compassFinished, { s1: 1 }, '/voyage', game), '/voyage').detail).toBe(
			'1/1 איים',
		);
	});

	it('the homecoming is an arrival: never a ✓, and open as soon as one island is sailed', () => {
		expect(byPath(steps(compassFinished, {}, '/compass'), '/summary')).toMatchObject({
			status: 'locked',
			isDestination: true,
		});
		// The player may stop whenever they like.
		expect(byPath(steps(compassFinished, { s1: 1 }, '/compass'), '/summary').status).toBe('open');
		expect(byPath(steps(compassFinished, { s1: 1 }, '/summary'), '/voyage').status).toBe('open');
	});

	it('marks where the player is standing', () => {
		const all = steps(compassFinished, {}, '/compass');
		expect(byPath(all, '/compass').status).toBe('current');
		// The intro is behind them and stays a link back.
		expect(byPath(all, '/').status).toBe('done');
	});

	it('a half-answered compass does not wall off islands already sailed', () => {
		const all = steps({}, { s1: 1 }, '/compass');
		expect(byPath(all, '/compass').status).toBe('current');
		expect(byPath(all, '/voyage').status).toBe('open');
		expect(byPath(all, '/summary').status).toBe('open');
	});
});
