import { describe, expect, it } from 'vitest';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';
import { jumpConsequences, moveClassRows } from '../flows/moveClass';

const item = (itemId: string, stage: AgoraStage): AgoraStagePlanItem =>
	({ itemId, stage }) as AgoraStagePlanItem;

const plan = [
	item('lobby', AgoraStage.lobby),
	item('story', AgoraStage.question),
	item('needs', AgoraStage.question),
	item('delib', AgoraStage.deliberation),
	item('vote', AgoraStage.voting),
	item('results', AgoraStage.results),
	item('ended', AgoraStage.ended),
];

const kinds = (rows: ReturnType<typeof moveClassRows>): string[] =>
	rows.map((row) => `${row.kind}:${row.itemId}`);

describe('moveClassRows', () => {
	it('gathers at opened stations and opens the ones ahead, in lesson order', () => {
		const rows = moveClassRows({ plan, currentIndex: 2, viewingIndex: 2, allowForward: true });
		expect(kinds(rows)).toEqual([
			'gather:story',
			'gather:needs',
			'next:delib',
			'jump:vote',
			'jump:results',
		]);
		expect(rows.find((row) => row.itemId === 'needs')?.current).toBe(true);
	});

	it('never lists the waiting room or the end marker', () => {
		const rows = moveClassRows({ plan, currentIndex: 0, viewingIndex: 0, allowForward: true });
		expect(rows.map((row) => row.itemId)).not.toContain('lobby');
		expect(rows.map((row) => row.itemId)).not.toContain('ended');
	});

	it('puts "walk me to the class" first when the teacher is reading elsewhere', () => {
		const rows = moveClassRows({ plan, currentIndex: 2, viewingIndex: 1, allowForward: true });
		expect(rows[0]).toMatchObject({ kind: 'walk-me', itemId: 'needs', index: 2 });
		expect(
			moveClassRows({ plan, currentIndex: 2, viewingIndex: 2, allowForward: true })[0].kind,
		).toBe('gather');
	});

	it('carries the class progress onto the current row only', () => {
		const rows = moveClassRows({
			plan,
			currentIndex: 2,
			viewingIndex: 2,
			currentProgress: { done: 4, total: 9 },
			allowForward: true,
		});
		expect(rows.find((row) => row.itemId === 'needs')).toMatchObject({ done: 4, total: 9 });
		expect(rows.find((row) => row.itemId === 'story')?.done).toBeUndefined();
	});

	it('only gathers when forward moves are off', () => {
		const rows = moveClassRows({ plan, currentIndex: 2, viewingIndex: 2, allowForward: false });
		expect(kinds(rows)).toEqual(['gather:story', 'gather:needs']);
	});
});

describe('jumpConsequences', () => {
	it('closes the question being left and counts who had not finished', () => {
		expect(jumpConsequences(plan, 2, 3, { done: 4, total: 9 })).toEqual({
			closes: { itemId: 'needs', unfinished: 5 },
			skipped: [],
			ends: false,
		});
	});

	it('names every station skipped over', () => {
		expect(jumpConsequences(plan, 1, 4, { done: 9, total: 9 })).toEqual({
			closes: { itemId: 'story', unfinished: 0 },
			skipped: ['needs', 'delib'],
			ends: false,
		});
	});

	it('closes nothing when leaving a station that is not a question, and says when the lesson ends', () => {
		expect(jumpConsequences(plan, 3, 5)).toEqual({ closes: null, skipped: ['vote'], ends: true });
	});
});
