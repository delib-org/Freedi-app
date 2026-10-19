import m from 'mithril';
import { Icon } from './Icon';
import { t } from '../lib/i18n';
import { loadTeacherNav } from '../lib/teacherNav';
import { buildNavModel, type NavItem, type TeacherNavMenuItem } from '../lib/teacherNavModel';
import { isDesktop, watchDesktop } from '../lib/teacherSidebar';
import { getUserState } from '../lib/user';
import { signedInAs, signOutAndLeave } from './SignOutLink';
import { navItemBody, TeacherSidebar } from './TeacherSidebar';
import { ensureLibraryAccess, refreshOpenReports } from '../lib/scenarioLibrary/state';

export type { TeacherNavMenuItem };

export interface TeacherNavAttrs {
	/** What this screen is about — the lesson's own name, not the screen's */
	title: string;
	/** A quieter second line: the class, the stage, the date */
	subtitle?: string;
	/** What the arrow does. A screen with unsaved work guards it itself. */
	onBack: () => void;
	/** Status pills, a language picker: whatever the screen wants on the far end */
	trailing?: m.Children;
	/**
	 * A control that must stay on the bar at every width — the console's
	 * Board ⇄ Class view switch. Unlike `trailing` it never folds into ≡:
	 * switching views is a lesson-time move, not a setting.
	 */
	segment?: m.Children;
	/**
	 * The lesson's join code, as a pill that copies itself. On every stage of
	 * a running lesson a latecomer is one tap away, and the teacher never has
	 * to scroll to find the five digits.
	 */
	code?: string;
	/**
	 * When set, tapping the code pill calls this (the console opens the join
	 * QR) instead of copying the digits.
	 */
	onCodeTap?: () => void;
	/**
	 * Rows for this screen alone, listed first in the ≡ menu under "this
	 * lesson". On a phone the bar has no room for the projector and the cog,
	 * so the console hands them over here instead of dropping them.
	 */
	menuItems?: readonly TeacherNavMenuItem[];
	/**
	 * `false` keeps the desktop side bar away: a gate (sign-in, no access) has
	 * no menu to show, and must not fetch a teacher's lessons. The top bar then
	 * behaves as it does on a phone.
	 */
	sidebar?: boolean;
}

