import m from 'mithril';
import { Icon } from './Icon';
import { signedInAs, signOutAndLeave } from './SignOutLink';
import { t } from '../lib/i18n';
import { getUserState } from '../lib/user';
import { loadTeacherNav } from '../lib/teacherNav';
import { buildNavModel, type NavItem, type TeacherNavMenuItem } from '../lib/teacherNavModel';
import { ensureLibraryAccess, refreshOpenReports } from '../lib/scenarioLibrary/state';
import { getSidebarState, setSidebarState } from '../lib/teacherSidebar';

/** The icon, the words (label and meta) and the count of one menu row, shared by the ≡ panel and the side bar */
export function navItemBody(item: NavItem): m.Children {
	return [
		m('span.teacher-nav__item-icon', m(Icon, { name: item.icon, size: 20 })),
		m('span.teacher-nav__item-text', [
			m('span.teacher-nav__item-label', item.label),
			item.meta
				? m(
						'span.teacher-nav__item-meta',
						item.meta.live
							? [m('span.teacher-nav__live', item.meta.live), m('span', item.meta.text)]
							: item.meta.text,
					)
				: null,
		]),
		item.badge && item.badge.count > 0
			? m(
					'span.teacher-nav__item-badge',
					{ 'aria-label': item.badge.label, title: item.badge.label },
					String(item.badge.count),
				)
			: null,
	];
}

export interface TeacherSidebarAttrs {
	/** The screen's own rows; the ones already on the top bar are left out here */
	menuItems: readonly TeacherNavMenuItem[];
}

const SIDEBAR_ID = 'teacher-sidebar';
const ROOT_CLASS = 'has-teacher-sidebar';
const ROOT_FOLDED_CLASS = 'has-teacher-sidebar--folded';
const ROOT_READY_CLASS = 'has-teacher-sidebar--ready';
let readyScheduled = false;
const TIPS_OFF_CLASS = 'teacher-sidebar--tips-off';

/**
 * Tell the page the bar is there (or gone), so its content sits beside it
 * rather than under it. Done on the root element because the bar is `fixed`
 * and the page is not its parent.
 */
function paintRoot(folded: boolean | null): void {
	const root = document.documentElement;
	if (folded === null) {
		root.classList.remove(ROOT_READY_CLASS);
	} else if (!root.classList.contains(ROOT_READY_CLASS) && !readyScheduled) {
		// Animate folds, never the first paint
		readyScheduled = true;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				readyScheduled = false;
				if (root.classList.contains(ROOT_CLASS)) root.classList.add(ROOT_READY_CLASS);
			}),
		);
	}
	root.classList.toggle(ROOT_CLASS, folded !== null);
	root.classList.toggle(ROOT_FOLDED_CLASS, folded === true);
}

/**
 * The teacher menu as a bar down the edge of a desktop screen: the same rows
 * as the ≡ panel, always on screen, folding to a strip of icons. The choice
 * is remembered per device (lib/teacherSidebar).
 *
 * It is not a dialog and holds no focus: it is a navigation landmark that sits
 * after the top bar and before the page in tab order.
 */
