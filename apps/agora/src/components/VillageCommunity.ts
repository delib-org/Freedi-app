import { Inbox } from './Inbox';
import type { InboxTarget } from '../lib/inbox';
import { registerPresentationNavigator, unregisterPresentationNavigator } from '../lib/helpedFocus';
import m from 'mithril';
import { canWriteStage } from '../lib/flows/stageAccess';
import {
	AGORA_ROUND,
	AgoraMessageKind,
	AgoraStage,
	isUnitRating,
	roundSpecOf,
	type AgoraSession,
	type AgoraStagePlanItem,
	type AgoraTopicPackage,
	type AgoraUnitRating,
} from '@freedi/shared-types';
import {
	getDeliberationState,
	getOwnerThreads,
	getThreadMessages,
	likeStatement,
	listenToDeliberation,
	rateStatement,
	type AgoraProposal,
} from '../lib/proposals';
import { threadUnreadCount } from '../lib/seenState';
import { noteNews, threadNews, type NoteNewsSource } from '../lib/flows/noteNews';
import { ThreadChat, type ThreadChatAttrs } from '../views/ThreadChat';
import { planItemLabel } from './StageNav';
import { iconLabel } from './Icon';
import { villagePlace } from '../lib/flows/villageRoute';
import { playCoin } from '../lib/sound';
import { t, tCount } from '../lib/i18n';
import { RateScale } from './RateScale';
import { LikeButton } from './LikeButton';
import { UnitScale } from './UnitScale';
import { ResultsBoard } from './ResultsBoard';
import { HelpersBoard } from './HelpersBoard';
import { countThanks, ResultsSwitch, type ResultsTab } from './ResultsSwitch';
import { getConsensusPool, getSessionState } from '../lib/session';
import { boardPercent } from '../lib/boardGeometry';

export interface VillageCommunitySource extends NoteNewsSource {
	notes: (item: AgoraStagePlanItem) => AgoraProposal[];
	renderThread: (attrs: ThreadChatAttrs) => m.Children;
}
/** The live deliberation's conversations — the board and the bar's badge count from the same place */
export const liveNoteNews: NoteNewsSource = {
	threads: getOwnerThreads,
	messages: getThreadMessages,
	unread: threadUnreadCount,
};
/**
 * "N new" on a card or a conversation row. Pink — the notification colour,
 * never a camp hue and never danger-red: a classmate writing back is the
 * friendliest event in the game. One label for the whole chip, so a screen
 * reader hears "3 new messages" and not an icon plus a number.
 */
function newsChip(n: number): m.Children {
	if (n <= 0) return null;
	const label = tCount('delib.thread_unread', n);

	return m(
		'span.village-note__chip',
		{ role: 'img', 'aria-label': label, title: label },
		iconLabel('talk', String(n)),
	);
}
/** What the scoreboard panel needs beyond the live deliberation state */
export interface VillageScoreboard {
	topic: AgoraTopicPackage;
	leadStatementId?: string;
	/** The teacher narrowed the board to the goal */
	goalOnly: boolean;
}
export interface VillageCommunityAttrs {
	source?: VillageCommunitySource;
	boardRequest?: number;
	scoreboardRequest?: number;
	/** Bumped by the shell when the room moves on: close any open board */
	closeRequest?: number;
	scoreboard?: VillageScoreboard;
	session: AgoraSession;
	userId: string;
	anonName: string;
	points?: number;
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	viewingIndex: number;
	navigate: (itemId: string) => void;
	onPause: (paused: boolean) => void;
	onPanelChange?: (panel: 'none' | 'notes' | 'scoreboard') => void;
	/** Take the student to the table to edit their own note (the board is for reading and rating) */
	onEditMine?: () => void;
	/**
	 * The teacher's private thread, pinned inside the post box. It used to be
	 * a megaphone of its own in the stage strip — two mail icons on one
	 * screen, each holding half the post.
	 */
	teacher?: { label: string; unread: number; onOpen: () => void };
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
	type Panel = 'none' | 'notes' | 'scoreboard';
	let panel: Panel = 'none';
	let selected: AgoraProposal | undefined;
	let helper: string | undefined;
	let previous: number | undefined;
	let request = 0;
	let scoreboardSeen = 0;
	let closeSeen = 0;
	let resultsTab: ResultsTab = 'class';
	let gain = 0,
		timer: ReturnType<typeof setTimeout> | undefined;
	/** Notes whose rating is in flight, and the failed ones — same latch as the round stage */
	const rating = new Set<string>();
	const rateFailed = new Set<string>();
	function close(a: VillageCommunityAttrs) {
		panel = 'none';
		selected = undefined;
		helper = undefined;
		a.onPanelChange?.(panel);
		a.onPause(false);
	}
	function open(a: VillageCommunityAttrs, next: Panel) {
		panel = next;
		selected = undefined;
		helper = undefined;
		a.onPanelChange?.(panel);
		a.onPause(true);
	}

