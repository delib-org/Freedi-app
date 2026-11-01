import { describe, expect, it } from 'vitest';
import {
	AgoraStage,
	AGORA_STAGE_PLAN,
	stagePlanPreset,
	validateStagePlan,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import {
	addChoices,
	addedItem,
	canInsertAt,
	insertionRange,
	matchingPreset,
	planEditorReduce,
	stepProblems,
} from '../flows/stagePlanEditor';

const fresh = { hasCharacters: false, frozenCount: 0 };
const kinds = (items: readonly AgoraStagePlanItem[]): string[] =>
	items.map((item) => (item.kind ? `${item.stage}:${item.kind}` : item.stage));

describe('insertionRange', () => {
	it('is after the entry and up to the results', () => {
		const items = stagePlanPreset('wizcol'); // lobby, story, needs, deliberation, voting, results
		expect(insertionRange(items, 0)).toEqual({ first: 1, last: 5 });
		expect(canInsertAt(items, 0, 0)).toBe(false);
		expect(canInsertAt(items, 1, 0)).toBe(true);
		expect(canInsertAt(items, 5, 0)).toBe(true);
		expect(canInsertAt(items, 6, 0)).toBe(false);
	});

	it('never reaches into the steps that already ran', () => {
		const items = stagePlanPreset('wizcol');
		expect(insertionRange(items, 3)).toEqual({ first: 3, last: 5 });
		expect(canInsertAt(items, 2, 3)).toBe(false);
	});

	it('collapses to the end when the history reaches the results', () => {
		const items = stagePlanPreset('wizcol');
		expect(insertionRange(items, 6)).toEqual({ first: 5, last: 5 });
	});
});

describe('add at a position', () => {
	it('puts a question of the chosen type exactly where the teacher pointed', () => {
		const items = planEditorReduce(
			stagePlanPreset('wizcol'),
			{ kind: 'add', stage: AgoraStage.question, questionKind: 'vision', at: 3 },
			fresh,
		);

		expect(kinds(items)).toEqual([
			'lobby',
			'question:story',
			'question:needs',
			'question:vision',
			'deliberation',
			'voting',
			'results',
		]);
		const vision = items[3];
		expect(vision.selection).toBeUndefined();
		// A round needs no words of the teacher's: the plan is still valid
		expect(validateStagePlan(items, { hasCharacters: false })).toEqual([]);
	});

	it('an open question comes with its cutoff and waits for its words', () => {
		const items = planEditorReduce(
			stagePlanPreset('wizcol'),
			{ kind: 'add', stage: AgoraStage.question, questionKind: 'open', at: 1 },
			fresh,
		);
		expect(items[1].kind).toBe('open');
		expect(items[1].selection).toBeDefined();
		expect(stepProblems(items, fresh).get(items[1].itemId)).toBe('question_needs_title');
	});

	it('clamps a position before the entry or after the results', () => {
		const before = planEditorReduce(
			stagePlanPreset('wizcol'),
			{ kind: 'add', stage: AgoraStage.question, at: 0 },
			fresh,
		);
		expect(before[0].stage).toBe(AgoraStage.lobby);
		expect(before[1].stage).toBe(AgoraStage.question);

		const after = planEditorReduce(
			stagePlanPreset('wizcol'),
			{ kind: 'add', stage: AgoraStage.question, at: 99 },
			fresh,
		);
		expect(after[after.length - 1].stage).toBe(AgoraStage.results);
		expect(after[after.length - 2].kind).toBe('open');
	});

	it('a single-instance stage goes where it was put, once', () => {
		const noVote = stagePlanPreset('wizcol').filter((item) => item.stage !== AgoraStage.voting);
		const added = planEditorReduce(noVote, { kind: 'add', stage: AgoraStage.voting, at: 4 }, fresh);
		expect(added[4].stage).toBe(AgoraStage.voting);
		const again = planEditorReduce(added, { kind: 'add', stage: AgoraStage.voting, at: 2 }, fresh);
		expect(again).toEqual(added);
	});

	it('stops at the longest plan the engine takes', () => {
		let items = stagePlanPreset('wizcol');
		for (let i = 0; i < AGORA_STAGE_PLAN.MAX_ITEMS + 4; i += 1) {
			items = planEditorReduce(
				items,
				{ kind: 'add', stage: AgoraStage.question, questionKind: 'story' },
				fresh,
			);
		}
		expect(items.length).toBe(AGORA_STAGE_PLAN.MAX_ITEMS);
		expect(addChoices(items, fresh)).toEqual([]);
	});

	it('addedItem finds the new step', () => {
		const before = stagePlanPreset('wizcol');
		const after = planEditorReduce(
			before,
			{ kind: 'add', stage: AgoraStage.question, at: 2 },
			fresh,
		);
		expect(addedItem(before, after)?.itemId).toBe(after[2].itemId);
		expect(addedItem(before, before)).toBeNull();
	});
});

describe('addChoices', () => {
	it('offers every question type and the stages not yet in the plan', () => {
		const noVote = stagePlanPreset('wizcol').filter((item) => item.stage !== AgoraStage.voting);
		expect(addChoices(noVote, fresh)).toEqual([
			{ stage: AgoraStage.question, questionKind: 'open' },
			{ stage: AgoraStage.question, questionKind: 'story' },
			{ stage: AgoraStage.question, questionKind: 'needs' },
			{ stage: AgoraStage.question, questionKind: 'vision' },
			{ stage: AgoraStage.voting },
			{ stage: AgoraStage.linked },
		]);
	});

	it('offers the character steps only in a scenario lesson', () => {
		const plain = addChoices(stagePlanPreset('wizcol'), { hasCharacters: false });
		expect(plain.some((choice) => choice.stage === AgoraStage.framing)).toBe(false);
		const scenario = addChoices(stagePlanPreset('wizcol'), { hasCharacters: true });
		expect(scenario.some((choice) => choice.stage === AgoraStage.framing)).toBe(true);
	});
});

describe('stepProblems', () => {
	it('names a vote with nothing to vote on', () => {
		const items: AgoraStagePlanItem[] = [
			{ itemId: 'lobby', stage: AgoraStage.lobby },
			{ itemId: 'voting', stage: AgoraStage.voting },
			{ itemId: 'deliberation', stage: AgoraStage.deliberation },
			{ itemId: 'results', stage: AgoraStage.results },
		];
		expect(stepProblems(items, fresh).get('voting')).toBe('voting_needs_source');
		expect(stepProblems(stagePlanPreset('wizcol'), fresh).size).toBe(0);
	});

	it('names a character step in a lesson without characters', () => {
		const items = stagePlanPreset('scenarioWizcol');
		expect(stepProblems(items, { hasCharacters: false }).get('framing')).toBe(
			'stage_needs_characters',
		);
		expect(stepProblems(items, { hasCharacters: true }).size).toBe(0);
	});
});

describe('matchingPreset', () => {
	const presets = ['wizcol', 'quickDecision'] as const;

	it('recognises an untouched template', () => {
		expect(matchingPreset(stagePlanPreset('wizcol'), presets)).toBe('wizcol');
		expect(matchingPreset(stagePlanPreset('quickDecision'), presets)).toBe('quickDecision');
	});

	it('an edited plan is the teacher’s own', () => {
		const typed = planEditorReduce(
			stagePlanPreset('wizcol'),
			{ kind: 'patch', itemId: 'round-story', patch: { title: 'Where did you meet the sea?' } },
			fresh,
		);
		expect(matchingPreset(typed, presets)).toBeNull();
		const moved = planEditorReduce(
			stagePlanPreset('wizcol'),
			{ kind: 'move', itemId: 'round-story', direction: 1 },
			fresh,
		);
		expect(matchingPreset(moved, presets)).toBeNull();
	});
});
