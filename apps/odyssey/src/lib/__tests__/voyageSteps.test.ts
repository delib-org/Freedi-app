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
	pathname = '/map',
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

	it('lists the legs of the voyage in order', () => {
		expect(steps().map((step) => step.path)).toEqual([
			'/',
			'/compass',
			'/elders',
			'/map',
			'/voyage',
			'/summary',
		]);
	});

	it('leaves out the crew when the game has no elders', () => {
		const all = steps({}, {}, '/map', content({ elders: [] }));
		expect(all.map((step) => step.path)).not.toContain('/elders');
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

	it('marks the crew chosen even when nobody was invited', () => {
		expect(byPath(steps(), '/elders').status).toBe('locked');
		expect(byPath(steps({ ...compassFinished, selectedElderIds: [] }), '/elders')).toMatchObject({
			status: 'done',
			detail: '0 מלחים',
		});
	});

	it('counts the islands chosen, and the ones already sailed', () => {
		const chosen = { ...compassFinished, selectedElderIds: [], selectedIslandIds: ['i1', 'i2'] };
		// standing on the water, so the map behind them reads as finished
		expect(byPath(steps(chosen, {}, '/voyage'), '/map')).toMatchObject({
			status: 'done',
			detail: '2 איים',
		});
		expect(byPath(steps(chosen), '/voyage')).toMatchObject({ status: 'open', detail: '0/2 איים' });

		// One marked stance is what the island screen itself requires to sail on.
		expect(byPath(steps(chosen, { s1: 1 }), '/voyage')).toMatchObject({
			status: 'open',
			detail: '1/2 איים',
		});
		expect(byPath(steps(chosen, { s1: 1, s4: -1 }), '/voyage')).toMatchObject({
			status: 'done',
			detail: '2/2 איים',
		});
	});

	it('ignores islands the organizer switched off', () => {
		const game = content({ islands: [island('i1', ['s1']), island('i2', ['s3'], false)] });
		const all = steps(
			{ ...compassFinished, selectedElderIds: [], selectedIslandIds: ['i1', 'i2'] },
			{ s1: 1 },
			'/voyage',
			game,
		);
		expect(byPath(all, '/map').detail).toBe('1 איים');
		expect(byPath(all, '/voyage').detail).toBe('1/1 איים');
	});

	it('the homecoming is an arrival: it never carries a ✓, and opens once the voyage is sailed', () => {
		const chosen = { ...compassFinished, selectedElderIds: [], selectedIslandIds: ['i1', 'i2'] };
		expect(byPath(steps(chosen, { s1: 1 }), '/summary')).toMatchObject({
			status: 'locked',
			isDestination: true,
		});
		expect(byPath(steps(chosen, { s1: 1, s3: 1 }), '/summary').status).toBe('open');
	});

	it('marks where the player is standing', () => {
		const all = steps(compassFinished, {}, '/compass');
		expect(byPath(all, '/compass').status).toBe('current');
		// The intro is behind them and stays a link back.
		expect(byPath(all, '/').status).toBe('done');
	});

	it('unlocks a skipped leg once a later one is finished', () => {
		// A journey from before the crew screen existed: no selectedElderIds,
		// but islands already chosen. The crew must not wall off the voyage.
		const all = steps({ ...compassFinished, selectedIslandIds: ['i1'] }, {}, '/map');
		expect(byPath(all, '/elders').status).toBe('open');
		expect(byPath(all, '/voyage').status).toBe('open');
	});
});
