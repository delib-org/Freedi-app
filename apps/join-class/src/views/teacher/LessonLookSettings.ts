import m from 'mithril';
import { lessonLookOf } from '@freedi/shared-types';
import type { LessonLook } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getMainStatement } from '@/lib/store';
import { setLessonLook } from './consoleActions';
import { isBusy } from './consoleState';

/**
 * "עיצוב השיעור" in the console's settings popover: a two-option radio group,
 * game (the default) or solid. Saved on the main statement; every screen of
 * the lesson follows it on the next snapshot.
 */

const LOOKS: readonly LessonLook[] = ['game', 'solid'];
const GROUP_ID = 'lesson-look';

function choice(look: LessonLook, current: LessonLook, disabled: boolean): m.Vnode {
	const id = `${GROUP_ID}-${look}`;

	return m('.table-settings__choice', [
		m('input.table-settings__radio', {
			id,
			type: 'radio',
			name: GROUP_ID,
			value: look,
			checked: current === look,
			disabled,
			'data-testid': id,
			onchange: () => void setLessonLook(look),
		}),
		m('label.table-settings__label', { for: id }, t(`console.look.${look}`)),
	]);
}

export const LessonLookSettings: m.Component = {
	view() {
		const main = getMainStatement();
		const current = lessonLookOf(main);
		const disabled = !main || isBusy('lessonLook');

		return m(
			'fieldset.table-settings',
			{ 'aria-describedby': `${GROUP_ID}-help`, 'data-testid': GROUP_ID },
			[
				m('legend.table-settings__legend', t('console.look.label')),
				m(
					'.table-settings__choices',
					LOOKS.map((look) => choice(look, current, disabled)),
				),
				m(
					'p.table-settings__help.table-settings__help--block',
					{ id: `${GROUP_ID}-help` },
					t('console.look.help'),
				),
			],
		);
	},
};
