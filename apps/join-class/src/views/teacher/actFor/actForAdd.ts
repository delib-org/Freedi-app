import m from 'mithril';
import { MAX_NO_DEVICE_PER_TABLE } from '@freedi/shared-types';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { classAddNoDevice } from '@/lib/classroom/api';
import { actForView } from './actForState';

/**
 * "+ בלי מכשיר" with a table choice. The table cards stop offering it once the class
 * is past the tables' work, so the sheet does. A new student is not opened by itself:
 * moving to a student is always the teacher's tap.
 */

function isFull(table: ClassTable): boolean {
	return (table.noDeviceMembers ?? []).length >= MAX_NO_DEVICE_PER_TABLE;
}

function chosenTable(tables: readonly ClassTable[]): ClassTable | undefined {
	const chosen = tables.find((table) => table.n === actForView.addTable && !isFull(table));

	return chosen ?? tables.find((table) => !isFull(table));
}

async function add(mainId: string, n: number, name: string): Promise<void> {
	if (actForView.adding) return;
	actForView.adding = true;
	actForView.addFailed = false;
	m.redraw();
	try {
		await classAddNoDevice({ mainId, n, name });
		actForView.addName = '';
		actForView.addOpen = false;
	} catch (error) {
		actForView.addFailed = true;
		console.error(
			'[ActFor] add failed',
			{ operation: 'actFor.addNoDevice', statementId: mainId, metadata: { n } },
			error,
		);
	} finally {
		actForView.adding = false;
		m.redraw();
	}
}

export function actForAddForm(
	mainId: string,
	tables: readonly ClassTable[],
	held: boolean,
): m.Children {
	const ordered = [...tables].sort((x, y) => x.n - y.n);
	const chosen = chosenTable(ordered);
	const name = actForView.addName.trim();
	const canAdd = !held && !actForView.adding && !!chosen && name !== '';
	const run = (): void => {
		if (chosen) void add(mainId, chosen.n, name);
	};

	return m(
		'form.act-for__add',
		{
			'data-testid': 'act-for-add',
			onsubmit: (e: Event) => {
				e.preventDefault();
				if (canAdd) run();
			},
		},
		[
			m('label.act-for__label', { for: 'act-for-add-name' }, t('console.no_device_name')),
			m('input.act-for__input#act-for-add-name', {
				type: 'text',
				value: actForView.addName,
				disabled: held,
				'data-testid': 'act-for-add-name',
				oninput: (e: Event) => {
					actForView.addName = (e.target as HTMLInputElement).value;
				},
			}),
			m('label.act-for__label', { for: 'act-for-add-table' }, t('console.act_for_table')),
			m(
				'select.act-for__select#act-for-add-table',
				{
					disabled: held,
					'data-testid': 'act-for-add-table',
					onchange: (e: Event) => {
						actForView.addTable = Number((e.target as HTMLSelectElement).value);
					},
				},
				ordered.map((table) =>
					m(
						'option',
						{
							key: table.n,
							value: String(table.n),
							disabled: isFull(table),
							selected: chosen?.n === table.n,
						},
						t('console.table_n', { n: table.n }),
					),
				),
			),
			m(
				'button.btn.btn--secondary.act-for__add-go',
				{ type: 'submit', disabled: !canAdd, 'data-testid': 'act-for-add-go' },
				t('console.add'),
			),
			actForView.addFailed
				? m('p.act-for__error', { role: 'alert' }, [
						m('span', t('console.failed', { label: t('console.add_no_device') })),
						m(
							'button.btn.btn--secondary.btn--small',
							{ type: 'button', onclick: run },
							t('console.retry'),
						),
					])
				: null,
		],
	);
}