	let current: VillageCommunityAttrs;
	function navigateNews(target: InboxTarget): boolean {
		if (target.kind === 'teacher') return false;
		const a = current;
		const notesFor = a.source?.notes ?? stationNotes;
		const station = a.plan
			.slice(0, a.currentIndex + 1)
			.find((p) =>
				notesFor(p).some((n) =>
					'proposalId' in target
						? n.statementId === target.proposalId
						: target.kind === 'mine'
							? n.creatorId === a.userId
							: true,
				),
			);
		if (!station) return false;
		a.navigate(station.itemId);
		panel = 'notes';

		helper = undefined;
		selected = undefined;
		if ('proposalId' in target) {
			selected = notesFor(station).find((n) => n.statementId === target.proposalId);
			helper =
				target.kind === 'thread'
					? target.helperUid
					: selected?.creatorId === a.userId
						? undefined
						: a.userId;
		}
		a.onPanelChange?.(panel);
		a.onPause(true);
		m.redraw();

		return true;
	}

	/**
	 * A round's own answer: a like on a story, a 0…1 step on a need or a
	 * vision — the same writes the classic round stage makes, so the author
	 * is paid the same appreciation credit.
	 */
	async function weigh(
		session: AgoraSession,
		parentId: string,
		statementId: string,
		value: AgoraUnitRating | 'like' | 'unlike',
	): Promise<void> {
		if (rating.has(statementId)) return;
		rating.add(statementId);
		rateFailed.delete(statementId);
		m.redraw();
		try {
			if (value === 'like' || value === 'unlike') {
				await likeStatement(session, parentId, statementId, value === 'like');
			} else {
				await rateStatement(session, parentId, statementId, value);
			}
		} catch (error) {
			console.error('[Village] Weighing a note failed:', error);
			rateFailed.add(statementId);
		} finally {
			rating.delete(statementId);
			m.redraw();
		}
	}

	/**
	 * The rating control for a classmate's note — exactly what the classic
	 * screen for this item would show, so every rating credit, appreciation
	 * point and bridging score is earned in the village as it is in the
	 * classic game. Gated as there: write your own note first.
	 */
	function ratingWidget(a: VillageCommunityAttrs, item: AgoraStagePlanItem, note: AgoraProposal) {
		const state = getDeliberationState();
		const myRating = state.myRatings[note.statementId];
		if (item.stage === AgoraStage.question && item.statementId) {
			const spec = roundSpecOf(item);
			if (spec) {
				if (spec.scale === 'like') {
					return m(LikeButton, {
						liked: myRating?.value === AGORA_ROUND.LIKE,
						disabled: rating.has(note.statementId),
						onToggle: (liked) =>
							void weigh(
								a.session,
								item.statementId ?? '',
								note.statementId,
								liked ? 'like' : 'unlike',
							),
					});
				}

				return m(UnitScale, {
					ask: t(`round.${spec.kind}.unit_ask`),
					value:
						myRating !== undefined && isUnitRating(myRating.value) ? myRating.value : undefined,
					busy: rating.has(note.statementId),
					failed: rateFailed.has(note.statementId),
					onPick: (value) => void weigh(a.session, item.statementId ?? '', note.statementId, value),
				});
			}

			return m(RateScale, {
				session: a.session,
				proposalId: note.statementId,
				parentId: item.statementId,
				showCurrent: true,
			});
		}

		return m(RateScale, { session: a.session, proposalId: note.statementId, showCurrent: true });
	}

	/** Where a note stands — shown once I have weighed it, or once the stage is over */
	function standing(item: AgoraStagePlanItem, note: AgoraProposal, live: boolean): string | null {
		const state = getDeliberationState();
		const rated = state.myRatings[note.statementId] !== undefined;
		if (live && !rated) return null;
		if (item.stage === AgoraStage.question) {
			const raters = note.evaluation?.numberOfEvaluators ?? 0;
			if (raters === 0) return null;
			const spec = roundSpecOf(item);
			if (spec?.scale === 'like') return t('village.standing.likes', { n: raters });
			const mean = note.evaluation?.averageEvaluation ?? 0;

			return t('village.standing.mean', { pct: Math.round(mean * 100), n: raters });
		}
		const score = state.scores[note.statementId];
		if (!score?.classConsensus || score.classConsensus.n === 0) return null;

		return t('village.standing.consensus', {
			pct: boardPercent(score),
			n: score.classConsensus.n,
		});
	}