export function TeacherSidebar(): m.Component<TeacherSidebarAttrs> {
	let signOutFailed = false;
	let focusClassesNext = false;

	function signOut(): void {
		signOutFailed = false;
		signOutAndLeave().catch(() => {
			signOutFailed = true;
			m.redraw();
		});
	}

	function go(item: NavItem): void {
		if (item.external) {
			window.open(item.route, '_blank', 'noopener');

			return;
		}
		m.route.set(item.route);
	}

	function itemButton(
		item: NavItem,
		folded: boolean,
		current: string | null,
		first = false,
	): m.Children {
		const isCurrent = !item.external && item.key === current;

		return m(
			'button.teacher-nav__item.teacher-sidebar__item',
			{
				key: item.key,
				type: 'button',
				class: isCurrent ? 'teacher-nav__item--current' : undefined,
				'aria-current': isCurrent ? 'page' : undefined,
				'data-tip': folded ? item.label : undefined,
				'data-first-class': first ? '' : undefined,
				onclick: () => go(item),
			},
			navItemBody(item),
		);
	}

	/** A group: a landmark-ish set of rows, headed in words when open and by a hairline when folded */
	function group(
		id: string,
		heading: string | null,
		folded: boolean,
		children: m.Children,
	): m.Children {
		return m('.teacher-sidebar__group', { role: 'group', 'aria-label': heading ?? undefined }, [
			heading && !folded ? m('p.teacher-nav__section', { 'aria-hidden': 'true' }, heading) : null,
			heading && folded ? m('.teacher-sidebar__divider', { 'aria-hidden': 'true' }) : null,
			children,
		]);
	}

	function ownItem(item: TeacherNavMenuItem, index: number, folded: boolean): m.Children {
		return m(
			'button.teacher-nav__item.teacher-sidebar__item',
			{
				key: `own-${index}`,
				type: 'button',
				'data-tip': folded ? item.label : undefined,
				onclick: item.onSelect,
			},
			[
				m('span.teacher-nav__item-icon', m(Icon, { name: item.icon, size: 20 })),
				m('span.teacher-nav__item-text', m('span.teacher-nav__item-label', item.label)),
			],
		);
	}

	return {
		oninit() {
			// Visible on load, so the list is fetched now rather than on first open
			loadTeacherNav();
			void ensureLibraryAccess().then(() => {
				void refreshOpenReports();
				m.redraw();
			});
		},

		view({ attrs }) {
			const folded = getSidebarState() === 'folded';
			const model = buildNavModel(m.route.get());
			const email = getUserState().user?.email;
			const own = attrs.menuItems.filter((item) => !item.onBar);
			const classesCurrent = model.currentKey?.startsWith('class:') ?? false;
			const foldLabel = folded ? t('nav.unfold') : t('nav.fold');

			return m(
				'nav.teacher-sidebar',
				{
					id: SIDEBAR_ID,
					class: folded ? 'teacher-sidebar--folded' : undefined,
					'aria-label': t('nav.menu'),
					oncreate: () => paintRoot(folded),
					onupdate: ({ dom }: m.VnodeDOM) => {
						paintRoot(folded);
						if (focusClassesNext) {
							focusClassesNext = false;
							const target =
								(dom as HTMLElement).querySelector<HTMLElement>('[data-first-class]') ??
								(dom as HTMLElement).querySelector<HTMLElement>('.teacher-sidebar__fold');
							target?.focus();
						}
					},
					onremove: () => paintRoot(null),
					// A tooltip can be put away with Escape (WCAG 1.4.13); it comes back on the next hover or focus
					onkeydown: (event: KeyboardEvent) => {
						if (event.key === 'Escape') {
							(event.currentTarget as HTMLElement).classList.add(TIPS_OFF_CLASS);
						}
					},
					onpointerover: (event: PointerEvent) =>
						(event.currentTarget as HTMLElement).classList.remove(TIPS_OFF_CLASS),
					onfocusin: (event: FocusEvent) =>
						(event.currentTarget as HTMLElement).classList.remove(TIPS_OFF_CLASS),
				},
				m('.teacher-sidebar__scroll', [
					m(
						'button.teacher-sidebar__fold.teacher-nav__item',
						{
							type: 'button',
							'aria-expanded': String(!folded),
							'aria-controls': SIDEBAR_ID,
							'data-tip': folded ? foldLabel : undefined,
							onclick: () => setSidebarState(folded ? 'open' : 'folded'),
						},
						[
							m('span.teacher-nav__item-icon', m(Icon, { name: 'arrow', size: 20 })),
							m('span.teacher-sidebar__fold-label', foldLabel),
						],
					),

					own.length > 0
						? group(
								'own',
								t('nav.this_lesson'),
								folded,
								own.map((item, index) => ownItem(item, index, folded)),
							)
						: null,

					model.live.length > 0
						? group(
								'live',
								t('nav.live_now'),
								folded,
								model.live.map((item) => itemButton(item, folded, model.currentKey)),
							)
						: null,

					group(
						'places',
						null,
						folded,
						model.places.map((item) => itemButton(item, folded, model.currentKey)),
					),

					group(
						'classes',
						t('dashboard.my_classes'),
						folded,
						folded
							? // One icon for the whole group: pressing it opens the bar on the first class
								m(
									'button.teacher-nav__item.teacher-sidebar__item',
									{
										type: 'button',
										class: classesCurrent ? 'teacher-nav__item--current' : undefined,
										'aria-current': classesCurrent ? 'page' : undefined,
										'data-tip': t('dashboard.my_classes'),
										onclick: () => {
											focusClassesNext = true;
											setSidebarState('open');
										},
									},
									[
										m('span.teacher-nav__item-icon', m(Icon, { name: 'people', size: 20 })),
										m(
											'span.teacher-nav__item-text',
											m('span.teacher-nav__item-label', t('dashboard.my_classes')),
										),
									],
								)
							: [
									model.classes.length > 0
										? model.classes.map((item, index) =>
												itemButton(item, false, model.currentKey, index === 0),
											)
										: model.loading
											? m('.spinner')
											: m('p.teacher-nav__empty', t('nav.no_classes')),
									model.failed ? m('p.teacher-nav__empty.join__error', t('nav.load_failed')) : null,
								],
					),

					group(
						'more',
						t('nav.more'),
						folded,
						model.more.map((item) => itemButton(item, folded, model.currentKey)),
					),

					group('account', t('nav.account'), folded, [
						email && !folded ? m('p.teacher-nav__account', signedInAs(email)) : null,
						m(
							'button.teacher-nav__item.teacher-sidebar__item',
							{
								type: 'button',
								'data-tip': folded ? t('nav.sign_out') : undefined,
								onclick: signOut,
							},
							[
								m('span.teacher-nav__item-icon', m(Icon, { name: 'lock', size: 20 })),
								m(
									'span.teacher-nav__item-text',
									m('span.teacher-nav__item-label', t('nav.sign_out')),
								),
							],
						),
						signOutFailed
							? m('p.teacher-nav__empty.join__error', { role: 'alert' }, t('nav.sign_out_failed'))
							: null,
					]),
				]),
			);
		},
	};
}
