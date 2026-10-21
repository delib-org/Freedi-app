import { describe, it, expect } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import {
	MAX_QUESTION_LENGTH,
	applyIdOrder,
	classRoleOf,
	hintOf,
	moveId,
	nextOrder,
	normalizeQuestionText,
	orderConverged,
	readClassCode,
	sameIds,
	splitPlan,
	studentJoinUrl,
} from '../planHelpers';

function q(
	id: string,
	extra: { order?: number; createdAt?: number; settings?: Record<string, unknown> } = {},
): Statement {
	return {
		statementId: id,
		statement: `text ${id}`,
		order: extra.order,
		createdAt: extra.createdAt ?? 0,
		statementSettings: extra.settings,
	} as unknown as Statement;
}

describe('classRoleOf / hintOf', () => {
	it('treats a missing role as guiding', () => {
		expect(classRoleOf(q('a'))).toBe('guiding');
		expect(classRoleOf(q('a', { settings: { classRole: 'nonsense' } }))).toBe('guiding');
	});
	it('reads the challenge role', () => {
		expect(classRoleOf(q('a', { settings: { classRole: 'challenge' } }))).toBe('challenge');
	});
	it('reads the hint, defaulting to empty', () => {
		expect(hintOf(q('a'))).toBe('');
		expect(hintOf(q('a', { settings: { hint: 'look for needs' } }))).toBe('look for needs');
		expect(hintOf(q('a', { settings: { hint: 5 } }))).toBe('');
	});
});

describe('readClassCode', () => {
	it('returns undefined when the field does not exist', () => {
		expect(readClassCode(undefined)).toBeUndefined();
		expect(readClassCode(q('m'))).toBeUndefined();
		expect(readClassCode(q('m', { settings: { classCode: '  ' } }))).toBeUndefined();
	});
	it('returns the code as a string', () => {
		expect(readClassCode(q('m', { settings: { classCode: '123456' } }))).toBe('123456');
		expect(readClassCode(q('m', { settings: { classCode: 654321 } }))).toBe('654321');
	});
});

describe('splitPlan', () => {
	it('puts the challenge on top and orders the rest', () => {
		const list = [
			q('c', { order: 2 }),
			q('ch', { settings: { classRole: 'challenge' }, createdAt: 5 }),
			q('a', { order: 0 }),
			q('b', { order: 1 }),
		];
		const { challenge, guiding } = splitPlan(list);
		expect(challenge?.statementId).toBe('ch');
		expect(guiding.map((s) => s.statementId)).toEqual(['a', 'b', 'c']);
	});
	it('falls back to creation time when there is no order', () => {
		const { guiding } = splitPlan([q('b', { createdAt: 2 }), q('a', { createdAt: 1 })]);
		expect(guiding.map((s) => s.statementId)).toEqual(['a', 'b']);
	});
	it('has no challenge when none is flagged', () => {
		expect(splitPlan([q('a')]).challenge).toBeUndefined();
	});
	it('keeps a second challenge as a guiding card', () => {
		const list = [
			q('x', { settings: { classRole: 'challenge' }, createdAt: 1 }),
			q('y', { settings: { classRole: 'challenge' }, createdAt: 2 }),
		];
		const { challenge, guiding } = splitPlan(list);
		expect(challenge?.statementId).toBe('x');
		expect(guiding.map((s) => s.statementId)).toEqual(['y']);
	});
	it('honours role overrides for just-created questions', () => {
		const { challenge, guiding } = splitPlan([q('n')], new Map([['n', 'challenge' as const]]));
		expect(challenge?.statementId).toBe('n');
		expect(guiding).toEqual([]);
	});
});

describe('normalizeQuestionText', () => {
	it('trims and limits to 140 chars', () => {
		expect(normalizeQuestionText('  hi  ')).toBe('hi');
		expect(normalizeQuestionText('x'.repeat(300))).toHaveLength(MAX_QUESTION_LENGTH);
		expect(normalizeQuestionText('   ')).toBe('');
	});
});

describe('moveId', () => {
	it('moves down and up', () => {
		expect(moveId(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
		expect(moveId(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
	});
	it('does not move past the ends or for unknown ids', () => {
		const ids = ['a', 'b'];
		expect(moveId(ids, 'a', -1)).toBe(ids);
		expect(moveId(ids, 'b', 1)).toBe(ids);
		expect(moveId(ids, 'zz', 1)).toBe(ids);
	});
});

describe('nextOrder', () => {
	it('is 0 for an empty list and after the highest otherwise', () => {
		expect(nextOrder([])).toBe(0);
		expect(nextOrder([q('a', { order: 0 }), q('b', { order: 4 })])).toBe(5);
		expect(nextOrder([q('a'), q('b')])).toBe(2);
	});
});

describe('orderConverged', () => {
	it('is true when shared ids are in the same order', () => {
		expect(orderConverged(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
		expect(orderConverged(['a', 'x', 'b'], ['a', 'b'])).toBe(true);
	});
	it('is false while the server still has the old order', () => {
		expect(orderConverged(['a', 'b'], ['b', 'a'])).toBe(false);
	});
});

describe('applyIdOrder / sameIds / studentJoinUrl', () => {
	it('applies an optimistic order and appends unknown items', () => {
		const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		expect(applyIdOrder(items, ['c', 'a'], (i) => i.id).map((i) => i.id)).toEqual(['c', 'a', 'b']);
		expect(applyIdOrder(items, null, (i) => i.id)).toBe(items);
	});
	it('compares id lists', () => {
		expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
		expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false);
	});
	it('builds the student link', () => {
		expect(studentJoinUrl('https://x.test', 'abc')).toBe('https://x.test/m/abc');
	});
});
