import m from 'mithril';
import type { AgoraStagePlanItem } from '@freedi/shared-types';
import {
	acceptsVillageEntry,
	acceptsVillageWrite,
	villageDesk,
	villagePlace,
} from '../lib/flows/villageRoute';
import { VillageCommunity, type VillageCommunityAttrs } from './VillageCommunity';
import { planItemLabel } from './StageNav';

interface VillageShellAttrs {
	stationPapers?: Array<{
		itemId: string;
		place: string;
		papers: Array<{ text: string; own: boolean; confirmed?: boolean }>;
	}>;
	community?: Omit<
		VillageCommunityAttrs,
		'plan' | 'currentIndex' | 'viewingIndex' | 'navigate' | 'onPause'
	>;
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	viewingIndex: number;
	browseFreely?: boolean;
	onWrite?: () => void;
	onSelectBook?: (itemId: string) => void;
	papers: Array<{ text: string; own: boolean; confirmed?: boolean }>;
}

export function VillageShell(): m.Component<VillageShellAttrs> {
	let frame: HTMLIFrameElement | null = null;
	let attrs: VillageShellAttrs;
	let opened = false;
	let deskOpen = false;
	let focusDesk = false;
	let deskBaseline = '';
	let flightItem = '';
	let flightTimer: ReturnType<typeof setTimeout> | undefined;
	let communityOpen = false;
	let boardRequest = 0;
	let libraryInside = false;
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
				desk: villageDesk(item)
					? {
							...villageDesk(item),
							writable: attrs.viewingIndex === attrs.currentIndex,
							text: attrs.papers.find((paper) => paper.own)?.text ?? '',
						}
					: null,
				paused: opened || communityOpen,
				community: !!attrs.community,
				papers: attrs.papers,
				stationPapers: attrs.stationPapers,
			},
			window.location.origin,
		);
	}
	function finishFlight(): void {
		if (!flightItem) return;
		flightItem = '';
		clearTimeout(flightTimer);
		boardRequest++;
		communityOpen = true;
		sync();
		m.redraw();
	}
	function openDesk(): void {
		if (flightItem) return;
		const item = attrs.plan[attrs.viewingIndex];
		if (!item || !villageDesk(item) || attrs.viewingIndex > attrs.currentIndex) return;
		opened = true;
		deskOpen = true;
		deskBaseline = attrs.papers.find((p) => p.own)?.text ?? '';
		focusDesk = attrs.viewingIndex === attrs.currentIndex;
		if (focusDesk) attrs.onWrite?.();
		sync();
		m.redraw();
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
		} else if (
			payload &&
			typeof payload === 'object' &&
			'type' in payload &&
			payload.type === 'agora-village-library-presence' &&
			'inside' in payload &&
			typeof payload.inside === 'boolean'
		) {
			libraryInside = payload.inside;
			m.redraw();
		} else if (
			payload &&
			typeof payload === 'object' &&
			'type' in payload &&
			payload.type === 'agora-village-board' &&
			'place' in payload
		) {
			const index = attrs.plan.findIndex(
				(p, i) => i <= attrs.currentIndex && villagePlace(p) === payload.place,
			);
			if (index >= 0 && attrs.community) {
				attrs.onSelectBook?.(attrs.plan[index].itemId);
				boardRequest++;
				communityOpen = true;
				sync();
				m.redraw();
			}
		} else if (
			payload &&
			typeof payload === 'object' &&
			'type' in payload &&
			payload.type === 'agora-village-landed' &&
			'itemId' in payload &&
			payload.itemId === flightItem
		) {
			finishFlight();
		} else if (acceptsVillageWrite(payload, attrs.plan, attrs.currentIndex, attrs.viewingIndex)) {
			openDesk();
		} else if (acceptsVillageEntry(payload, attrs.plan, attrs.currentIndex, attrs.viewingIndex)) {
			if (villageDesk(attrs.plan[attrs.viewingIndex])) {
				openDesk();

				return;
			}
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
			clearTimeout(flightTimer);
		},
		onbeforeupdate(vnode) {
			attrs = vnode.attrs;
			const next = attrs.plan[attrs.viewingIndex]?.itemId ?? '';
			if (next !== itemId) {
				flightItem = '';
				clearTimeout(flightTimer);
				itemId = next;
				deskOpen = false;
				focusDesk = false;
				opened = requestedBook === next;
				bookOpen = opened;
				requestedBook = '';
			}
			const own = attrs.papers.find((p) => p.own);
			if (
				deskOpen &&
				opened &&
				own &&
				own.confirmed !== false &&
				own.text !== deskBaseline &&
				own.text.trim()
			) {
				deskBaseline = own.text;
				opened = false;
				deskOpen = false;
				focusDesk = false;
				communityOpen = false;
				flightItem = next;
				sync();
				frame?.contentWindow?.postMessage(
					{
						type: 'agora-village-fly',
						itemId: next,
						place: villagePlace(attrs.plan[attrs.viewingIndex]),
					},
					location.origin,
				);
				flightTimer = setTimeout(finishFlight, 5000);
			}
		},
		onupdate(vnode) {
			sync();
			if (!opened || !focusDesk) return;
			const input = (vnode.dom as HTMLElement).querySelector<HTMLTextAreaElement>(
				'.village-desk textarea.round__textarea, .village-desk textarea.question__textarea, .village-desk textarea.my-screen__text, .village-desk .write-desk textarea',
			);
			if (input && !input.disabled) {
				focusDesk = false;
				input.focus({ preventScroll: true });
				input.scrollIntoView({ block: 'center' });
			}
		},
		view(vnode) {
			attrs = vnode.attrs;
			itemId = attrs.plan[attrs.viewingIndex]?.itemId ?? '';
			const library =
				!!attrs.plan[attrs.viewingIndex] &&
				villagePlace(attrs.plan[attrs.viewingIndex]) === 'library';

			return m('.village-shell', [
				flightItem
					? m('div.village-flight-status', { role: 'status' }, 'הפתק שלך בדרך ללוח…')
					: null,
				m('.village-shell__toolbar', [
					m('strong', 'סנהדרין · כפר החכמים'),
					m(
						'button.btn.btn--secondary.btn--sm',
						{
							onclick: () => {
								if (!opened && villageDesk(attrs.plan[attrs.viewingIndex])) {
									openDesk();

									return;
								}
								opened = !opened;
								deskOpen = false;
								focusDesk = false;
								bookOpen = false;
								sync();
							},
						},
						opened
							? 'חזרה לכפר'
							: library
								? 'כניסה לספרייה'
								: villageDesk(attrs.plan[attrs.viewingIndex])
									? 'הפתק שלי על השולחן'
									: 'כניסה ישירה לתחנה',
					),
				]),
				attrs.community
					? m(VillageCommunity, {
							...attrs.community,
							boardRequest,
							plan: attrs.plan,
							currentIndex: attrs.currentIndex,
							viewingIndex: attrs.viewingIndex,
							navigate: (id: string) => attrs.onSelectBook?.(id),
							onPause: (value: boolean) => {
								communityOpen = value;
								sync();
							},
						})
					: null,
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
				library && libraryInside && !opened
					? m(
							'button.village-library__read',
							{
								onclick: () => {
									opened = true;
									bookOpen = false;
									sync();
								},
							},
							'קרא את הספרים',
						)
					: null,
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
						class: library
							? `village-library${bookOpen ? ' village-library--reading' : ''}`
							: deskOpen
								? 'village-desk'
								: '',
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
												attrs.browseFreely
													? 'בחרו ספר מהמדף. אפשר לקרוא ולחזור לכל ספר בכל זמן.'
													: 'כל ספר פותח חלון לנושא. הספר שהמורה מציג מחכה לכם, ואפשר לשוב גם לספרים שכבר נפתחו.',
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
																	class:
																		!attrs.browseFreely && index === attrs.currentIndex
																			? 'is-current'
																			: '',
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
																		attrs.browseFreely
																			? 'פתיחת הספר'
																			: index > attrs.currentIndex
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
						: [
								deskOpen
									? m('.village-desk__header', [
											m('h2', villageDesk(attrs.plan[attrs.viewingIndex])?.label ?? 'הפתק שלי'),
											m(
												'button.btn.btn--secondary',
												{
													onclick: () => {
														opened = false;
														deskOpen = false;
														focusDesk = false;
														sync();
													},
												},
												'חזרה לשולחן',
											),
										])
									: null,
								vnode.children,
							],
				),
			]);
		},
	};
}
