import m from 'mithril';
import {
	AgoraStage,
	createAgoraThreadKey,
	type AgoraSession,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import {
	getDeliberationState,
	getOwnerThreads,
	getThreadMessages,
	listenToDeliberation,
	type AgoraProposal,
} from '../lib/proposals';
import { threadUnreadCount } from '../lib/seenState';
import { ThreadChat, type ThreadChatAttrs } from '../views/ThreadChat';
import { planItemLabel } from './StageNav';
import { villagePlace } from '../lib/flows/villageRoute';
import { playCoin } from '../lib/sound';

export interface VillageCommunitySource {
	notes: (item: AgoraStagePlanItem) => AgoraProposal[];
	threads: (id: string) => Map<string, AgoraProposal[]>;
	messages: (id: string, uid: string) => AgoraProposal[];
	unread: (id: string, messages: AgoraProposal[], uid: string) => number;
	renderThread: (attrs: ThreadChatAttrs) => m.Children;
}
export interface VillageCommunityAttrs {
	source?: VillageCommunitySource;
	boardRequest?: number;
	session: AgoraSession;
	userId: string;
	anonName: string;
	points?: number;
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	viewingIndex: number;
	navigate: (itemId: string) => void;
	onPause: (paused: boolean) => void;
}
export function stationNotes(item: AgoraStagePlanItem): AgoraProposal[] {
	const state = getDeliberationState();

	return (
		[AgoraStage.deliberation, AgoraStage.voting, AgoraStage.results].includes(item.stage)
			? state.proposals
			: item.statementId
				? (state.answersByQuestion[item.statementId] ?? [])
				: []
	).filter((p) => !p.hidden);
}
export function VillageCommunity(): m.Component<VillageCommunityAttrs> {
	let board = false,
		inbox = false;
	let selected: AgoraProposal | undefined;
	let helper: string | undefined;
	let previous: number | undefined;
	let request = 0;
	let gain = 0,
		timer: ReturnType<typeof setTimeout> | undefined;
	function close(a: VillageCommunityAttrs) {
		board = inbox = false;
		selected = undefined;
		helper = undefined;
		a.onPause(false);
	}

	return {
		oninit: ({ attrs: a }) => {
			if (!a.source) listenToDeliberation(a.session.sessionId, a.userId);
			previous = a.points;
		},
		onbeforeupdate: ({ attrs: a }) => {
			if ((a.boardRequest ?? 0) !== request) {
				request = a.boardRequest ?? 0;
				board = true;
				inbox = false;
				selected = undefined;
				helper = undefined;
				a.onPause(true);
			}
			if (a.points !== undefined && previous !== undefined && a.points > previous) {
				gain = a.points - previous;
				playCoin();
				clearTimeout(timer);
				timer = setTimeout(() => {
					gain = 0;
					m.redraw();
				}, 2200);
			}
			previous = a.points;
		},
		onupdate: ({ attrs: a }) => {
			if (!a.source) listenToDeliberation(a.session.sessionId, a.userId);
		},
		onremove: () => clearTimeout(timer),
		view({ attrs: a }) {
			const data = a.source ?? {
				notes: stationNotes,
				threads: getOwnerThreads,
				messages: getThreadMessages,
				unread: threadUnreadCount,
				renderThread: (props: ThreadChatAttrs) => m(ThreadChat, props),
			};
			const item = a.plan[a.viewingIndex];
			const notes = item ? data.notes(item) : [];
			const stationItems = item
				? a.plan.slice(0, a.currentIndex + 1).filter((p) => villagePlace(p) === villagePlace(item))
				: [];
			if (selected)
				selected = notes.find((n) => n.statementId === selected?.statementId) ?? selected;
			const seen = new Set<string>();
			const alerts = a.plan.slice(0, a.currentIndex + 1).flatMap((station) =>
				data.notes(station).flatMap((note) => {
					if (seen.has(note.statementId)) return [];
					seen.add(note.statementId);
					const threads =
						note.creatorId === a.userId
							? [...data.threads(note.statementId)]
							: [[a.userId, data.messages(note.statementId, a.userId)] as const];

					return threads.flatMap(([uid, messages]) => {
						const count = data.unread(
							createAgoraThreadKey(note.statementId, uid),
							messages,
							a.userId,
						);

						return count ? [{ station, note, uid, count }] : [];
					});
				}),
			);
			const show = () => {
				board = true;
				inbox = false;
				selected = undefined;
				helper = undefined;
				a.onPause(true);
			};

			return m('.village-community', [
				m(
					'.village-coins',
					{ 'aria-label': `המטבעות שלי: ${a.points ?? 0}`, 'aria-live': 'polite' },
					[
						m('img', { src: '/assets/gold-coin.svg', alt: '' }),
						m('strong', a.points?.toLocaleString('he-IL') ?? '…'),
						gain ? m('span.village-coins__gain', `+${gain}`) : null,
					],
				),
				m(
					'button.village-feedback',
					{
						onclick: () => {
							inbox = true;
							board = true;
							selected = undefined;
							helper = undefined;
							a.onPause(true);
						},
					},
					`✉ תגובות אליי${alerts.length ? ` · ${alerts.reduce((n, r) => n + r.count, 0)}` : ''}`,
				),
				m('button.village-board-open', { onclick: show }, 'לוח הפתקים · קריאה ותגובות'),
				board
					? m(
							'.village-community__panel',
							{ role: 'dialog', 'aria-label': 'לוח הפתקים', 'aria-modal': 'true' },
							[
								m('header', [
									m('h2', inbox ? 'תגובות שמחכות לך' : item ? planItemLabel(item) : 'לוח הפתקים'),
									m('button.btn.btn--secondary', { onclick: () => close(a) }, 'חזרה לכפר'),
								]),
								!inbox && !selected && item && stationItems.length > 1
									? m(
											'nav.village-board-tabs',
											{ 'aria-label': 'שאלות בתחנה' },
											a.plan
												.slice(0, a.currentIndex + 1)
												.filter((p) => villagePlace(p) === villagePlace(item))
												.map((p) =>
													m(
														'button.btn.btn--secondary.btn--sm',
														{
															'aria-pressed': p.itemId === item.itemId,
															onclick: () => a.navigate(p.itemId),
														},
														p.title || planItemLabel(p),
													),
												),
										)
									: null,
								inbox
									? [
											alerts.length ? null : m('p', 'אין תגובות חדשות כרגע.'),
											...alerts.map((r) =>
												m(
													'button.village-note',
													{
														onclick: () => {
															a.navigate(r.station.itemId);
															inbox = false;
															selected = r.note;
															helper = r.uid;
														},
													},
													[
														m('strong', planItemLabel(r.station)),
														m('p', r.note.statement),
														m('span', `${r.count} תגובות חדשות · לפתיחת הפתק`),
													],
												),
											),
										]
									: selected && helper
										? data.renderThread({
												canEditProposal: getDeliberationState().proposals.some(
													(p) => p.statementId === selected?.statementId,
												),
												session: a.session,
												proposal: selected,
												helperUid: helper,
												role: selected.creatorId === a.userId ? 'owner' : 'helper',
												userId: a.userId,
												anonName: a.anonName,
												proposalNumber: Math.max(
													1,
													notes.findIndex((n) => n.statementId === selected?.statementId) + 1,
												),
												onBack: () => {
													helper = undefined;
													selected = undefined;
												},
											})
										: selected
											? [
													m(
														'button.btn.btn--secondary',
														{
															onclick: () => {
																selected = undefined;
															},
														},
														'חזרה ללוח',
													),
													m('h3', 'הפתק שלי'),
													m('p', selected.statement),
													data.threads(selected.statementId).size
														? [...data.threads(selected.statementId)].map(([uid, messages], i) =>
																m(
																	'button.village-note',
																	{
																		onclick: () => {
																			helper = uid;
																		},
																	},
																	[
																		`שיחה ${i + 1}`,
																		m('p', messages[messages.length - 1]?.statement),
																		'קריאה, תגובה ותודה',
																	],
																),
															)
														: m('p', 'עדיין לא התקבלו תגובות לפתק שלך.'),
												]
											: m(
													'.village-notes',
													notes.length
														? notes.map((note, i) =>
																m(
																	'button.village-note',
																	{
																		style: {
																			background:
																				note.creatorId === a.userId
																					? '#fff'
																					: ['#f5dfce', '#dcebd6', '#dce5f4', '#eedcf1'][i % 4],
																		},
																		onclick: () => {
																			selected = note;
																			helper = note.creatorId === a.userId ? undefined : a.userId;
																		},
																	},
																	[
																		m(
																			'strong',
																			note.creatorId === a.userId ? 'הפתק שלי' : `פתק ${i + 1}`,
																		),
																		m('p', note.statement),
																		m(
																			'span',
																			note.creatorId === a.userId
																				? 'קריאת התגובות שלי'
																				: 'קריאה והצעת שיפור',
																		),
																	],
																),
															)
														: m(
																'p',
																'הפתקים שתכתבו בתחנה יופיעו כאן. חזרו לתחנה כדי לכתוב את שלכם.',
															),
												),
							],
						)
					: null,
			]);
		},
	};
}
