import m from 'mithril';
import { Icon, type IconName } from './Icon';
import { t } from '../lib/i18n';
import { classLabel } from '../lib/teacher';
import { getTeacherNavState, liveSessions, loadTeacherNav, navClass } from '../lib/teacherNav';
import { AgoraSession } from '@freedi/shared-types';

export interface TeacherNavAttrs {
	/** What this screen is about — the lesson's own name, not the screen's */
	title: string;
	/** A quieter second line: the class, the stage, the date */
	subtitle?: string;
	/** What the arrow does. A screen with unsaved work guards it itself. */
	onBack: () => void;
	/** Status pills, a language picker: whatever the screen wants on the far end */
	trailing?: m.Children;
}

/**
 * The bar at the top of every teacher screen — the way back, the way home,
 * and the way across.
 *
 * A teacher running a lesson was in a room with no doors: the console had no
 * header at all, so there was no back, no way to their other class, and no way
 * to the second lesson running in the next period. The other teacher screens
 * had a lone "back" that always meant /teach, whichever screen you had come
 * from. This bar is on all of them, and the menu behind it lists what a
 * teacher actually walks between: the lessons running right now, their
 * classes, and home.
 *
 * The list is fetched only when the menu is first opened (see lib/teacherNav),
 * so a bar on every screen costs nothing until somebody uses it.
 */
const MENU_ID = 'teacher-nav-menu';

export function TeacherNav(): m.Component<TeacherNavAttrs> {
	let open = false;

	function toggle(): void {
		open = !open;
		if (open) loadTeacherNav();
	}

	function close(): void {
		open = false;
	}

	function go(route: string): void {
		open = false;
		m.route.set(route);
	}

	/** The route on screen, without its query — what "you are here" compares against */
	function here(): string {
		return m.route.get().split('?')[0];
	}

	function row(attrs: {
		key: string;
		icon: IconName;
		label: string;
		meta?: m.Children;
		route: string;
	}): m.Children {
		const current = here() === attrs.route;

		return m(
			'button.teacher-nav__item',
			{
				key: attrs.key,
				type: 'button',
				class: current ? 'teacher-nav__item--current' : undefined,
				'aria-current': current ? 'page' : undefined,
				onclick: () => go(attrs.route),
			},
			[
				m('span.teacher-nav__item-icon', m(Icon, { name: attrs.icon, size: 20 })),
				m('span.teacher-nav__item-text', [
					m('span.teacher-nav__item-label', attrs.label),
					attrs.meta ? m('span.teacher-nav__item-meta', attrs.meta) : null,
				]),
			],
		);
	}

	/** A lesson running now: whose class it is, and where the room has got to */
	function lessonRow(session: AgoraSession): m.Children {
		const agoraClass = navClass(session.classId);
		const label = session.classId
			? agoraClass
				? classLabel(agoraClass)
				: t('dashboard.class_gone')
			: t('startGame.guest_game');

		return row({
			key: session.sessionId,
			icon: 'square',
			label,
			meta: [
				m('span.teacher-nav__live', t('dashboard.game_live')),
				m('span', t(`stage.${session.stage}`)),
			],
			route: `/teach/session/${session.sessionId}`,
		});
	}

	function menu(): m.Children[] {
		const { classes, loading, loaded, failed } = getTeacherNavState();
		const live = liveSessions();

		return [
			// The scrim: a tap anywhere off the panel closes it, which is what
			// every menu on a phone does.
			m('.teacher-nav__scrim', { onclick: close }),
			m(
				'.teacher-nav__panel',
				{
					// A disclosure, not an ARIA menu: these are links to places, and
					// `role="menu"` would promise arrow-key semantics this does not
					// implement. The button owns it by id and says whether it is open.
					id: MENU_ID,
					'aria-label': t('nav.menu'),
					oncreate: ({ dom }: m.VnodeDOM) => {
						(dom as HTMLElement).querySelector('button')?.focus();
					},
				},
				[
					m('p.teacher-nav__section', t('nav.live_now')),
					loading && !loaded
						? m('.spinner')
						: live.length > 0
							? live.map(lessonRow)
							: m('p.teacher-nav__empty', t('nav.no_live')),

					m('p.teacher-nav__section', t('dashboard.my_classes')),
					classes.length > 0
						? classes.map((agoraClass) =>
								row({
									key: agoraClass.classId,
									icon: 'people',
									label: classLabel(agoraClass),
									meta: t('dashboard.members', { count: String(agoraClass.memberCount) }),
									route: `/teach/class/${agoraClass.classId}`,
								}),
							)
						: loading && !loaded
							? null
							: m('p.teacher-nav__empty', t('nav.no_classes')),

					failed ? m('p.teacher-nav__empty.join__error', t('nav.load_failed')) : null,

					m('.teacher-nav__footer', [
						row({ key: 'home', icon: 'home', label: t('teacher.title'), route: '/teach' }),
						row({
							key: 'start',
							icon: 'new',
							label: t('dashboard.start_game'),
							route: '/teach/start',
						}),
					]),
				],
			),
		];
	}

	return {
		view({ attrs }) {
			const { title, subtitle, onBack, trailing } = attrs;
			const atHome = here() === '/teach';

			return m(
				'nav.teacher-nav',
				{
					'aria-label': t('nav.aria'),
					// Lifted over the toast and modal layers only while the menu is
					// open: the bar itself must stay under them.
					class: open ? 'teacher-nav--open' : undefined,
					onkeydown: (event: KeyboardEvent) => {
						if (event.key === 'Escape') close();
					},
				},
				[
					m(
						'button.teacher-nav__back',
						{
							type: 'button',
							'aria-label': t('common.back'),
							title: t('common.back'),
							onclick: onBack,
						},
						m(Icon, { name: 'arrow', size: 20 }),
					),
					// On /teach itself the house would lead to the screen it sits on
					atHome
						? null
						: m(
								'button.teacher-nav__home',
								{
									type: 'button',
									'aria-label': t('teacher.title'),
									title: t('teacher.title'),
									onclick: () => go('/teach'),
								},
								m(Icon, { name: 'home', size: 20 }),
							),
					m('.teacher-nav__titles', [
						m('span.teacher-nav__title', title),
						subtitle ? m('span.teacher-nav__subtitle', subtitle) : null,
					]),
					trailing ? m('.teacher-nav__trailing', trailing) : null,
					m(
						'button.teacher-nav__switch',
						{
							type: 'button',
							'aria-label': t('nav.menu'),
							title: t('nav.menu'),
							'aria-expanded': String(open),
							'aria-controls': MENU_ID,
							onclick: toggle,
						},
						m(Icon, { name: 'menu', size: 20 }),
					),
					open ? menu() : null,
				],
			);
		},
	};
}
