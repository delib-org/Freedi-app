import { AgoraStage } from '../models/agora/agoraEnums';
import { AGORA_STAGE_PLAN, stagePlanPreset, validateStagePlan } from '../models/agora/stagePlan';
import type { AgoraCarriedAnswer } from '../models/agora/stagePlan';
import {
	AGORA_ROUND,
	AGORA_ROUNDS,
	isCarryStage,
	isRoundStage,
	isUnitRating,
	rankRoundAnswers,
	roundAppreciates,
	roundLikes,
	roundProgress,
} from '../models/agora/rounds';

const row = (statementId: string, mean: number, raters: number): AgoraCarriedAnswer => ({
	statementId,
	statement: statementId,
	mean,
	raters,
});

describe('the WizCol presets', () => {
	it('wizcol runs intro, the three rounds, the square and the vote, in that order', () => {
		const plan = stagePlanPreset('wizcol');

		expect(plan.map((item) => item.stage)).toEqual([
			AgoraStage.lobby,
			AgoraStage.intro,
			AgoraStage.story,
			AgoraStage.myNeeds,
			AgoraStage.vision,
			AgoraStage.deliberation,
			AgoraStage.voting,
			AgoraStage.results,
		]);
		expect(validateStagePlan(plan, { hasCharacters: false })).toEqual([]);
		expect(plan.find((item) => item.stage === AgoraStage.deliberation)?.votingTrigger?.enabled).toBe(
			true,
		);
	});

	it('scenarioWizcol puts the character scenes in front as the prologue and still fits', () => {
		const plan = stagePlanPreset('scenarioWizcol');

		expect(plan.map((item) => item.stage).slice(0, 6)).toEqual([
			AgoraStage.lobby,
			AgoraStage.framing,
			AgoraStage.perspectives,
			AgoraStage.needs,
			AgoraStage.positioning,
			AgoraStage.intro,
		]);
		expect(plan.length).toBeLessThanOrEqual(AGORA_STAGE_PLAN.MAX_ITEMS);
		expect(validateStagePlan(plan, { hasCharacters: true })).toEqual([]);
		expect(validateStagePlan(plan, { hasCharacters: false })).toContain('stage_needs_characters');
	});

	it('the older presets still validate', () => {
		expect(validateStagePlan(stagePlanPreset('classic'), { hasCharacters: true })).toEqual([]);
		const quick = stagePlanPreset('quickDecision').map((item) =>
			item.stage === AgoraStage.question ? { ...item, title: 'Which?' } : item,
		);
		expect(validateStagePlan(quick, { hasCharacters: false })).toEqual([]);
	});

	it('every kind but question runs once', () => {
		const twice = [
			...stagePlanPreset('wizcol').slice(0, 3),
			{ itemId: 'story-2', stage: AgoraStage.story },
			...stagePlanPreset('wizcol').slice(3),
		];

		expect(validateStagePlan(twice, { hasCharacters: false })).toContain('stage_once');

		const twoQuestions = [
			{ itemId: AgoraStage.lobby, stage: AgoraStage.lobby },
			{ itemId: 'question-1', stage: AgoraStage.question, title: 'a' },
			{ itemId: 'question-2', stage: AgoraStage.question, title: 'b' },
			{ itemId: AgoraStage.results, stage: AgoraStage.results },
		];
		expect(validateStagePlan(twoQuestions, { hasCharacters: false })).not.toContain('stage_once');
	});
});

describe('the round table', () => {
	it('names the three rounds and the carry stages', () => {
		expect(isRoundStage(AgoraStage.story)).toBe(true);
		expect(isRoundStage(AgoraStage.needs)).toBe(false);
		expect(isRoundStage(AgoraStage.question)).toBe(false);
		expect(isCarryStage(AgoraStage.question)).toBe(true);
		expect(isCarryStage(AgoraStage.vision)).toBe(true);
		expect(isCarryStage(AgoraStage.deliberation)).toBe(false);
	});

	it('stories are liked in threes; needs and visions are weighed 0…1 in sixes', () => {
		expect(AGORA_ROUNDS.story.scale).toBe('like');
		expect(AGORA_ROUNDS.story.sample).toBe(3);
		expect(AGORA_ROUNDS.myNeeds.scale).toBe('unit');
		expect(AGORA_ROUNDS.myNeeds.sample).toBe(6);
		expect(AGORA_ROUNDS.vision.summary).toBe('merge');
	});

	it('counts hearts from the pipeline mean and never below zero', () => {
		expect(roundLikes({ mean: 0.75, raters: 4 })).toBe(3);
		expect(roundLikes({ mean: 1, raters: 2 })).toBe(2);
		expect(roundLikes({ mean: 0, raters: 3 })).toBe(0);
		expect(roundLikes({ mean: Number.NaN, raters: 3 })).toBe(0);
		expect(roundLikes({ mean: 1, raters: 0 })).toBe(0);
	});

	it('pays at the boundary and not below it', () => {
		expect(roundAppreciates(AGORA_ROUNDS.story, AGORA_ROUND.LIKE)).toBe(true);
		expect(roundAppreciates(AGORA_ROUNDS.story, AGORA_ROUND.UNLIKE)).toBe(false);
		expect(roundAppreciates(AGORA_ROUNDS.myNeeds, 0.5)).toBe(true);
		expect(roundAppreciates(AGORA_ROUNDS.myNeeds, 0.25)).toBe(false);
		expect(roundAppreciates(AGORA_ROUNDS.vision, Number.NaN)).toBe(false);
	});

	it('knows the unit steps', () => {
		expect(isUnitRating(0.75)).toBe(true);
		expect(isUnitRating(0.6)).toBe(false);
		expect(isUnitRating(-0.5)).toBe(false);
	});

	it('ranks a closed story round by hearts and a unit round by mean, unrated last', () => {
		const stories = rankRoundAnswers(AgoraStage.story, [
			row('a', 0.5, 2), // 1 heart
			row('b', 1, 3), // 3 hearts
			row('c', 0, 0), // unrated
			row('d', 1, 3), // 3 hearts, tie → id
		]);
		expect(stories.map((item) => item.statementId)).toEqual(['b', 'd', 'a', 'c']);

		const needs = rankRoundAnswers(AgoraStage.myNeeds, [
			row('a', 0.25, 5),
			row('b', 0.75, 2),
			row('c', 0, 0),
		]);
		expect(needs.map((item) => item.statementId)).toEqual(['b', 'a', 'c']);
	});

	it('measures a student’s way through a round as one text plus the sample', () => {
		expect(roundProgress(false, 0, 3)).toEqual({ done: 0, total: 4 });
		expect(roundProgress(true, 2, 3)).toEqual({ done: 3, total: 4 });
		expect(roundProgress(true, 9, 3)).toEqual({ done: 4, total: 4 });
	});
});
