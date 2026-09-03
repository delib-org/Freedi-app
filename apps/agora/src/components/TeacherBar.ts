import m from 'mithril';
import { Icon } from './Icon';
import { t } from '../lib/i18n';

export interface TeacherBarAttrs {
	/** What this screen is about — the package's own name, not the screen's */
	title: string;
	onBack: () => void;
	/** Status pills, a language picker: whatever the screen wants on the far end */
	trailing?: m.Children;
}

/**
 * The bar at the top of a teacher's long form.
 *
 * The authoring screens are one tall scroll — title, framing, characters,
 * scenes — and the way out sat in a header that scrolled away with the first
 * paragraph. From scene three there was no back button, so there was no back.
 * This bar sticks, and the way out is an arrow at the inline-start edge, which
 * is where a phone puts it in both directions.
 */
export const TeacherBar: m.Component<TeacherBarAttrs> = {
	view({ attrs }) {
		const { title, onBack, trailing } = attrs;

		return m('.teacher-bar', [
			m(
				'button.teacher-bar__back',
				{
					type: 'button',
					'aria-label': t('common.back'),
					title: t('common.back'),
					onclick: onBack,
				},
				m(Icon, { name: 'arrow', size: 20 }),
			),
			m('span.teacher-bar__title', title),
			trailing ? m('.teacher-bar__trailing', trailing) : null,
		]);
	},
};
