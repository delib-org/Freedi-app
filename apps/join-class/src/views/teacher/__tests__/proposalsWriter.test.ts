import { beforeEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';

vi.mock('../ConfirmDialog', () => ({ askConfirm: vi.fn() }));
vi.mock('../consoleActions', () => ({
	moveStudent: vi.fn(),
	tableAction: vi.fn(),
	addNoDevice: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({}));
vi.mock('../dragController', () => ({
	dropAttrs: vi.fn(() => ({})),
	pressChip: vi.fn(),
	keyChip: vi.fn(),
	blurChip: vi.fn(),
	targetName: vi.fn(() => ''),
}));

import { proposalsWriterOf } from '@/lib/classroom/proposalsWriter';
import { ProposalsWriteRow } from '../ProposalsWriteRow';
import { resetConsoleState } from '../consoleState';
import { penButton, turnButtons } from '../tableSheetTurn';

/** Trello 6KEXvzXK: in Proposals write the teacher sees who holds the pen and how many sent, and can free a stuck pen. */

const NOW = 1_800_000_000_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c', 'd'],
		noDeviceMembers: [],
		step: 'write',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

function rowTree(t: ClassTable, name = 'Dana'): string {
	const writer = proposalsWriterOf(t);
	if (!writer) return '';

	return JSON.stringify(
		(ProposalsWriteRow.view as unknown as (v: m.Vnode) => m.Vnode)({
			attrs: { writer, name },
		} as unknown as m.Vnode),
	);
}

describe('proposalsWriterOf', () => {
	it('is null outside the write step', () => {
		expect(proposalsWriterOf(table({ step: 'talk' }))).toBeNull();
		expect(proposalsWriterOf(table({ step: 'rate' }))).toBeNull();
	});

	it('names the pen holder and counts who sent or passed among the tablemates with a phone', () => {
		expect(proposalsWriterOf(table({ writerUid: 'a', writtenUids: ['b', 'c'] }))).toEqual({
			uid: 'a',
			sent: 2,
			total: 4,
		});
	});

	it('has no pen holder when the pen is free, and ignores a leftover uid that is not seated', () => {
		expect(proposalsWriterOf(table({ writtenUids: ['gone', 'b'] }))).toEqual({
			uid: null,
			sent: 1,
			total: 4,
		});
	});
});

describe('the write row of a table card', () => {
	beforeEach(() => {
		m.redraw = vi.fn() as unknown as typeof m.redraw;
		resetConsoleState('x');
	});

	it('says who writes (the counts ride in the sentence)', () => {
		const markup = rowTree(table({ writerUid: 'a', writtenUids: ['b', 'c'] }));

		expect(markup).toContain('speaker-row--speaking');
		expect(markup).toContain('console.writing_now');
	});

	it('says nobody writes when the pen is free, with a clear state of its own', () => {
		const markup = rowTree(table({ writtenUids: ['b'] }));

		expect(markup).toContain('speaker-row--nobody');
		expect(markup).toContain('console.writing_nobody');
		expect(markup).not.toContain('speaker-row--speaking');
	});
});

describe('freeing a stuck pen from the table sheet', () => {
	beforeEach(() => {
		m.redraw = vi.fn() as unknown as typeof m.redraw;
		resetConsoleState('x');
	});

	it('only the pen holder gets "pass for {name}"', () => {
		const held = table({ writerUid: 'a' });

		expect(JSON.stringify(penButton(held, 'a', 'Dana'))).toContain('turn.pass_for');
		expect(JSON.stringify(penButton(held, 'a', 'Dana'))).toContain('sheet-pass-pen');
		expect(penButton(held, 'b', 'Noa')).toBeNull();
	});

	it('nobody gets it when the pen is free or the table is not writing', () => {
		expect(penButton(table(), 'a', 'Dana')).toBeNull();
		expect(penButton(table({ step: 'talk', writerUid: 'a' }), 'a', 'Dana')).toBeNull();
	});

	it("the sheet shows it at Proposals and keeps Table talk's buttons out of it", () => {
		const held = table({ writerUid: 'a' });

		expect(turnButtons(held, 'a', 'Dana', 'proposals', NOW)).not.toBeNull();
		expect(turnButtons(held, 'a', 'Dana', 'plenum', NOW)).toBeNull();
	});
});
