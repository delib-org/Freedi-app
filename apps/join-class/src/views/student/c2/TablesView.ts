import m from 'mithril';
import { SIDE_MAX, SIDE_MIN } from '@freedi/shared-types';
import type { Camp } from '@freedi/shared-types';
import type { SideNames } from '@/lib/classroom/classSettings';
import '@/styles/student-c2.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { classState } from '@/lib/classroom/classState';
import { getUserState } from '@/lib/user';
import { sideNamesOf } from '@/lib/classroom/classSettings';
import { t } from '@/lib/i18n';
import { watchRoster } from '../c2/rosterWatch';
import type { RosterWatch } from '../c2/rosterWatch';
import { SIDE_CENTER, sideWordKey, tableChips, tableNumberOf } from '../c2/c2Helpers';
import type { TableChip } from '../c2/c2Helpers';
import type { StepAttrs } from '../steps/stepSlot';

/**
 * Step 3, My table (UX §2.5): the table number, big, and who sits there with
 * the shape of their side. Until the teacher places the student there is only
 * "no table yet, wait for the teacher". No button.
 */

interface TablesState {
	roster?: RosterWatch;
}

const CAMP_REPRESENTATIVE: Record<Camp, number> = { a: SIDE_MIN, center: SIDE_CENTER, b: SIDE_MAX };

/** Spoken side of a camp: "close to Jonathan" / "in the middle" / "close to Noa". */
function campWord(camp: Camp, names: SideNames): string {
	const key = sideWordKey(CAMP_REPRESENTATIVE[camp]);

	return t(key, { name: camp === 'b' ? names.b : names.a });
}

function chip(c: TableChip): m.Vnode {
	return m(
		`li.table-chip.table-chip--${c.camp ?? 'none'}`,
		{ class: c.isMe ? 'table-chip--me' : '', 'aria-label': c.label },
		[
			m('span.table-chip__mark', { 'aria-hidden': 'true' }, c.mark),
			m('span.table-chip__name', c.isMe ? `${c.name} ${t('table.you')}` : c.name),
		],
	);
}

export const TablesView: m.Component<StepAttrs> = {
	oninit(vnode) {
		(vnode.state as unknown as TablesState).roster = watchRoster(vnode.attrs.main.statementId);
	},

	onremove(vnode) {
		(vnode.state as unknown as TablesState).roster?.stop();
	},

	view(vnode) {
		const state = vnode.state as unknown as TablesState;
		const tableId = classState.mySubscription?.tableId;
		const header = t('table.header');
		if (!tableId) {
			return m(StudentFrame, { headerLine: header }, [
				m('p.table-step__empty', { role: 'status' }, t('table.not_placed')),
			]);
		}
		const n = classState.table?.n ?? tableNumberOf(tableId);
		const names = sideNamesOf(vnode.attrs.main);
		const chips = tableChips(classState.table, state.roster?.subs ?? [], {
			myUid: getUserState().user?.uid,
			labelOf: (name, camp) => (camp ? `${name}, ${campWord(camp, names)}` : name),
			fallbackName: t('table.unnamed'),
		});

		return m(StudentFrame, { headerLine: header, instruction: t('table.go_sit') }, [
			m('.table-step', [
				m('p.table-step__number', { 'aria-live': 'polite' }, t('table.number', { n: n ?? '' })),
				chips.length > 0
					? m('section.table-step__card', { 'aria-labelledby': 'table-members-title' }, [
							m('h2.table-step__members-title#table-members-title', t('table.members')),
							m('ul.table-step__chips', chips.map(chip)),
						])
					: null,
			]),
		]);
	},
};
