import m from 'mithril';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';
import {
	acceptsVillageEntry,
	acceptsVillageWrite,
	villageBooths,
	villageDesk,
	villageFixedPlaces,
	villagePlace,
	type VillageNavigation,
} from '../lib/flows/villageRoute';
import type { CouncilModel } from '../lib/flows/villageCouncil';
import { bubblePlacement, readBubbleAnchor, type BubbleAnchor } from '../lib/flows/villageBubble';
import { VillageCommunity, type VillageCommunityAttrs } from './VillageCommunity';
import { planItemLabel } from './StageNav';
import { PlaceBar } from './PlaceBar';
import { openPlaceOf, placeNavTabs } from '../lib/flows/placeNav';
import { t } from '../lib/i18n';
import { isLightWorld, isVillageSoundOn } from '../lib/villagePrefs';

interface VillageShellAttrs {
	stationPapers?: Array<{
		itemId: string;
		place: string;
		papers: Array<{ text: string; own: boolean; author?: string; confirmed?: boolean }>;
	}>;
	community?: Omit<
		VillageCommunityAttrs,
		| 'plan'
		| 'currentIndex'
		| 'viewingIndex'
		| 'navigate'
		| 'onPause'
		| 'onPanelChange'
		| 'onEditMine'
	>;
	/** What the council's scoreboard paints — absent before the topic loads */
	council?: CouncilModel;
	/** Who moves the class between stations. Absent = the teacher */
	navigation?: VillageNavigation;
	/** The teacher's latest "everyone to …" (`AgoraSession.villageCall`) */
	call?: { place: string; at: number };
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	viewingIndex: number;
	browseFreely?: boolean;
	/** The way out when the 3D world will not load on this device */
	onLeaveVillage?: () => void;
	onWrite?: () => void;
	onSelectBook?: (itemId: string) => void;
	papers: Array<{ text: string; own: boolean; confirmed?: boolean }>;
}

/** A message from the world naming a place — a board or desk the walker reached */
function placeOf(payload: unknown, type: string): string | null {
	if (!payload || typeof payload !== 'object' || !('type' in payload) || !('place' in payload))
		return null;
	if (payload.type !== type || typeof payload.place !== 'string') return null;

	return payload.place;
}

/**
 * A light world (no shadows, sparse grass, throttled frames) for weak devices
 * and headless test runs — opted into per browser, never chosen for anyone.
 */
function villageLite(): boolean {
	try {
		return localStorage.getItem('agora_village_lite') === '1';
	} catch {
		return false;
	}
}

/**
 * A walk that never reports arriving (a hidden tab, a lost frame) still ends.
 * Generous on purpose: the village is a village, and crossing it from the far
 * booth to the council is a walk of some twenty seconds.
 */
const ARRIVAL_FALLBACK_MS = 30000;
/** A call older than this, met on first render, is history rather than an order */
const CALL_FRESH_MS = 120000;
/** The camera's turn to the table takes ~0.9s; a world that never reports the guide still shows the bubble */
const ANCHOR_FALLBACK_MS = 1500;

/**
 * When the walk ends: stand at the station (and at the council, open its
 * ballot or recap), only stand there, open the council, nothing. A booth
 * never opens its paper on arrival — the guide's bubble does.
 */
