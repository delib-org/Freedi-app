import { AgoraStage, AGORA_STAGE_ORDER, AgoraSessionMode } from '../models/agora/agoraEnums';
import { CutoffBy } from '../models/results/ResultsSettings';
import {
	currentPlanIndex,
	evaluateVotingTrigger,
	isItemOpened,
	legacyStagePlan,
	nextPlanItem,
	planIndexForStage,
	resolveStagePlan,
	stagePlanPreset,
	validateStagePlan,
	closedQuestionItems,
	defaultVotingTrigger,
	selectCarriedAnswers,
} from '../models/agora/stagePlan';
import type { AgoraStagePlanItem } from '../models/agora/stagePlan';

const kinds = (items: AgoraStagePlanItem[]): AgoraStage[] => items.map((item) => item.stage);

describe('resolveStagePlan — the legacy fold', () => {
	it('runs exactly the order every session always ran, ended included', () => {
		expect(kinds(resolveStagePlan({ stage: AgoraStage.lobby }))).toEqual([...AGORA_STAGE_ORDER]);
	});

	it('drops the voting item when the session does not vote', () => {
		const plan = resolveStagePlan({ stage: AgoraStage.lobby, votingSettings: { enabled: false } });

		expect(kinds(plan)).not.toContain(AgoraStage.voting);
		expect(kinds(plan)).toContain(AgoraStage.results);
	});

	it('honours the flow knob the same way', () => {
		expect(kinds(legacyStagePlan({ flow: { voting: false } }))).not.toContain(AgoraStage.voting);
	});

	it('appends ended to an explicit plan, and never stores it', () => {
		const plan = resolveStagePlan({
			stage: AgoraStage.lobby,
			stagePlan: stagePlanPreset('quickDecision'),
		});

		expect(plan[plan.length - 1].stage).toBe(AgoraStage.ended);
		expect(kinds(stagePlanPreset('quickDecision'))).not.toContain(AgoraStage.ended);
	});
});

describe('currentPlanIndex', () => {
	it('trusts stageIndex when it agrees with the stage kind', () => {
		const stagePlan = stagePlanPreset('quickDecision');
		expect(
			currentPlanIndex({ stage: AgoraStage.deliberation, stageIndex: 2, stagePlan }),
		).toBe(2);
	});

	it('places a legacy session by its stage', () => {
		expect(currentPlanIndex({ stage: AgoraStage.positioning })).toBe(
			AGORA_STAGE_ORDER.indexOf(AgoraStage.positioning),
		);
	});

	it('places the retired valueIdentification stage at needs', () => {
		expect(currentPlanIndex({ stage: AgoraStage.valueIdentification })).toBe(
			AGORA_STAGE_ORDER.indexOf(AgoraStage.needs),
		);
	});

	it('places a civic session provisioned straight into deliberation', () => {
		const index = currentPlanIndex({
			stage: AgoraStage.deliberation,
			sessionMode: AgoraSessionMode.civic,
		});

		expect(resolveStagePlan({ stage: AgoraStage.deliberation })[index].stage).toBe(
			AgoraStage.deliberation,
		);
	});

	it('resolves a session sitting on voting after voting was switched off to its neighbour', () => {
		const session = { stage: AgoraStage.voting, votingSettings: { enabled: false } };
		const plan = resolveStagePlan(session);

		expect(plan[currentPlanIndex(session)].stage).toBe(AgoraStage.deliberation);
	});

	it('walks a plan with two question items by index, not by kind', () => {
		const stagePlan: AgoraStagePlanItem[] = [
			{ itemId: 'lobby', stage: AgoraStage.lobby },
			{ itemId: 'q1', stage: AgoraStage.question, title: 'What do I want?' },
			{ itemId: 'q2', stage: AgoraStage.question, title: 'What do we need?' },
			{ itemId: 'results', stage: AgoraStage.results },
		];
		const session = { stage: AgoraStage.question, stageIndex: 2, stagePlan };

		expect(currentPlanIndex(session)).toBe(2);
		expect(nextPlanItem(session)?.stage).toBe(AgoraStage.results);
		expect(isItemOpened(session, 'q1')).toBe(true);
		expect(isItemOpened(session, 'results')).toBe(false);
		expect(closedQuestionItems(session, 2).map((item) => item.itemId)).toEqual(['q1']);
	});
});

describe('planIndexForStage — the legacy {stage} request against a plan', () => {
	it('finds the first item of that kind ahead', () => {
		const session = { stage: AgoraStage.deliberation, stageIndex: 2, stagePlan: stagePlanPreset('quickDecision') };

		expect(planIndexForStage(session, AgoraStage.voting)).toBe(3);
		expect(planIndexForStage(session, AgoraStage.results)).toBe(4);
	});

	it('returns −1 for a kind behind or absent', () => {
		const session = { stage: AgoraStage.deliberation, stageIndex: 2, stagePlan: stagePlanPreset('quickDecision') };

		expect(planIndexForStage(session, AgoraStage.question)).toBe(-1);
		expect(planIndexForStage(session, AgoraStage.needs)).toBe(-1);
	});

	it('lets a legacy session skip deliberation → results, as it always could', () => {
		expect(planIndexForStage({ stage: AgoraStage.deliberation }, AgoraStage.results)).toBe(
			AGORA_STAGE_ORDER.indexOf(AgoraStage.results),
		);
	});
});

