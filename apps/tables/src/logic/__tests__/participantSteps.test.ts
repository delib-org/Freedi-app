import { describe, expect, it } from 'vitest';
import type { TableAssignmentRosterEntry } from '@freedi/shared-types';
import { choiceOutcome, matesAtChosenTable, matesOfRunTable, seatPoints } from '../myTable';
import {
	answerFromRecord,
	nearestStop,
	savedPosition,
	stopLabel,
	POSITION_DECLINED,
} from '../positionStops';
import { nextStep, stepNumber, stepsOf } from '../steps';

const QUESTION = { label: 'Q', poleA: 'Keep', poleB: 'Change' };
const SETTINGS = { tableSize: 7, balanceTolerance: 0.3 };
const WITH_QUESTION = { ...SETTINGS, positionQuestion: QUESTION };

describe('positionStops', () => {
	it.each([0, 25, 50, 75, 100])('keeps the stop value %i', (value) => {
		expect(nearestStop(value)).toBe(value);
	});

	it('shows an older slider answer at its nearest stop', () => {
		expect(nearestStop(37)).toBe(25);
		expect(nearestStop(38)).toBe(50);
		expect(nearestStop(97)).toBe(100);
	});

	it('never turns "prefer not to answer" into a value, least of all 50', () => {
		expect(savedPosition(POSITION_DECLINED)).toBeUndefined();
		expect(savedPosition(null)).toBeUndefined();
		expect(savedPosition(0)).toBe(0);
		expect(savedPosition(50)).toBe(50);
	});

	it('reads a saved record: a value, declined after answering, nothing before', () => {
		expect(answerFromRecord({ preferences: ['a'], position: 37 })).toBe(25);
		expect(answerFromRecord({ preferences: ['a'] })).toBe(POSITION_DECLINED);
		expect(answerFromRecord({ preferences: [] })).toBeNull();
	});

	it('words the stops from the poles and the templates', () => {
		const translate = (key: string, params?: Record<string, string>): string =>
			`${key.split('.').pop()}:${params?.pole ?? ''}`;

		expect([0, 1, 2, 3, 4].map((index) => stopLabel(index, QUESTION, translate))).toEqual([
			'Keep',
			'leaning:Keep',
			'middle:',
			'leaning:Change',
			'Change',
		]);
	});
});

describe('steps', () => {
	it('counts three with a position question, two without, two in free mode', () => {
		expect(stepsOf({ mode: 'ranked', settings: WITH_QUESTION })).toHaveLength(3);
		expect(stepsOf({ mode: 'ranked', settings: SETTINGS })).toHaveLength(2);
		expect(stepsOf({ mode: 'direct', settings: WITH_QUESTION })).toHaveLength(2);
	});

	it('numbers a step and finds the next one', () => {
		const session = { mode: 'ranked', settings: WITH_QUESTION } as const;

		expect(stepNumber(session, 'preferences')).toBe(2);
		expect(nextStep(session, 'preferences')).toBe('position');
		expect(nextStep(session, 'position')).toBeNull();
		expect(nextStep({ mode: 'ranked', settings: SETTINGS }, 'preferences')).toBeNull();
	});
});

describe('myTable', () => {
	it('says which choice the table is, or that it is outside them', () => {
		expect(choiceOutcome(['a', 'b'], 'a')).toEqual({ kind: 'choice', rank: 1 });
		expect(choiceOutcome(['a', 'b'], 'b')).toEqual({ kind: 'choice', rank: 2 });
		expect(choiceOutcome(['a', 'b'], 'c')).toEqual({ kind: 'outside' });
		expect(choiceOutcome([], 'c')).toEqual({ kind: 'none' });
	});

	const roster = [
		{ uid: 'u1', fullName: 'Me', chosenTableIndex: 1 },
		{ uid: 'u2', fullName: 'Omar', chosenTableIndex: 1 },
		{ uid: 'u3', fullName: 'Ruth', chosenTableIndex: 0 },
	] as TableAssignmentRosterEntry[];

	it('lists the others at a published table, without me and without unknown names', () => {
		expect(matesOfRunTable(['u1', 'u2', 'u9'], 'u1', roster)).toEqual(['Omar']);
	});

	it('lists the others who chose my table', () => {
		expect(matesAtChosenTable(1, 'u1', roster)).toEqual(['Omar']);
	});

	it('spaces the seats evenly with mine on top', () => {
		const seats = seatPoints(7, 132, 106);

		expect(seats).toHaveLength(7);
		expect(seats[0]).toEqual({ x: 132, y: 26 });
		expect(seats[1].x).toBeGreaterThan(132);
	});
});
