import { describe, expect, it } from 'vitest';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';
import {
	arrivalPlace,
	arrivalStatus,
	callTargetIndex,
	callTargetPlace,
	nextCallStamp,
	resolveSummons,
} from '../flows/summons';

const item = (itemId: string, stage: AgoraStage): AgoraStagePlanItem =>
	({ itemId, stage }) as AgoraStagePlanItem;

const plan = [
	item('lobby', AgoraStage.lobby),
	item('story', AgoraStage.question),
	item('needs', AgoraStage.question),
	item('delib', AgoraStage.deliberation),
	item('vote', AgoraStage.voting),
	item('results', AgoraStage.results),
];

describe('resolveSummons', () => {
	const call = { place: 'booth:story', at: 1000 };

	it('is nothing without a call', () => {
		expect(resolveSummons({ call: undefined, currentOpenedAt: 500, handledAt: undefined })).toBe(
			null,
		);
	});

	it('walks a call this device never answered, however old it is', () => {
		// The classroom case: a phone that was locked for ten minutes
		expect(resolveSummons({ call, currentOpenedAt: 500, handledAt: undefined })).toEqual({
			kind: 'walk',
			place: 'booth:story',
			at: 1000,
		});
		expect(resolveSummons({ call, currentOpenedAt: undefined, handledAt: undefined })).toEqual({
			kind: 'walk',
			place: 'booth:story',
			at: 1000,
		});
	});

	it('walks once: a stamp already handled is nothing, a newer stamp is a new walk', () => {
		expect(resolveSummons({ call, currentOpenedAt: 500, handledAt: 1000 })).toBe(null);
		expect(resolveSummons({ call, currentOpenedAt: 500, handledAt: 1200 })).toBe(null);
		expect(
			resolveSummons({ call: { ...call, at: 1300 }, currentOpenedAt: 500, handledAt: 1000 }),
		).toMatchObject({ kind: 'walk', at: 1300 });
	});

	it('retires a call the teacher superseded by opening a new station', () => {
		expect(resolveSummons({ call, currentOpenedAt: 1500, handledAt: undefined })).toEqual({
			kind: 'retire',
			at: 1000,
		});
		// …and says nothing more once retired
		expect(resolveSummons({ call, currentOpenedAt: 1500, handledAt: 1000 })).toBe(null);
	});

	it('a call made after the station opened stands', () => {
		expect(
			resolveSummons({ call: { ...call, at: 1600 }, currentOpenedAt: 1500, handledAt: undefined }),
		).toMatchObject({ kind: 'walk' });
	});
});

describe('nextCallStamp', () => {
	it("is the teacher's clock, floored above the station's server time", () => {
		expect(nextCallStamp(5000, 1000)).toBe(5000);
		expect(nextCallStamp(900, 1000)).toBe(1001);
		expect(nextCallStamp(900, undefined)).toBe(900);
	});
});

describe('callTargetPlace / callTargetIndex', () => {
	it("resolves 'current' to the room's own place and finds its item", () => {
		expect(callTargetPlace('current', plan, 3)).toBe('booth:delib');
		expect(callTargetIndex('current', plan, 3)).toBe(3);
	});

	it('passes a named place through and finds an opened booth', () => {
		expect(callTargetPlace('booth:story', plan, 3)).toBe('booth:story');
		expect(callTargetIndex('booth:story', plan, 3)).toBe(1);
		expect(callTargetIndex('council', plan, 3)).toBe(-1);
		expect(callTargetIndex('council', plan, 4)).toBe(4);
	});

	it('never lands on a station the room has not reached', () => {
		expect(callTargetIndex('booth:needs', plan, 1)).toBe(-1);
	});
});

describe('arrivalStatus', () => {
	const students = [
		{ anonName: 'Fox', whereabouts: { place: 'booth:story', at: 2000, callAt: 1000 } },
		{ anonName: 'Owl', whereabouts: { place: 'booth:delib', at: 900 } },
		{ anonName: 'Bee' },
	];

	it('counts who stands at the place and names the rest', () => {
		expect(arrivalStatus(students, 'booth:story')).toEqual({
			place: 'booth:story',
			arrived: 1,
			total: 3,
			waiting: ['Owl', 'Bee'],
		});
	});

	it('is complete when everyone is there', () => {
		const all = students.map((s) => ({ ...s, whereabouts: { place: 'council', at: 1 } }));
		expect(arrivalStatus(all, 'council')).toMatchObject({ arrived: 3, total: 3, waiting: [] });
	});
});

describe('arrivalPlace', () => {
	it("reads a standing call's target, and the room's station once the call is over", () => {
		expect(arrivalPlace({ place: 'booth:story', at: 1000 }, 500, plan, 3)).toEqual({
			place: 'booth:story',
			fromCall: true,
		});
		expect(arrivalPlace({ place: 'current', at: 1000 }, 500, plan, 3)).toEqual({
			place: 'booth:delib',
			fromCall: true,
		});
		expect(arrivalPlace({ place: 'booth:story', at: 1000 }, 1500, plan, 3)).toEqual({
			place: 'booth:delib',
			fromCall: false,
		});
		expect(arrivalPlace(undefined, undefined, plan, 1)).toEqual({
			place: 'booth:story',
			fromCall: false,
		});
	});
});
