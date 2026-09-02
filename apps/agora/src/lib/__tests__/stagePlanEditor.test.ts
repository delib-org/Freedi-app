import { describe, expect, it } from 'vitest';
import { AgoraStage, stagePlanPreset, validateStagePlan } from '@freedi/shared-types';
import { addableStages, mintItemId, planEditorReduce } from '../flows/stagePlanEditor';

const fresh = { hasCharacters: false, frozenCount: 0 };
const kinds = (items: { stage: AgoraStage }[]) => items.map((item) => item.stage);

describe('planEditorReduce', () => {
	it('adds before results, and a second question gets its own id', () => {
		let items = stagePlanPreset('quickDecision');
		items = planEditorReduce(items, { kind: 'add', stage: AgoraStage.question }, fresh);

		expect(kinds(items)).toEqual([
			AgoraStage.lobby,
			AgoraStage.question,
			AgoraStage.deliberation,
			AgoraStage.voting,
			AgoraStage.question,
			AgoraStage.results,
		]);
		expect(items[4].itemId).toBe('question-2');
		expect(mintItemId(AgoraStage.question, items)).toBe('question-3');
	});

	it('offers each single-instance stage once, and character stages only with characters', () => {
		const quick = stagePlanPreset('quickDecision');
		expect(addableStages(quick, { hasCharacters: false })).toEqual([AgoraStage.question]);

		const noVote = quick.filter((item) => item.stage !== AgoraStage.voting);
		expect(addableStages(noVote, { hasCharacters: true })).toEqual(
			expect.arrayContaining([AgoraStage.voting, AgoraStage.framing, AgoraStage.question]),
		);
	});

	it('never moves or removes the fixed ends', () => {
		const items = stagePlanPreset('quickDecision');
		expect(planEditorReduce(items, { kind: 'remove', itemId: 'lobby' }, fresh)).toEqual(items);
		expect(
			planEditorReduce(items, { kind: 'move', itemId: 'results', direction: -1 }, fresh),
		).toEqual(items);
		// and nothing can be moved past them
		expect(
			planEditorReduce(items, { kind: 'move', itemId: 'question-1', direction: -1 }, fresh),
		).toEqual(items);
	});

	it('moves a stage within the middle', () => {
		const items = stagePlanPreset('quickDecision');
		const moved = planEditorReduce(
			items,
			{ kind: 'move', itemId: 'question-1', direction: 1 },
			fresh,
		);

		expect(kinds(moved).slice(1, 3)).toEqual([AgoraStage.deliberation, AgoraStage.question]);
	});

	it('leaves the frozen prefix alone', () => {
		const items = stagePlanPreset('quickDecision');
		const running = { hasCharacters: false, frozenCount: 2 }; // lobby + question-1 are history

		expect(planEditorReduce(items, { kind: 'remove', itemId: 'question-1' }, running)).toEqual(
			items,
		);
		expect(
			planEditorReduce(
				items,
				{ kind: 'patch', itemId: 'question-1', patch: { title: 'x' } },
				running,
			),
		).toEqual(items);
		expect(
			planEditorReduce(items, { kind: 'move', itemId: 'deliberation', direction: -1 }, running),
		).toEqual(items);

		const added = planEditorReduce(items, { kind: 'add', stage: AgoraStage.question }, running);
		expect(added.slice(0, 2)).toEqual(items.slice(0, 2));
	});

	it('patches an upcoming item', () => {
		const items = stagePlanPreset('quickDecision');
		const patched = planEditorReduce(
			items,
			{ kind: 'patch', itemId: 'question-1', patch: { title: 'What do I want?' } },
			fresh,
		);

		expect(patched[1].title).toBe('What do I want?');
		expect(validateStagePlan(patched, { hasCharacters: false })).toEqual([]);
	});

	it('a preset replaces the future and keeps history', () => {
		const items = stagePlanPreset('quickDecision');
		const running = { hasCharacters: true, frozenCount: 2 };
		const reset = planEditorReduce(items, { kind: 'preset', preset: 'classic' }, running);

		expect(reset.slice(0, 2)).toEqual(items.slice(0, 2));
		expect(kinds(reset)).not.toContain(AgoraStage.lobby === reset[1].stage ? 'never' : 'x');
		expect(reset[reset.length - 1].stage).toBe(AgoraStage.results);
	});
});
