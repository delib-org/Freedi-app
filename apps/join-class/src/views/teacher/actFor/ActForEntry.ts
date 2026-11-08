import m from 'mithril';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { actForStudents, firstNotDone, isStudentDone } from '@/lib/classroom/actFor';
import { actForMode, openActForFirst, slotOf } from './actForState';
import { consoleState } from '../consoleState';

/**
 * "בלי מכשיר (2/5)" in the switch band: how many students without a device are done
 * at this step, live, and the way into the sheet, at the first one not done. It
 * stays pressable while the lesson is held: looking stays possible.
 */

export interface ActForEntryAttrs {
	tables: readonly ClassTable[];
	proposals: readonly Statement[];
}

export const ActForEntry: m.Component<ActForEntryAttrs> = {
	view({ attrs }) {
		const mainId = consoleState.mainId;
		const students = actForStudents(attrs.tables);
		const isDone = (id: string): boolean =>
			isStudentDone(actForMode(), id, attrs.proposals, slotOf(mainId, id).votedId);
		const done = students.filter((student) => isDone(student.id)).length;

		return m(
			'button.btn.btn--secondary.switch-band__action',
			{
				type: 'button',
				'data-testid': 'console-act-for',
				onclick: () => openActForFirst(firstNotDone(students, isDone)),
			},
			`${t('console.no_device')} (${done}/${students.length})`,
		);
	},
};