describe('validateStagePlan', () => {
	const ok = { hasCharacters: true };

	it('accepts both presets', () => {
		expect(validateStagePlan(stagePlanPreset('classic'), ok)).toEqual([]);
		const quick = stagePlanPreset('quickDecision').map((item) =>
			item.stage === AgoraStage.question ? { ...item, title: 'What do I want?' } : item,
		);
		expect(validateStagePlan(quick, { hasCharacters: false })).toEqual([]);
	});

	it('requires lobby first and results last', () => {
		expect(
			validateStagePlan(
				[
					{ itemId: 'a', stage: AgoraStage.deliberation },
					{ itemId: 'b', stage: AgoraStage.lobby },
				],
				ok,
			),
		).toEqual(expect.arrayContaining(['must_start_lobby', 'must_end_results', 'lobby_only_first']));
	});

	it('refuses character stages without characters', () => {
		expect(validateStagePlan(stagePlanPreset('classic'), { hasCharacters: false })).toContain(
			'stage_needs_characters',
		);
	});

	it('refuses a vote with nothing to vote on, and an untitled question', () => {
		const errors = validateStagePlan(
			[
				{ itemId: 'lobby', stage: AgoraStage.lobby },
				{ itemId: 'v', stage: AgoraStage.voting },
				{ itemId: 'q', stage: AgoraStage.question },
				{ itemId: 'results', stage: AgoraStage.results },
			],
			ok,
		);

		expect(errors).toEqual(expect.arrayContaining(['voting_needs_source', 'question_needs_title']));
	});

	it('refuses ended and duplicate ids', () => {
		const errors = validateStagePlan(
			[
				{ itemId: 'lobby', stage: AgoraStage.lobby },
				{ itemId: 'lobby', stage: AgoraStage.ended },
				{ itemId: 'results', stage: AgoraStage.results },
			],
			ok,
		);

		expect(errors).toEqual(expect.arrayContaining(['ended_not_allowed', 'duplicate_item_id']));
	});
});

describe('evaluateVotingTrigger', () => {
	const rule = defaultVotingTrigger();

	it('does nothing when switched off', () => {
		expect(evaluateVotingTrigger([{ statementId: 'a', mean: 1, n: 10 }], { ...rule, enabled: false }))
			.toEqual({ fired: false, best: null });
	});

	it('ignores proposals under the raters floor', () => {
		expect(evaluateVotingTrigger([{ statementId: 'a', mean: 1, n: 2 }], rule)).toEqual({
			fired: false,
			best: null,
		});
	});

	it('fires single on one proposal at 0.85 — the ballot is that proposal alone', () => {
		const verdict = evaluateVotingTrigger(
			[
				{ statementId: 'a', mean: 0.9, n: 3 },
				{ statementId: 'b', mean: 0.6, n: 3 },
			],
			rule,
		);

		expect(verdict).toEqual({ fired: true, mode: 'single', candidateIds: ['a'] });
	});

	it('fires pair on two at 0.5, best first', () => {
		const verdict = evaluateVotingTrigger(
			[
				{ statementId: 'b', mean: 0.55, n: 3 },
				{ statementId: 'a', mean: 0.7, n: 4 },
				{ statementId: 'c', mean: 0.5, n: 3 },
			],
			rule,
		);

		expect(verdict).toEqual({ fired: true, mode: 'pair', candidateIds: ['a', 'b'] });
	});

	it('reports the best net agreement so far when nothing fired', () => {
		expect(evaluateVotingTrigger([{ statementId: 'a', mean: 0.4, n: 3 }], rule)).toEqual({
			fired: false,
			best: 0.4,
		});
	});

	it('uses the raw mean, never a rescaled percent', () => {
		// (0.7 + 1) / 2 would be 85% on a 0…1 scale; the rule reads the mean itself
		expect(evaluateVotingTrigger([{ statementId: 'a', mean: 0.7, n: 3 }], rule).fired).toBe(false);
	});
});

describe('presets', () => {
	it('quickDecision asks, deliberates, votes, and its question selects by top options', () => {
		const plan = stagePlanPreset('quickDecision');

		expect(kinds(plan)).toEqual([
			AgoraStage.lobby,
			AgoraStage.question,
			AgoraStage.deliberation,
			AgoraStage.voting,
			AgoraStage.results,
		]);
		expect(plan[1].selection?.cutoffBy).toBe(CutoffBy.topOptions);
		expect(plan[2].votingTrigger?.enabled).toBe(true);
	});
});

describe('selectCarriedAnswers', () => {
	const rows = [
		{ statementId: 'a', statement: 'A', mean: 0.2, raters: 3 },
		{ statementId: 'b', statement: 'B', mean: 0.9, raters: 2 },
		{ statementId: 'c', statement: 'C', mean: 0, raters: 0 },
		{ statementId: 'd', statement: 'D', mean: 0.6, raters: 4 },
	];

	it('takes the top N by net agreement, unrated last', () => {
		expect(
			selectCarriedAnswers(rows, { cutoffBy: CutoffBy.topOptions, numberOfResults: 2, cutoffNumber: 0 })
				.map((row) => row.statementId),
		).toEqual(['b', 'd']);
		expect(
			selectCarriedAnswers(rows, { cutoffBy: CutoffBy.topOptions, numberOfResults: 9, cutoffNumber: 0 })
				.map((row) => row.statementId),
		).toEqual(['b', 'd', 'a', 'c']);
	});

	it('never carries an unrated answer over a threshold', () => {
		expect(
			selectCarriedAnswers(rows, { cutoffBy: CutoffBy.aboveThreshold, numberOfResults: 3, cutoffNumber: 0 })
				.map((row) => row.statementId),
		).toEqual(['b', 'd', 'a']);
	});
});
