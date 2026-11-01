import m from 'mithril';
import '@/styles/teacher-back-bar.scss';
import { t } from '@/lib/i18n';

/**
 * The one way back on every teacher screen (docs/ia/join-class-lesson-plan.md 5): a bar at
 * the top reading "‹ <parent name>" that goes exactly ONE level up the hierarchy. Same
 * component, same look and place on the plan, game, lesson console, lesson questions and
 * table sheet; the projector is its own window and has none.
 *
 * The chevron points to the start side in either direction (flipped in RTL by the SCSS).
 * The link is the whole bar's height (>= 44 px), keyboard focusable, and named for screen
 * readers ("חזרה אל <name>"). The bar sticks to the top while the screen scrolls.
 */

export interface TeacherBackBarAttrs {
	/** The parent screen's route. */
	href: string;
	/** The parent's name: the plan title, the lesson name, or "מערכי השיעור שלי". */
	label: string;
	/** Runs instead of the plain navigation (the table sheet returns focus to its table). */
	onActivate?: () => void;
}

export const TeacherBackBar: m.Component<TeacherBackBarAttrs> = {
	view({ attrs }) {
		const { href, label, onActivate } = attrs;

		return m('nav.back-bar', { 'aria-label': t('teacher.back.nav') }, [
			m(
				m.route.Link,
				{
					class: 'back-bar__link',
					href,
					'data-action': 'back',
					'aria-label': t('teacher.back.to', { name: label }),
					onclick: onActivate
						? (e: Event) => {
								e.preventDefault();
								onActivate();
							}
						: undefined,
				},
				[
					m('span.back-bar__chevron', { 'aria-hidden': 'true' }, '‹'),
					m('bdi.back-bar__label', { dir: 'auto' }, label),
				],
			),
		]);
	},
};
