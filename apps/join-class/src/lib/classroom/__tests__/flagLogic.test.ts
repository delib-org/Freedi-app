import { describe, expect, it } from 'vitest';
import type { ClassLanguageFlag, ClassTable } from '@freedi/shared-types';
import { flagCountKey, flagRows, flagsLineKey, unseenFlagCount } from '../flagLogic';
import type { RosterStudent } from '../consoleHelpers';

function flag(id: string, uid: string, over: Partial<ClassLanguageFlag> = {}): ClassLanguageFlag {
	return {
		flagId: id,
		mainId: 'main',
		uid,
		kind: 'proposal',
		text: `text ${id}`,
		attempt: 1,
		createdAt: 100,
		expireAt: 1000,
		...over,
	};
}

const students: RosterStudent[] = [
	{ uid: 'dana', name: 'Dana', camp: null, tableId: 'main--2' },
	{ uid: 'noa', name: 'Noa', camp: null, tableId: null },
];
const tables = [{ tableId: 'main--2', n: 2 }] as unknown as ClassTable[];

describe('unseenFlagCount', () => {
	it('counts attempts without seenAt', () => {
		const flags = [flag('a', 'dana'), flag('b', 'dana', { seenAt: 5 }), flag('c', 'noa')];

		expect(unseenFlagCount(flags)).toBe(2);
		expect(unseenFlagCount([])).toBe(0);
	});
});

describe('flagRows', () => {
	it('gives one row per student, with name, table and the attempts so far', () => {
		const flags = [
			flag('a', 'dana', { createdAt: 100, attempt: 1 }),
			flag('b', 'dana', { createdAt: 200, attempt: 2, kind: 'reply', targetId: 'p1' }),
		];
		const rows = flagRows(flags, students, tables);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ uid: 'dana', name: 'Dana', tableN: 2, count: 2 });
		expect(rows[0].last).toMatchObject({ flagId: 'b', kind: 'reply', targetId: 'p1' });
		expect(rows[0].unseen.map((f) => f.flagId)).toEqual(['b', 'a']);
	});

	it('counts past the three kept (the attempt number keeps counting)', () => {
		const flags = [
			flag('c', 'dana', { createdAt: 300, attempt: 5 }),
			flag('d', 'dana', { createdAt: 400, attempt: 6 }),
		];

		expect(flagRows(flags, students, tables)[0].count).toBe(6);
	});

	it('drops a student once every attempt is seen, and keeps the others, newest first', () => {
		const flags = [
			flag('a', 'dana', { seenAt: 1 }),
			flag('b', 'noa', { createdAt: 50 }),
			flag('c', 'ghost', { createdAt: 90 }),
		];
		const rows = flagRows(flags, students, tables);

		expect(rows.map((r) => r.uid)).toEqual(['ghost', 'noa']);
		expect(rows[0].name).toBe('ghos');
		expect(rows[1].tableN).toBeNull();
	});
});

describe('keys', () => {
	it('picks the singular for one', () => {
		expect(flagsLineKey(1)).toBe('console.flags_one');
		expect(flagsLineKey(3)).toBe('console.flags_n');
		expect(flagCountKey(1)).toBe('console.flag_count_one');
		expect(flagCountKey(2)).toBe('console.flag_count');
	});
});
