import { describe, expect, it } from 'vitest';
import type { ClassArrival, ClassArriveByNameResponse } from '@freedi/shared-types';
import {
	arrivedName,
	backToAsk,
	choiceLabelKey,
	initialGateState,
	isDeferredPick,
	requestOf,
	stepOfResponse,
} from '../arrival';

const ARRIVAL: ClassArrival = {
	mainId: 'm1',
	fullName: 'Dana Levi',
	tableN: 3,
	movedFromAnotherDevice: false,
};

describe('stepOfResponse (every outcome of the name gate)', () => {
	it('seated: the gate is done', () => {
		expect(stepOfResponse({ outcome: 'seated', ...ARRIVAL })).toEqual({ kind: 'done' });
	});

	it('joined (a walk-in): the gate is done', () => {
		expect(stepOfResponse({ outcome: 'joined', ...ARRIVAL, tableN: null })).toEqual({
			kind: 'done',
		});
	});

	it('nameTaken: asks "is it you, on another device?"', () => {
		expect(stepOfResponse({ outcome: 'nameTaken' })).toEqual({ kind: 'taken' });
	});

	it('nameTwice: lets the student pick by table, with the choices the server sent', () => {
		const choices = [
			{ seatId: 's1', tableN: 2, topic: 'Transport' },
			{ seatId: 's2', tableN: 5 },
		];
		expect(stepOfResponse({ outcome: 'nameTwice', choices })).toEqual({ kind: 'twice', choices });
	});

	it('nameTwiceLater: the student is in; the gate is done and the pick comes later', () => {
		const response: ClassArriveByNameResponse = { outcome: 'nameTwiceLater' };
		expect(stepOfResponse(response)).toEqual({ kind: 'done' });
		expect(isDeferredPick(response)).toBe(true);
	});

	it('notFound: offers to fix the name or to join without registering', () => {
		expect(stepOfResponse({ outcome: 'notFound' })).toEqual({ kind: 'notFound' });
	});

	it('remembers a deferred pick only for nameTwiceLater', () => {
		expect(isDeferredPick({ outcome: 'seated', ...ARRIVAL })).toBe(false);
		expect(isDeferredPick({ outcome: 'notFound' })).toBe(false);
	});
});

describe('the gate around the outcomes', () => {
	it('keeps the registration name the server gives, only when the student is in', () => {
		expect(arrivedName({ outcome: 'seated', ...ARRIVAL })).toBe('Dana Levi');
		expect(arrivedName({ outcome: 'joined', ...ARRIVAL })).toBe('Dana Levi');
		expect(arrivedName({ outcome: 'nameTaken' })).toBeNull();
		expect(arrivedName({ outcome: 'nameTwiceLater' })).toBeNull();
	});

	it('sends the first try with no answer, and each button with its own', () => {
		expect(requestOf('m1', '  Dana Levi ')).toEqual({ mainId: 'm1', fullName: 'Dana Levi' });
		expect(requestOf('m1', 'Dana', { kind: 'itsMe' })).toEqual({
			mainId: 'm1',
			fullName: 'Dana',
			answer: { kind: 'itsMe' },
		});
		expect(requestOf('m1', 'Dana', { kind: 'pick', seatId: 's2' }).answer).toEqual({
			kind: 'pick',
			seatId: 's2',
		});
	});

	it('goes back to the field with the typed name kept ("לתקן את השם")', () => {
		const typed = {
			...initialGateState('Dana Lvi'),
			step: { kind: 'notFound' as const },
			failed: true,
		};
		expect(backToAsk(typed)).toEqual({
			name: 'Dana Lvi',
			step: { kind: 'ask' },
			saving: false,
			failed: false,
		});
	});

	it('labels a table choice with its topic only when it has one', () => {
		expect(choiceLabelKey({ seatId: 's', tableN: 1, topic: 'A' })).toBe(
			'opening.name_twice.choice',
		);
		expect(choiceLabelKey({ seatId: 's', tableN: 1 })).toBe('opening.name_twice.choice_plain');
	});
});
