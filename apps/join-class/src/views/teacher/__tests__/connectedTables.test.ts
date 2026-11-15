import { describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';

vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('../registrationActions', () => ({
	copyResult: { mainId: '', value: null },
	copySeating: vi.fn(),
}));
vi.mock('../consoleState', () => ({
	consoleState: { held: false },
	isBusy: () => false,
}));
vi.mock('../ConfirmDialog', () => ({ askConfirm: vi.fn() }));

import { CopySeating } from '../CopySeating';
import { TableBridgeLines } from '../TableBridgeLines';
import { TableSizeFromRegistration } from '../TableSettingsControls';
import { draw, textOf } from '../../__tests__/vnodeText';
import { tableTiles } from '../projector/projectorLogic';

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: [],
		noDeviceMembers: [],
		...overrides,
	} as ClassTable;
}

describe('TableBridgeLines (a table of a connected lesson)', () => {
	it('shows the topic, the lone-person flag and the names that have not arrived', () => {
		const shown = textOf(
			m(TableBridgeLines, {
				table: table({
					memberUids: ['u1'],
					topic: 'Transport',
					reservedSeats: [
						{ seatId: 's1', name: 'Dana' },
						{ seatId: 's2', name: 'Noa' },
					],
				}),
				connected: true,
			}),
		);
		expect(shown).toContain('Transport');
		expect(shown).toContain('console.table_alone');
		expect(shown).toContain('table.not_arrived');
		expect(shown).toContain('Dana');
		expect(shown).toContain('Noa');
	});

	it('raises no flag with two people present, and none outside a connected lesson', () => {
		const two = table({ memberUids: ['u1', 'u2'], topic: 'A' });
		expect(textOf(m(TableBridgeLines, { table: two, connected: true }))).not.toContain(
			'console.table_alone',
		);
		const one = table({ memberUids: ['u1'], topic: 'A' });
		expect(textOf(m(TableBridgeLines, { table: one, connected: false }))).not.toContain(
			'console.table_alone',
		);
	});

	it('counts people without a phone as present', () => {
		const phoneless = table({
			memberUids: ['u1'],
			noDeviceMembers: [{ id: 'nd1', name: 'Rami' }] as ClassTable['noDeviceMembers'],
		});
		expect(textOf(m(TableBridgeLines, { table: phoneless, connected: true }))).not.toContain(
			'console.table_alone',
		);
	});

	it('draws nothing for a plain table', () => {
		const out = draw(
			m(TableBridgeLines, { table: table({ memberUids: ['a', 'b'] }), connected: true }),
		);
		expect(out.text).toEqual([]);
	});
});

describe('CopySeating (the Tables step of a connected lesson)', () => {
	const props = { mid: 'm', registrationId: 'r1', withoutTable: 0 };

	it('draws nothing for an ordinary lesson (the split button stays)', () => {
		expect(draw(m(CopySeating, { ...props, offer: { kind: 'ordinary' } })).text).toEqual([]);
	});

	it('offers the copy button when the seating is published', () => {
		expect(textOf(m(CopySeating, { ...props, offer: { kind: 'copy' } }))).toContain(
			'console.copy_seating',
		);
	});

	it('offers "update from the registration" after a copy', () => {
		expect(textOf(m(CopySeating, { ...props, offer: { kind: 'again' } }))).toContain(
			'console.copy_seating.again',
		);
	});

	it('says what is missing and links to the registration when not published', () => {
		const shown = textOf(
			m(CopySeating, {
				...props,
				offer: { kind: 'not-ready', reasonKey: 'console.copy_seating.not_ready.ranked' },
			}),
		);
		expect(shown).toContain('console.copy_seating.not_ready.ranked');
		expect(shown).toContain('console.register_ahead.manage');
		expect(shown).not.toContain('console.copy_seating.again');
	});

	it('shows "N without a table" only when someone has none', () => {
		const some = textOf(m(CopySeating, { ...props, withoutTable: 3, offer: { kind: 'copy' } }));
		const none = textOf(m(CopySeating, { ...props, offer: { kind: 'copy' } }));
		expect(some).toContain('console.without_table');
		expect(none).not.toContain('console.without_table');
	});
});

describe('settings of a connected lesson', () => {
	it('shows seats per table read-only, from the registration', () => {
		const shown = draw(m(TableSizeFromRegistration, { size: 12 }));
		expect(shown.text.join(' ')).toContain('console.table_size.from_registration');
	});
});

describe('projector tiles of a connected lesson', () => {
	it('carry the topic and the reserved names, only when the table has them', () => {
		const tiles = tableTiles(
			[
				table({ n: 1, topic: 'Transport', reservedSeats: [{ seatId: 's', name: 'Dana' }] }),
				table({ n: 2 }),
			],
			[],
		);
		expect(tiles[0]).toMatchObject({ n: 1, topic: 'Transport', reserved: ['Dana'] });
		expect(tiles[1]).toEqual({ n: 2, names: [] });
	});
});
