import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key, getLang: () => 'en' }));
vi.mock('../consoleActions', () => ({ addNoDevice: vi.fn(), tableAction: vi.fn() }));
vi.mock('../consoleState', () => ({
	consoleState: { held: false, drag: { mode: 'idle' } },
	isBusy: () => false,
}));
vi.mock('../actFor/actForState', () => ({ openActFor: vi.fn() }));
vi.mock('@/lib/store', () => ({ getMainStatement: () => null, getSubQuestions: () => [] }));

import { TableCard } from '../TableCard';
import { draw } from '../../__tests__/vnodeText';

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a'],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: 'a',
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: ['q1'],
		updatedAt: 0,
		...overrides,
	} as ClassTable;
}

function card(tbl: ClassTable, questionText?: string) {
	return draw(
		m(TableCard, {
			table: tbl,
			students: new Map(),
			plenum: false,
			tableTalk: true,
			questionText,
			mainId: 'm',
			tableNumbers: [1],
		}),
	);
}

describe('TableCard at Table talk: the question this table is on', () => {
	it('shows the question under its label once the table has picked one', () => {
		const drawn = card(table({ questionId: 'q1' }), 'What is fair?');
		expect(drawn.classes).toContain('table-card__question');
		expect(drawn.text.join(' ')).toContain('console.table_question');
		expect(drawn.text.join(' ')).toContain('What is fair?');
	});

	it('shows no question line for a table that has not picked', () => {
		const drawn = card(table({ step: 'pick', questionId: undefined }), undefined);
		expect(drawn.classes).not.toContain('table-card__question');
	});
});
