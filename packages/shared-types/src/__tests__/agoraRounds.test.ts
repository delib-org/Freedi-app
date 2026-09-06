import { AgoraStage } from '../models/agora/agoraEnums';
import { AGORA_STAGE_PLAN, stagePlanPreset, validateStagePlan } from '../models/agora/stagePlan';
import type { AgoraCarriedAnswer, AgoraStagePlanItem } from '../models/agora/stagePlan';
import {
	AGORA_ROUND,
	AGORA_ROUNDS,
	evaluationScaleOf,
	isRoundKind,
	isUnitRating,
	questionKindOf,
	rankRoundAnswers,
	roundAppreciates,
	roundLikes,
	roundProgress,
	roundSpecOf,
} from '../models/agora/rounds';

const row = (statementId: string, mean: number, raters: number): AgoraCarriedAnswer => ({
	statementId,
	statement: statementId,
	mean,
	raters,
});

const kindsOf = (plan: AgoraStagePlanItem[]): string[] =>
	plan.map((item) => (item.stage === AgoraStage.question ? `question:${questionKindOf(item)}` : item.stage));

describe('the WizCol presets', () => {
	it('wizcol runs the three rounds as question items, then the square and the vote', () => {
		const plan = stagePlanPreset('wizcol');

		expect(kindsOf(plan)).toEqual([
			AgoraStage.lobby,
			'question:story',
			'question:needs',
			'question:vision',
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

		expect(kindsOf(plan).slice(0, 6)).toEqual([
			AgoraStage.lobby,
			AgoraStage.framing,
			AgoraStage.perspectives,
			AgoraStage.needs,
			AgoraStage.positioning,
			'question:story',
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

	it('an open question needs its words; a round may leave the title blank', () => {
		const untitledOpen = stagePlanPreset('quickDecision');
		expect(validateStagePlan(untitledOpen, { hasCharacters: false })).toContain(
			'question_needs_title',
		);
		expect(validateStagePlan(stagePlanPreset('wizcol'), { hasCharacters: false })).not.toContain(
			'question_needs_title',
		);
	});
});

describe('the round table', () => {
	it('reads the kind off the item, open when it says nothing', () => {
		expect(questionKindOf({})).toBe('open');
		expect(questionKindOf({ kind: 'story' })).toBe('story');
		expect(isRoundKind('open')).toBe(false);
		expect(isRoundKind('vision')).toBe(true);
		expect(roundSpecOf({})).toBeNull();
		expect(roundSpecOf({ kind: 'needs' })?.scale).toBe('unit');
		expect(evaluationScaleOf({})).toBe('bipolar');
		expect(evaluationScaleOf({ kind: 'story' })).toBe('like');
	});

	it('stories are liked in threes; needs and visions are weighed 0…1 in sixes', () => {
		expect(AGORA_ROUNDS.story.scale).toBe('like');
		expect(AGORA_ROUNDS.story.sample).toBe(3);
		expect(AGORA_ROUNDS.needs.scale).toBe('unit');
		expect(AGORA_ROUNDS.needs.sample).toBe(6);
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
		expect(roundAppreciates(AGORA_ROUNDS.needs, 0.5)).toBe(true);
		expect(roundAppreciates(AGORA_ROUNDS.needs, 0.25)).toBe(false);
		expect(roundAppreciates(AGORA_ROUNDS.vision, Number.NaN)).toBe(false);
	});

	it('knows the unit steps', () => {
		expect(isUnitRating(0.75)).toBe(true);
		expect(isUnitRating(0.6)).toBe(false);
		expect(isUnitRating(-0.5)).toBe(false);
	});

	it('ranks a closed story round by hearts and a unit round by mean, unrated last', () => {
		const stories = rankRoundAnswers('story', [
			row('a', 0.5, 2),
			row('b', 1, 3),
			row('c', 0, 0),
			row('d', 1, 3),
		]);
		expect(stories.map((item) => item.statementId)).toEqual(['b', 'd', 'a', 'c']);

		const needs = rankRoundAnswers('needs', [row('a', 0.25, 5), row('b', 0.75, 2), row('c', 0, 0)]);
		expect(needs.map((item) => item.statementId)).toEqual(['b', 'a', 'c']);
	});

	it('measures a student’s way through a round as one text plus the sample', () => {
		expect(roundProgress(false, 0, 3)).toEqual({ done: 0, total: 4 });
		expect(roundProgress(true, 2, 3)).toEqual({ done: 3, total: 4 });
		expect(roundProgress(true, 9, 3)).toEqual({ done: 4, total: 4 });
	});
});