	return {
		oninit: ({ attrs: a }) => {
			current = a;
			registerPresentationNavigator(navigateNews);
			if (!a.source) listenToDeliberation(a.session.sessionId, a.userId);
			previous = a.points;
		},
		onbeforeupdate: ({ attrs: a }) => {
			if ((a.closeRequest ?? 0) !== closeSeen) {
				closeSeen = a.closeRequest ?? 0;
				if (panel !== 'none') close(a);
			}
			if ((a.boardRequest ?? 0) !== request) {
				request = a.boardRequest ?? 0;
				open(a, 'notes');
			}
			if ((a.scoreboardRequest ?? 0) !== scoreboardSeen) {
				scoreboardSeen = a.scoreboardRequest ?? 0;
				open(a, 'scoreboard');
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
			current = a;
			registerPresentationNavigator(navigateNews);
			if (!a.source) listenToDeliberation(a.session.sessionId, a.userId);
		},
		onremove: () => {
			clearTimeout(timer);
			unregisterPresentationNavigator(navigateNews);
		},
		view({ attrs: a }) {
			const data = a.source ?? {
				notes: stationNotes,
				...liveNoteNews,
				renderThread: (props: ThreadChatAttrs) => m(ThreadChat, props),
			};
			const item = a.plan[a.viewingIndex];
			const notes = item ? data.notes(item) : [];
			const live = !!item && canWriteStage(a.session, item.itemId);
			const mine = notes.find((n) => n.creatorId === a.userId);
			const classmates = notes.filter((note) => note.creatorId !== a.userId);
			const canRate = live && mine !== undefined && !a.source;
			const stationItems = item
				? a.plan.slice(0, a.currentIndex + 1).filter((p) => villagePlace(p) === villagePlace(item))
				: [];
			if (selected)
				selected = notes.find((n) => n.statementId === selected?.statementId) ?? selected;

			const scoreboardPanel = (): m.Children => {
				const { participants } = getSessionState();
				const { proposals, scores } = getDeliberationState();

				return [
					m('header', [
						m('h2', t('village.scoreboard.title')),
						m('button.btn.btn--secondary', { onclick: () => close(a) }, t('village.back')),
					]),
					a.scoreboard
						? [
								a.scoreboard.goalOnly
									? m('p.village-scoreboard__mode', t('village.scoreboard.goal_only'))
									: null,
								m(ResultsSwitch, {
									tab: resultsTab,
									thanks: countThanks(participants),
									onTab: (next: ResultsTab) => {
										resultsTab = next;
									},
								}),
								resultsTab === 'helpers'
									? m(HelpersBoard, { participants, userId: a.userId })
									: m(ResultsBoard, {
											sessionId: a.session.sessionId,
											topic: a.scoreboard.topic,
											proposals: proposals.filter((p) => !p.hidden),
											scores,
											census: getConsensusPool(),
											userId: a.userId,
											leadStatementId: a.scoreboard.leadStatementId,
											onlyScored: a.scoreboard.goalOnly,
										}),
							]
						: m('p', t('village.scoreboard.not_started')),
				];
			};

			/** The conversations on my note, one row each, the ones with news flagged */
			const ownerThreads = (note: AgoraProposal): m.Children => {
				const threads = [...data.threads(note.statementId)];
				if (threads.length === 0) return m('p', t('village.note.no_replies'));

				return threads.map(([uid, messages], i) => {
					const news = threadNews(data, note.statementId, uid, a.userId, messages);
					const name = messages.find((message) => message.creatorId === uid)?.anonName;
					const preview = [...messages]
						.reverse()
						.find(
							(message) =>
								!message.hidden &&
								message.statement.trim() &&
								message.agoraMessageKind !== AgoraMessageKind.award &&
								message.agoraMessageKind !== AgoraMessageKind.edit,
						);

					return m(
						'button.village-note.village-note--conversation',
						{
							class: news > 0 ? 'village-note--news' : undefined,
							onclick: () => {
								helper = uid;
							},
						},
						[
							m('span.village-note__head', [
								name ? t('delib.chat_with', { name }) : t('village.thread.n', { n: i + 1 }),
								newsChip(news),
							]),
							m('p.village-note__text', preview?.statement ?? t('delib.chat_empty')),
							m('span.village-note__conversation-action', t('village.thread.cta')),
						],
					);
				});
			};

			/** A note's number on this board — the same count the cards wear */
			const noteNumber = (note: AgoraProposal): number =>
				Math.max(1, notes.findIndex((n) => n.statementId === note.statementId) + 1);

			const noteCard = (note: AgoraProposal, overview = false): m.Children => {
				const own = note.creatorId === a.userId;
				const landed = own && !overview && (a.boardRequest ?? 0) > 0;
				const stand = item ? standing(item, note, live) : null;
				// Someone wrote to me here: on my note any classmate, on theirs the
				// owner answering the conversation I started
				const news = noteNews(data, note, a.userId);

				return m(
					'article.village-note',
					{
						key: note.statementId,
						class: [
							own ? 'village-note--own' : '',
							landed ? 'village-note--landed' : '',
							news > 0 ? 'village-note--news' : '',
						]
							.join(' ')
							.trim(),
						oncreate: (v: m.VnodeDOM) => {
							if (landed) (v.dom as HTMLElement).scrollIntoView({ block: 'nearest' });
						},
					},
					[
						m('.village-note__head', [
							m(
								'h3.village-note__title',
								{
									class: own ? 'village-note__ownership' : undefined,
								},
								own ? t('village.note.yours') : t('village.note.n', { n: noteNumber(note) }),
							),
							stand ? m('small.village-note__standing', stand) : null,
						]),
						m('p.village-note__text', note.statement),
						!own && canRate && item
							? m('.village-note__rate', ratingWidget(a, item, note))
							: !own && live && !mine && !a.source
								? m('small.village-note__hint', t('village.note.rate_gate'))
								: null,
						m('.village-note__actions', [
							own && live && a.onEditMine
								? m(
										'button.village-note__edit',
										{ onclick: () => a.onEditMine?.() },
										t('village.note.edit'),
									)
								: null,
							// The chip rides the button that opens the conversation, so it says
							// WHERE the news is — a card has two doors, and a chip by the
							// title could mean either
							!overview
								? m(
										'button.village-note__open',
										{
											onclick: () => {
												selected = note;
												helper = own ? undefined : a.userId;
											},
										},
										[own ? t('village.note.replies') : t('village.note.improve'), newsChip(news)],
									)
								: null,
						]),
					],
				);
			};

			return m('.village-community', [
				m(
					'.village-coins',
					{ 'aria-label': t('village.coins_aria', { n: a.points ?? 0 }), 'aria-live': 'polite' },
					[
						m('img', { src: '/assets/gold-coin.svg', alt: '' }),
						m('strong', a.points?.toLocaleString('he-IL') ?? '…'),
						gain ? m('span.village-coins__gain', `+${gain}`) : null,
					],
				),
				m('.village-inbox', m(Inbox, { pinned: a.teacher })),
				panel === 'scoreboard'
					? m(
							'.village-community__panel.village-scoreboard',
							{ role: 'region', 'aria-label': t('village.nav.results') },
							scoreboardPanel(),
						)
					: null,
				panel === 'notes'
					? m(
							'.village-community__panel.village-board',
							{ role: 'region', 'aria-label': t('village.nav.board') },
							[
								m('header', [
									m('.village-board__heading', [
										item ? m('p.village-board__context', planItemLabel(item)) : null,
										m(selected ? 'p.village-board__context' : 'h2', t('village.nav.board')),
									]),
									m('button.btn.btn--secondary', { onclick: () => close(a) }, t('village.back')),
								]),
								!selected && item && stationItems.length > 1
									? m(
											'nav.village-board-tabs',
											{ 'aria-label': t('village.station_questions') },
											stationItems.map((p) =>
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
								selected && helper
									? data.renderThread({
											// The owner changes the note from inside the conversation
											// — a proposal on the square or an answer in a question
											// booth alike (both are the author's own statement; the
											// write is the same text update the desk makes). Only a
											// closed station takes the pen away, as the card's door does.
											canEditProposal: live,
											wording: {
												mine: t('village.note.mine'),
												theirs: t('village.note.n', { n: noteNumber(selected) }),
												edit: t('village.note.edit'),
												withAuthor: t('village.thread.with_author'),
												save: t('village.note.save'),
											},
											session: a.session,
											proposal: selected,
											helperUid: helper,
											role: selected.creatorId === a.userId ? 'owner' : 'helper',
											paperLabel: t(
												selected.creatorId === a.userId
													? 'delib.thread_write_label_owner'
													: 'delib.thread_write_label',
											),
											userId: a.userId,
											anonName: a.anonName,
											proposalNumber: noteNumber(selected),
											backLabel: t(
												selected.creatorId === a.userId
													? 'village.note.replies'
													: 'village.board.back',
											),
											onBack: () => {
												helper = undefined;
												if (selected?.creatorId !== a.userId) selected = undefined;
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
													t('village.board.back'),
												),
												m('.village-board__own', noteCard(selected, true)),
												m('section.village-board__conversations', [
													m('h3.village-board__section-title', t('village.note.replies')),
													ownerThreads(selected),
												]),
											]
										: [
												live && !mine && notes.length > 0 && !a.source
													? m('p.village-board__gate', t('village.board.gate'))
													: null,
												mine ? m('section.village-board__own', noteCard(mine)) : null,
												classmates.length
													? m('section.village-board__peers', [
															m('h3.village-board__section-title', t('village.board.classmates')),
															m(
																'.village-notes',
																classmates.map((note) => noteCard(note)),
															),
														])
													: null,
												!notes.length ? m('p', t('village.board.empty')) : null,
											],
							],
						)
					: null,
			]);
		},
	};
}