/** How long the pill says "copied" before it says the code again */
const COPIED_MS = 1600;

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
	// Wide enough for the side bar: the menu is then on screen all the time, so
	// the ≡ button and the house go and the menu rows move to the bar
	let desktop = isDesktop();
	let stopWatching: (() => void) | undefined;
	let copied = false;
	let signOutFailed = false;
	let copiedTimer: number | undefined;

	function copyCode(code: string, digits: HTMLElement | null): void {
		const clipboard = navigator.clipboard;
		if (!clipboard) {
			selectDigits(digits);

			return;
		}
		clipboard
			.writeText(code)
			.then(() => {
				copied = true;
				window.clearTimeout(copiedTimer);
				copiedTimer = window.setTimeout(() => {
					copied = false;
					m.redraw();
				}, COPIED_MS);
				m.redraw();
			})
			.catch(() => selectDigits(digits));
	}

	/** No clipboard (an http origin, an old WebView): leave the digits selected so a long-press copies them */
	function selectDigits(digits: HTMLElement | null): void {
		if (!digits) return;
		const range = document.createRange();
		range.selectNodeContents(digits);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	function codePill(code: string, onCodeTap?: () => void): m.Children {
		return m(
			'button.teacher-nav__code',
			{
				type: 'button',
				class: copied ? 'teacher-nav__code--copied' : undefined,
				'aria-label': onCodeTap
					? t('teacher.code_qr_aria', { code })
					: t('teacher.code_aria', { code }),
				title: onCodeTap ? t('teacher.show_qr') : t('teacher.copy_code'),
				'aria-haspopup': onCodeTap ? 'dialog' : undefined,
				onclick: (event: MouseEvent) => {
					if (onCodeTap) {
						onCodeTap();

						return;
					}
					const digits = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
						'.teacher-nav__code-digits',
					);
					copyCode(code, digits);
				},
			},
			[
				m('span.teacher-nav__code-label', [
					copied ? m(Icon, { name: 'check', size: 16 }) : null,
					copied ? t('roster.code_copied') : t('teacher.session_code'),
				]),
				m('span.teacher-nav__code-digits', code),
				m('span.sr-only', { 'aria-live': 'polite' }, copied ? t('teacher.code_copied') : ''),
			],
		);
	}

	function toggle(): void {
		open = !open;
		if (open) {
			loadTeacherNav();
			// The library row appears only once the server has said this teacher may enter
			void ensureLibraryAccess().then(() => {
				// An admin's queue count, fresh each time the menu opens
				void refreshOpenReports();
				m.redraw();
			});
		}
	}

	function close(): void {
		open = false;
	}

	/** Close the menu, sign out, and land on the sign-in screen; on failure stay and say so */
	function signOut(): void {
		open = false;
		signOutFailed = false;
		signOutAndLeave().catch(() => {
			// The menu was closed above; open it again so the note is where the tap was
			open = true;
			signOutFailed = true;
			m.redraw();
		});
	}

	function go(route: string): void {
		open = false;
		m.route.set(route);
	}

	/** The route on screen, without its query — what "you are here" compares against */
	function here(): string {
		return m.route.get().split('?')[0];
	}

	function row(item: NavItem, current: string | null): m.Children {
		const isCurrent = !item.external && item.key === current;

		return m(
			'button.teacher-nav__item',
			{
				key: item.key,
				type: 'button',
				class: isCurrent ? 'teacher-nav__item--current' : undefined,
				'aria-current': isCurrent ? 'page' : undefined,
				onclick: () => {
					if (!item.external) {
						go(item.route);

						return;
					}
					open = false;
					window.open(item.route, '_blank', 'noopener');
				},
			},
			navItemBody(item),
		);
	}

	function menu(menuItems: readonly TeacherNavMenuItem[]): m.Children[] {
		const model = buildNavModel(m.route.get());
		const email = getUserState().user?.email;
		const { currentKey } = model;

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
					// This screen's own doors first — on a phone they have no other home
					menuItems.length > 0
						? [
								m('p.teacher-nav__section', t('nav.this_lesson')),
								menuItems.map((item, index) =>
									m(
										'button.teacher-nav__item.teacher-nav__item--own',
										{
											key: `own-${index}`,
											type: 'button',
											onclick: () => {
												open = false;
												item.onSelect();
											},
										},
										[
											m('span.teacher-nav__item-icon', m(Icon, { name: item.icon, size: 20 })),
											m(
												'span.teacher-nav__item-text',
												m('span.teacher-nav__item-label', item.label),
											),
										],
									),
								),
							]
						: null,

					// Lessons running now come first, on every teacher screen: the
					// second, always-there way back into a lesson
					model.loading
						? m('.spinner')
						: model.live.length > 0
							? [
									m('p.teacher-nav__section', t('nav.live_now')),
									model.live.map((item) => row(item, currentKey)),
								]
							: null,

					// Places
					model.places.map((item) => row(item, currentKey)),

					m('p.teacher-nav__section', t('dashboard.my_classes')),
					model.classes.length > 0
						? model.classes.map((item) => row(item, currentKey))
						: model.loading
							? null
							: m('p.teacher-nav__empty', t('nav.no_classes')),

					model.failed ? m('p.teacher-nav__empty.join__error', t('nav.load_failed')) : null,

					// Everything a teacher uses less often than the above
					m('p.teacher-nav__section', t('nav.more')),
					model.more.map((item) => row(item, currentKey)),

					// The account: who is signed in, and the way out. Last, and quiet —
					// it is for the shared classroom computer, not for every lesson.
					m('p.teacher-nav__section.teacher-nav__section--account', t('nav.account')),
					email ? m('p.teacher-nav__account', signedInAs(email)) : null,
					m('button.teacher-nav__item', { type: 'button', onclick: signOut }, [
						m('span.teacher-nav__item-icon', m(Icon, { name: 'lock', size: 20 })),
						m('span.teacher-nav__item-text', m('span.teacher-nav__item-label', t('nav.sign_out'))),
					]),
					signOutFailed
						? m('p.teacher-nav__empty.join__error', { role: 'alert' }, t('nav.sign_out_failed'))
						: null,
				],
			),
		];
	}

	return {
		oninit() {
			stopWatching = watchDesktop((matches) => {
				desktop = matches;
				// Crossing the line either way starts the ≡ panel closed
				open = false;
				m.redraw();
			});
		},

		onremove() {
			window.clearTimeout(copiedTimer);
			stopWatching?.();
		},

		view({ attrs }) {
			const { title, subtitle, onBack, trailing, code, onCodeTap, segment, menuItems = [] } = attrs;
			const barOn = desktop && attrs.sidebar !== false;
			const atHome = here() === '/teach';

			return [
				m(
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
						// On /teach itself the house would lead to the screen it sits on; on
						// a desktop the side bar has the teachers' room as its first row
						atHome || barOn
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
						segment ? m('.teacher-nav__segment', segment) : null,
						code || trailing
							? m('.teacher-nav__trailing', [code ? codePill(code, onCodeTap) : null, trailing])
							: null,
						barOn
							? null
							: m(
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
						open && !barOn ? menu(menuItems) : null,
					],
				),
				// After the top bar and before the page in tab order
				barOn ? m(TeacherSidebar, { menuItems }) : null,
			];
		},
	};
}
