import { describe, expect, it } from 'vitest';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';
import { callArrival, calledItemIndex } from '../flows/villageRoute';

const item = (itemId: string, stage: AgoraStage): AgoraStagePlanItem =>
	({ itemId, stage }) as AgoraStagePlanItem;

const plan = [
	item('lobby', AgoraStage.lobby),
	item('framing', AgoraStage.framing),
	item('story', AgoraStage.question),
	item('needs', AgoraStage.needs),
	item('delib', AgoraStage.deliberation),
	item('vote', AgoraStage.voting),
	item('results', AgoraStage.results),
];

describe('callArrival', () => {
	it('stands at a called booth, opens the council, only looks elsewhere', () => {
		expect(callArrival('booth:story')).toBe('station');
		expect(callArrival('council')).toBe('council');
		expect(callArrival('library')).toBe('place');
		expect(callArrival('challenge')).toBe('place');
	});
});

describe('calledItemIndex', () => {
	it("finds a booth's own question", () => {
		expect(calledItemIndex('booth:story', plan, 4)).toBe(2);
	});

	it('finds the latest opened item living in a fixed building', () => {
		expect(calledItemIndex('library', plan, 4)).toBe(1);
		expect(calledItemIndex('challenge', plan, 4)).toBe(3);
		expect(calledItemIndex('council', plan, 6)).toBe(6);
	});

	it('never points ahead of the room', () => {
		expect(calledItemIndex('booth:delib', plan, 2)).toBe(-1);
		expect(calledItemIndex('council', plan, 4)).toBe(-1);
	});
});