type ArrivalAction = 'station' | 'look' | 'council' | 'none';

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
	let scoreboardRequest = 0;
	let libraryInside = false;
	let bookOpen = false;
	let requestedBook = '';
	/** A booth the walker chose from the village: open its desk once the item arrives */
	let requestedDesk = '';
	/** A council item the walker chose: open its activity (the ballot, the recap) once it arrives */
	let requestedCouncil = '';
	/** Bumped to close whatever board the community layer has open */
	let closeRequest = 0;
	/** The open community panel is this booth's board (not the scoreboard): its side of the switch is on */
	let boardView = false;
	/** Where the booth's guide stands on screen — the paper is written in their speech bubble */
	let anchor: BubbleAnchor | null = null;
	/** The bubble stays invisible while the camera turns to the table, so it does not jump */
	let waitingAnchor = false;
	let anchorTimer: ReturnType<typeof setTimeout> | undefined;
	const redraw = (): void => m.redraw();
	let lastRoomIndex: number | undefined;
	let lastCallAt: number | undefined;
	/** Where the world is walking the student, and what opens when they get there */
	let arrival: { place: string; then: ArrivalAction } | null = null;
	let arrivalTimer: ReturnType<typeof setTimeout> | undefined;
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
				booths: villageBooths(attrs.plan, attrs.currentIndex, planItemLabel),
				council: attrs.council ?? null,
				navigation: leads() ? 'teacher' : 'free',
				roomItemId: attrs.plan[attrs.currentIndex]?.itemId ?? '',
				places: villageFixedPlaces(attrs.plan, attrs.currentIndex),
				// The world used to own these two as buttons of its own, drawn by
				// the standalone tour and showing through the iframe. The app owns
				// the choice now; the world only applies it.
				sound: isVillageSoundOn(),
				quality: isLightWorld() ? 'low' : 'high',
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
		// The flight already left the camera facing the board.
		boardView = true;
		sync();
		m.redraw();
	}
	/** Turn the world's camera to one side of a booth: the table (paper and guide) or the class board */
	function frameView(place: string, view: 'table' | 'board'): void {
		frame?.contentWindow?.postMessage(
			{ type: 'agora-village-view', place, view },
			window.location.origin,
		);
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
		waitingAnchor = true;
		clearTimeout(anchorTimer);
		anchorTimer = setTimeout(() => {
			waitingAnchor = false;
			m.redraw();
		}, ANCHOR_FALLBACK_MS);
		sync();
		frameView(villagePlace(item), 'table');
		m.redraw();
	}
	/** The board side of the booth: the class's notes, to read, rate and answer */
	function openBoard(): void {
		const item = attrs.plan[attrs.viewingIndex];
		if (!item || !attrs.community || flightItem) return;
		opened = false;
		deskOpen = false;
		focusDesk = false;
		boardRequest++;
		communityOpen = true;
		boardView = true;
		sync();
		frameView(villagePlace(item), 'board');
		m.redraw();
	}
	/** Straight to my paper at the table — "edit my note" on the board */
	function showTable(): void {
		if (communityOpen) closeRequest++;
		communityOpen = false;
		boardView = false;
		openDesk();
	}
	/**
	 * Stand in front of the station: the camera frames the guide, the writing
	 * table and the note, and the guide's bubble in the world gives the
	 * instruction. Nothing opens here — the paper opens only from the button
	 * inside that bubble (`agora-village-write`).
	 */
	function showStation(): void {
		const item = attrs.plan[attrs.viewingIndex];
		if (!item || !villageDesk(item) || flightItem) return;
		if (communityOpen) closeRequest++;
		communityOpen = false;
		boardView = false;
		opened = false;
		deskOpen = false;
		focusDesk = false;
		sync();
		frameView(villagePlace(item), 'table');
		m.redraw();
	}
	/** The plan position an opened place stands for, or -1 */
	function openedIndexOf(place: string): number {
		return attrs.plan.findIndex((p, i) => i <= attrs.currentIndex && villagePlace(p) === place);
	}
	/** The council's own item — the vote or the recap — once the room has reached one */
	function councilIndex(): number {
		let index = -1;
		attrs.plan.forEach((p, i) => {
			if (i <= attrs.currentIndex && villagePlace(p) === 'council') index = i;
		});

		return index;
	}
	function openScoreboard(): void {
		if (!attrs.community) return;
		closeEverything();
		scoreboardRequest++;
		communityOpen = true;
		sync();
		m.redraw();
	}
	function leads(): boolean {
		return !attrs.browseFreely && (attrs.navigation ?? 'teacher') === 'teacher';
	}
	/** The council's own item — the ballot, the recap — once the room is there; the scoreboard until then */
	function enterCouncil(): void {
		closeEverything();
		const index = councilIndex();
		if (index >= 0 && attrs.plan[index].stage !== AgoraStage.ended) {
			if (index === attrs.viewingIndex) {
				opened = true;
				deskOpen = false;
				sync();
				m.redraw();
			} else {
				requestedCouncil = attrs.plan[index].itemId;
				attrs.onSelectBook?.(requestedCouncil);
			}
		} else {
			openScoreboard();
		}
	}
	/**
	 * Close every paper, book and board. A board left open when the room
	 * moves on keeps its frame but swaps its content to the new item — the
	 * student sees the next station's empty board while standing at the old
	 * one, with no paper to write on — and it pauses the world's walk.
	 */
	function closeEverything(): void {
		flightItem = '';
		clearTimeout(flightTimer);
		opened = false;
		deskOpen = false;
		focusDesk = false;
		bookOpen = false;
		if (communityOpen) closeRequest++;
		communityOpen = false;
		boardView = false;
	}
	/** Walk the student to a place; `then` runs when the world reports arriving */
	function go(place: string, then: ArrivalAction, reason: 'advance' | 'call' | 'return'): void {
		closeEverything();
		arrival = { place, then };
		clearTimeout(arrivalTimer);
		arrivalTimer = setTimeout(() => arrive(place), ARRIVAL_FALLBACK_MS);
		sync();
		frame?.contentWindow?.postMessage(
			{ type: 'agora-village-go', place, reason },
			window.location.origin,
		);
		m.redraw();
	}
	function arrive(place: string): void {
		// Every walk ends in front of the station — the teacher's advance or
		// call, a refresh, the map. The student sees the guide, the table and
		// the note, and the guide's bubble says what to do; nothing opens by
		// itself. (A walk the student chose reports arriving too.)
		if (arrival && arrival.place !== place) return;
		const then: ArrivalAction = arrival ? arrival.then : 'look';
		arrival = null;
		clearTimeout(arrivalTimer);
		if (then === 'council') {
			enterCouncil();

			return;
		}
		if (then === 'none') return;
		const item = attrs.plan[attrs.viewingIndex];
		if (item && villagePlace(item) === place) {
			if (villageDesk(item)) showStation();
			else if (then === 'station' && place === 'council') enterCouncil();

			return;
		}
		// Another opened booth: put its question on screen, then stand at its table.
		const index = openedIndexOf(place);
		if (index >= 0 && villageDesk(attrs.plan[index])) {
			requestedDesk = attrs.plan[index].itemId;
			attrs.onSelectBook?.(requestedDesk);
		}
	}
	function receive(event: MessageEvent<unknown>): void {
		if (event.origin !== window.location.origin || event.source !== frame?.contentWindow) return;
		const payload = event.data;
		const boardPlace = placeOf(payload, 'agora-village-board');
		const selectPlace = placeOf(payload, 'agora-village-select');
		const arrivedPlace = placeOf(payload, 'agora-village-arrived');
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
			// A fresh page (a refresh, the lobby handing over to the first
			// station) starts at the fountain: take the student to the class.
			const roomItem = attrs.plan[attrs.currentIndex];
			if (leads() && roomItem) go(villagePlace(roomItem), 'look', 'return');
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
		} else if (boardPlace !== null) {
			if (boardPlace === 'council') {
				enterCouncil();

				return;
			}
			const index = openedIndexOf(boardPlace);
			if (index >= 0 && attrs.community) {
				attrs.onSelectBook?.(attrs.plan[index].itemId);
				boardRequest++;
				communityOpen = true;
				boardView = true;
				sync();
				frameView(boardPlace, 'board');
				m.redraw();
			}
		} else if (
			payload &&
			typeof payload === 'object' &&
			'type' in payload &&
			payload.type === 'agora-village-anchor'
		) {
			anchor = readBubbleAnchor(payload);
			waitingAnchor = false;
			clearTimeout(anchorTimer);
			m.redraw();
		} else if (arrivedPlace !== null) {
			arrive(arrivedPlace);
		} else if (selectPlace !== null) {
			// The walker reached another booth's desk: make it the item on
			// screen, and stand at its table once the item has arrived.
			const index = openedIndexOf(selectPlace);
			if (index < 0) return;
			if (index === attrs.viewingIndex) {
				showStation();

				return;
			}
			requestedDesk = attrs.plan[index].itemId;
			attrs.onSelectBook?.(requestedDesk);
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
			window.addEventListener('resize', redraw);
		},
		onremove() {
			window.removeEventListener('message', receive);
			window.removeEventListener('resize', redraw);
			clearTimeout(timer);
			clearTimeout(flightTimer);
			clearTimeout(arrivalTimer);
			clearTimeout(anchorTimer);
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
				opened = requestedBook === next || requestedCouncil === next;
				bookOpen = requestedBook === next;
				requestedBook = '';
				requestedCouncil = '';
				if (requestedDesk === next) {
					requestedDesk = '';
					showStation();
				}
			}
			// The teacher moved the room on. Whatever the student had open belongs
			// to the station they are leaving; led, they walk to the new one and
			// stand in front of it; free, the world announces it and they choose.
			if (lastRoomIndex !== undefined && attrs.currentIndex !== lastRoomIndex) {
				const roomItem = attrs.plan[attrs.currentIndex];
				if (leads() && roomItem) {
					go(villagePlace(roomItem), 'station', 'advance');
				} else {
					closeEverything();
					sync();
				}
			}
			lastRoomIndex = attrs.currentIndex;
			// "Everyone to …" — once per call, and only once the world can walk.
			const call = attrs.call;
			if (ready && call && call.at !== lastCallAt) {
				const fresh = lastCallAt !== undefined || Date.now() - call.at < CALL_FRESH_MS;
				lastCallAt = call.at;
				const roomItem = attrs.plan[attrs.currentIndex];
				if (fresh && roomItem) {
					if (call.place === 'current') {
						if (attrs.viewingIndex !== attrs.currentIndex) attrs.onSelectBook?.(roomItem.itemId);
						go(villagePlace(roomItem), 'station', 'call');
					} else {
						go(call.place, call.place === 'council' ? 'council' : 'none', 'call');
					}
				}
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
				// Inside the bubble only — 'center' scrolled the whole page and took the world out of view.
				input.scrollIntoView({ block: 'nearest' });
			}
		},
		view(vnode) {
			attrs = vnode.attrs;
			itemId = attrs.plan[attrs.viewingIndex]?.itemId ?? '';
			const viewing = attrs.plan[attrs.viewingIndex];
			const library = !!viewing && villagePlace(viewing) === 'library';
			const council = !!viewing && villagePlace(viewing) === 'council';
			const deskHere = !!viewing && !!villageDesk(viewing) && !library && !council;
			const bubble =
				opened && deskOpen && frame
					? bubblePlacement(
							{
								width: frame.clientWidth,
								frameTop: frame.offsetTop,
								frameHeight: frame.offsetHeight,
								bottomInset:
									(frame.parentElement?.querySelector<HTMLElement>('.place-bar-wrap')
										?.offsetHeight ?? 0) + 12,
							},
							anchor,
						)
					: null;
			const deskPrompt =
				viewing && attrs.viewingIndex === attrs.currentIndex
					? villageDesk(viewing)?.prompt
					: undefined;

			return m('.village-shell', [
				flightItem
					? m('div.village-flight-status', { role: 'status' }, 'הפתק שלך בדרך ללוח…')
					: null,
				// The toolbar and the booth-switch chips used to sit here — two more
				// ways to press `showStation()`, plus a third door to the board.
				// One bar below the world answers all of it now.
				attrs.community
					? m(VillageCommunity, {
							...attrs.community,
							boardRequest,
							scoreboardRequest,
							closeRequest,
							plan: attrs.plan,
							currentIndex: attrs.currentIndex,
							viewingIndex: attrs.viewingIndex,
							navigate: (id: string) => attrs.onSelectBook?.(id),
							onPause: (value: boolean) => {
								communityOpen = value;
								if (!value) boardView = false;
								sync();
							},
							onPanelChange: (panel) => {
								boardView = panel === 'notes';
								if (panel !== 'none') {
									opened = false;
									deskOpen = false;
								}
							},
							onEditMine: showTable,
						})
					: null,
				m('iframe.village-shell__world', {
					src: `/prototypes/olive-hill/village.html?embedded=1${villageLite() ? '&lite=1' : ''}`,
					title: t('village.world_title'),
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
							t('village.library.read'),
						)
					: null,
				// The old "enter the station directly" button was really this: the way
				// out when the world does not load. Now it says so, and offers it.
				unavailable && !opened
					? m('.village-shell__notice', [
							m('p', t('village.unavailable')),
							attrs.onLeaveVillage
								? m(
										'button.btn.btn--secondary.btn--sm',
										{ onclick: () => attrs.onLeaveVillage?.() },
										t('village.unavailable_action'),
									)
								: null,
						])
					: null,
				m(
					'.village-shell__activity',
					{
						style: {
							display: opened ? 'block' : 'none',
							...(bubble
								? {
										'--bubble-left': `${bubble.left}px`,
										'--bubble-top': `${bubble.top}px`,
										'--bubble-width': `${bubble.width}px`,
										'--bubble-max-height': `${bubble.maxHeight}px`,
									}
								: {}),
						},
						class: library
							? `village-library${bookOpen ? ' village-library--reading' : ''}`
							: deskOpen
								? `village-desk village-bubble${waitingAnchor ? ' village-bubble--waiting' : ''}`
								: council
									? 'village-council'
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
												t('village.library.shelf'),
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
											m('div', [
												anchor?.speaker
													? m('small.village-bubble__speaker', `💬 ${anchor.speaker}`)
													: null,
												m('h2', villageDesk(attrs.plan[attrs.viewingIndex])?.label ?? 'הפתק שלי'),
												deskPrompt ? m('p.village-bubble__prompt', deskPrompt) : null,
											]),
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
												t('village.desk.close'),
											),
										])
									: council
										? m('.village-desk__header', [
												m(
													'h2',
													viewing.stage === AgoraStage.voting ? 'הקלפי של המועצה' : 'מועצת הכפר',
												),
												m(
													'button.btn.btn--secondary',
													{
														onclick: () => {
															opened = false;
															sync();
														},
													},
													t('village.back'),
												),
											])
										: null,
								vnode.children,
							],
				),
				bubble?.tail && !waitingAnchor
					? m(`.village-bubble-tail.village-bubble-tail--${bubble.tail.side}`, {
							'aria-hidden': 'true',
							style: {
								'--tail-left': `${bubble.tail.left}px`,
								'--tail-top': `${bubble.tail.top}px`,
							},
						})
					: null,
				// The one navigator, last and always present: the four doors never
				// move, so a student learns where they are once.
				m(PlaceBar, {
					tabs: placeNavTabs({
						village: true,
						hasDesk: deskHere,
						hasCommunity: !!attrs.community,
						inFlight: !!flightItem,
						open: openPlaceOf({ opened, deskOpen, communityOpen, boardView, council }),
					}),
					onGo: (id) => {
						if (id === 'village') {
							closeEverything();
							if (deskHere) showStation();
							else {
								sync();
								m.redraw();
							}
						} else if (id === 'note') {
							showTable();
						} else if (id === 'board') {
							openBoard();
						} else {
							enterCouncil();
						}
					},
				}),
			]);
		},
	};
}
