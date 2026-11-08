import m from 'mithril';
import { t } from '@/lib/i18n';
import { getMainStatement } from '@/lib/store';
import { DEFAULT_CLASS_SIZE, storedClassSize } from '@/lib/classroom/classSize';
import { saveClassSizeNow } from './classSizeActions';
import { isBusy } from './consoleState';

/**
 * "כמה תלמידים בכיתה?" row of the console's settings popover. Saving writes the
 * number on the lesson and its questions and rescores what the class already
 * rated, with no extra step. Emptying the field means the default.
 */

/** What the field shows: the lesson's number, or empty for a lesson that never had one. */
function storedText(): string {
	const stored = storedClassSize(getMainStatement());

	return stored === undefined ? '' : String(stored);
}

/** The teacher's typing; null = nothing typed, follow the lesson. */
let draft: string | null = null;
let savedNotice = false;

export const ConsoleClassSize: m.Component = {
	view() {
		const shown = draft ?? storedText();
		const dirty = shown !== storedText();
		const busy = isBusy('classSize');

		return m('.console__class-size', [
			m('label.console__settings-label', { for: 'class-size' }, t('teacher.lesson.students_label')),
			m('.console__class-size-row', [
				m('input.console__class-size-input', {
					id: 'class-size',
					type: 'number',
					inputmode: 'numeric',
					min: '1',
					step: '1',
					value: shown,
					placeholder: String(DEFAULT_CLASS_SIZE),
					disabled: busy,
					'data-testid': 'class-size-input',
					'aria-describedby': 'class-size-help',
					oninput: (e: Event) => {
						draft = (e.target as HTMLInputElement).value;
						savedNotice = false;
					},
				}),
				m(
					'button.btn.btn--secondary.btn--small',
					{
						type: 'button',
						disabled: busy || !dirty,
						'data-action': 'save-class-size',
						onclick: async () => {
							const ok = await saveClassSizeNow(shown);
							if (ok) {
								draft = null;
								savedNotice = true;
							}
							m.redraw();
						},
					},
					t('console.class_size.save'),
				),
			]),
			m(
				'p.console__settings-help#class-size-help',
				t('teacher.lesson.students_hint', { count: DEFAULT_CLASS_SIZE }),
			),
			savedNotice && !dirty
				? m('p.console__settings-help', { role: 'status' }, t('console.class_size.saved'))
				: null,
		]);
	},
};
