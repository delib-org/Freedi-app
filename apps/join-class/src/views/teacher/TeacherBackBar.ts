import m from 'mithril';
import '@/styles/teacher-back-bar.scss';
import { t } from '@/lib/i18n';
import { icon } from './ConsoleIcon';

/**
 * The teacher bar on every screen below the lesson list (docs/ia/join-class-lesson-plan.md
 * 14): a house chip that goes straight to the list (`/t`), then, when there is a different
 * parent, "‹ <parent name>" one level up. The projector is its own window and has none.
 *
 * Home first in the DOM, so it sits at the inline start in either direction. The chevron
 * points to the start side (flipped in RTL by the SCSS). Both controls are >= 44 px, keyboard
 * focusable and named for screen readers. The bar sticks to the top while the screen scrolls.
 */

/** The teacher home (the destination of the home chip). */
export const TEACHER_HOME_PATH = '/t';

export interface TeacherBackBarAttrs {
	/** The parent screen's route. Absent, or `/t`, renders the home chip only. */
	href?: string;
	/** The parent's name: the plan title, the lesson name, or a fallback while it loads. */
	label?: string;
	/** Runs instead of the plain navigation of the BACK link (the table sheet closes). */
	onActivate?: () => void;
	/** Runs instead of the plain navigation of EITHER link, with the route it would open. */
	onLeave?: (href: string) => void;
}

/** One destination needs one control: no parent, or a parent that is the home, hides back. */
export function showsBackLink(attrs: TeacherBackBarAttrs): boolean {
	return Boolean(attrs.href) && attrs.href !== TEACHER_HOME_PATH;
}

function homeLink(withText: boolean, onLeave?: (href: string) => void): m.Children {
	const name = t('teacher.back.to', { name: t('teacher.home.title') });

	return m(
		m.route.Link,
		{
			class: `back-bar__home${withText ? ' back-bar__home--text' : ''}`,
			href: TEACHER_HOME_PATH,
			'data-action': 'home',
			'aria-label': name,
			title: name,
			onclick: onLeave
				? (e: Event) => {
						e.preventDefault();
						onLeave(TEACHER_HOME_PATH);
					}
				: undefined,
		},
		[icon('home'), withText ? m('span.back-bar__home-label', t('teacher.home.title')) : null],
	);
}

function backLink(attrs: TeacherBackBarAttrs): m.Children {
	const { href = TEACHER_HOME_PATH, label = '', onActivate, onLeave } = attrs;
	const handler = onActivate ?? (onLeave ? () => onLeave(href) : undefined);

	return m(
		m.route.Link,
		{
			class: 'back-bar__link',
			href,
			'data-action': 'back',
			'aria-label': t('teacher.back.to', { name: label }),
			title: label,
			onclick: handler
				? (e: Event) => {
						e.preventDefault();
						handler();
					}
				: undefined,
		},
		[
			m('span.back-bar__chevron', { 'aria-hidden': 'true' }, '‹'),
			m('bdi.back-bar__label', { dir: 'auto' }, label),
		],
	);
}

export const TeacherBackBar: m.Component<TeacherBackBarAttrs> = {
	view({ attrs }) {
		const withBack = showsBackLink(attrs);

		return m('nav.back-bar', { 'aria-label': t('teacher.back.nav') }, [
			homeLink(!withBack, attrs.onLeave),
			withBack ? backLink(attrs) : null,
		]);
	},
};
