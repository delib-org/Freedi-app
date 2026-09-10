import m from 'mithril';
import type { AgoraStagePlanItem } from '@freedi/shared-types';
import { acceptsVillageEntry, villagePlace } from '../lib/flows/villageRoute';
import { planItemLabel } from './StageNav';

interface VillageShellAttrs {
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	viewingIndex: number;
	onSelectBook?: (itemId: string) => void;
	papers: Array<{ text: string; own: boolean }>;
}

export function VillageShell(): m.Component<VillageShellAttrs> {
	let frame: HTMLIFrameElement | null = null;
	let attrs: VillageShellAttrs;
	let opened = false;
	let bookOpen = false;
	let requestedBook = '';
	let itemId = '';
	let ready = false;
	let unavailable = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	function sync(): void {
		const item = attrs.plan[attrs.viewingIndex];
		if (!item) return;
		frame?.contentWindow?.postMessage(
			{
				type: 'agora-village-state',
				itemId: item.itemId,
				place: villagePlace(item),
				label: planItemLabel(item),
				paused: opened,
				papers: attrs.papers,
			},
			window.location.origin,
		);
	}
	function receive(event: MessageEvent<unknown>): void {
		if (event.origin !== window.location.origin || event.source !== frame?.contentWindow) return;
		const payload = event.data;
		if (
			payload &&
			typeof payload === 'object' &&
			'type' in payload &&
			payload.type === 'agora-village-ready'
		) {
			ready = true;
			unavailable = false;
			clearTimeout(timer);
			sync();
			m.redraw();
		} else if (acceptsVillageEntry(payload, attrs.plan, attrs.currentIndex, attrs.viewingIndex)) {
			opened = true;
			sync();
			m.redraw();
		}
	}

	return {
		oninit(vnode) {
			attrs = vnode.attrs;
			window.addEventListener('message', receive);
		},
		onremove() {
			window.removeEventListener('message', receive);
			clearTimeout(timer);
		},
		onbeforeupdate(vnode) {
			attrs = vnode.attrs;
			const next = attrs.plan[attrs.viewingIndex]?.itemId ?? '';
			if (next !== itemId) {
				itemId = next;
				opened = requestedBook === next;
				bookOpen = opened;
				requestedBook = '';
			}
		},
		onupdate: sync,
		view(vnode) {
			attrs = vnode.attrs;
			itemId = attrs.plan[attrs.viewingIndex]?.itemId ?? '';
			const library =
				!!attrs.plan[attrs.viewingIndex] &&
				villagePlace(attrs.plan[attrs.viewingIndex]) === 'library';

			return m('.village-shell', [
				m('.village-shell__toolbar', [
					m('strong', 'סנהדרין · כפר החכמים'),
					m(
						'button.btn.btn--secondary.btn--sm',
						{
							onclick: () => {
								opened = !opened;
								bookOpen = false;
								sync();
							},
						},
						opened ? 'חזרה לכפר' : library ? 'כניסה לספרייה' : 'כניסה ישירה לתחנה',
					),
				]),
				m('iframe.village-shell__world', {
					src: '/prototypes/olive-hill/village.html?embedded=1',
					title: 'כפר החכמים בתלת־מימד',
					oncreate: (node: m.VnodeDOM) => {
						frame = node.dom as HTMLIFrameElement;
						timer = setTimeout(() => {
							if (!ready) {
								unavailable = true;
								m.redraw();
							}
						}, 15000);
					},
					onload: sync,
				}),
				unavailable && !opened
					? m(
							'p.village-shell__notice',
							'הכפר לא נטען במכשיר הזה. אפשר להיכנס ישירות לתחנה ולהמשיך במפגש.',
						)
					: null,
				m(
					'.village-shell__activity',
					{
						style: { display: opened ? 'block' : 'none' },
						class: library ? `village-library${bookOpen ? ' village-library--reading' : ''}` : '',
					},
					library
						? [
								m('.village-library__header', [
									m('div', [m('small', 'כפר החכמים · בית של ידע'), m('h2', 'הספרייה')]),
									bookOpen
										? m(
												'button.btn.btn--secondary',
												{
													onclick: () => {
														bookOpen = false;
													},
												},
												'סגירת הספר · חזרה למדף',
											)
										: null,
								]),
								bookOpen
									? m('.village-library__pages', vnode.children)
									: [
											m(
												'p.village-library__intro',
												'כל ספר פותח חלון לנושא. הספר שהמורה מציג מחכה לכם, ואפשר לשוב גם לספרים שכבר נפתחו.',
											),
											m(
												'.village-library__shelf',
												attrs.plan.map((item, index) =>
													villagePlace(item) !== 'library'
														? null
														: m(
																'button.village-library__book',
																{
																	key: item.itemId,
																	disabled: index > attrs.currentIndex,
																	class: index === attrs.currentIndex ? 'is-current' : '',
																	style: {
																		'--book-color': [
																			'#466762',
																			'#8d604f',
																			'#64704c',
																			'#6e6083',
																			'#8c713e',
																		][index % 5],
																	},
																	onclick: () => {
																		if (index > attrs.currentIndex) return;
																		if (index === attrs.viewingIndex) {
																			bookOpen = true;
																		} else {
																			requestedBook = item.itemId;
																			attrs.onSelectBook?.(item.itemId);
																		}
																	},
																},
																[
																	m('span.village-library__ornament', '❧'),
																	m('strong', item.title?.trim() || planItemLabel(item)),
																	m(
																		'small',
																		index > attrs.currentIndex
																			? 'ייפתח בהמשך המפגש'
																			: index === attrs.currentIndex
																				? 'המורה מציג עכשיו · פתיחת הספר'
																				: 'פתוח לקריאה חוזרת',
																	),
																],
															),
												),
											),
										],
							]
						: vnode.children,
				),
			]);
		},
	};
}
