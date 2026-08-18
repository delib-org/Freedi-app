import m from 'mithril';
import { on } from './events';
import { db, doc, collection, query, where, onSnapshot, updateDoc, Unsubscribe } from './firebase';
import {
	Collections,
	NotificationTriggerType,
	SourceApp,
	ChallengePhase,
	ChallengeResolvedBy,
} from '@freedi/shared-types';
import { AGORA_POINTS } from '@freedi/shared-types';
import { t } from './i18n';
import { celebrate } from './celebration';
import { requestHelpedFocus, requestMineFocus } from './helpedFocus';
import { addInboxItem, type InboxTarget } from './inbox';
import { inBridgeZone, standings } from './boardGeometry';
import { isAgoraTrigger } from './notificationCopy';
import { playCheer } from './sound';
import { getDeliberationState, isSuggestionKind, isSystemKind } from './proposals';
import { editClock } from './improvementSignals';
import { getSessionState } from './session';
import { getVotingState } from './voting';

export interface AgoraToast {
	notificationId: string;
	triggerType: string;
	text: string;
	/** What this news is ABOUT — the toast walks there when pressed */
	target?: InboxTarget;
}

const toasts: AgoraToast[] = [];
let unsubscribe: Unsubscribe | null = null;
let listeningUserId = '';

export function getToasts(): readonly AgoraToast[] {
	return toasts;
}

export function dismissToast(notificationId: string): void {
	const timer = timers.get(notificationId);
	if (timer) clearTimeout(timer);
	timers.delete(notificationId);
	held.delete(notificationId);
	const index = toasts.findIndex((toast) => toast.notificationId === notificationId);
	if (index >= 0) toasts.splice(index, 1);
	// Local toasts have no Firestore doc behind them
	if (!notificationId.startsWith('local--')) {
		updateDoc(doc(db, Collections.inAppNotifications, notificationId), {
			read: true,
			readAt: Date.now(),
		}).catch((error: unknown) => {
			console.error('[Notifications] Marking read failed:', error);
		});
	}
	m.redraw();
}

const TOAST_AUTO_DISMISS_MS = 6000;
/**
 * An actionable toast IS the loop's next step, so it gets a longer leash.
 * Six seconds is enough to read a line, not to tab to it and press it.
 */
const TOAST_ACTION_DISMISS_MS = 12000;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Toasts the pointer or keyboard focus is currently resting on */
const held = new Set<string>();

function armDismiss(notificationId: string, triggerType: string, target?: InboxTarget): void {
	const existing = timers.get(notificationId);
	if (existing) clearTimeout(existing);
	timers.set(
		notificationId,
		setTimeout(
			() => {
				timers.delete(notificationId);
				// Hovered or focused right now: the countdown is spent, but taking
				// the toast away under the user's cursor would be worse
				if (held.has(notificationId)) return;
				dismissToast(notificationId);
			},
			// A toast that LEADS somewhere is the loop's next step, so it gets a
			// longer leash. Nothing is lost when it goes either way now: every
			// toast is also filed in the inbox, which is the whole point of it.
			target ? TOAST_ACTION_DISMISS_MS : TOAST_AUTO_DISMISS_MS,
		),
	);
}

/** Pointer/focus entered an actionable toast — freeze its auto-dismiss */
export function holdToast(notificationId: string): void {
	held.add(notificationId);
}

/** Pointer/focus left — dismiss now if the countdown already elapsed */
export function releaseToast(notificationId: string): void {
	held.delete(notificationId);
	if (!timers.has(notificationId)) dismissToast(notificationId);
}

let localToastCounter = 0;

/**
 * A student mid-sentence is doing the single most valuable thing in the game,
 * and a toast sliding in over the composer is how that sentence gets lost. So
 * while a text box has focus the queue holds, and flushes the moment the
 * student looks up.
 *
 * Queued, never dropped: the news is still true a few seconds later, and
 * silently discarding it would make the signal unreliable in exactly the
 * moments the game most wants it heard.
 */
const queued: Array<{ trigger: string; target?: InboxTarget }> = [];

function isTyping(): boolean {
	const active = document.activeElement;
	if (!active) return false;
	const tag = active.tagName;

	return (
		tag === 'TEXTAREA' || tag === 'INPUT' || (active as HTMLElement).isContentEditable === true
	);
}

function flushQueuedToasts(): void {
	if (isTyping()) return;
	while (queued.length > 0) {
		const entry = queued.shift();
		if (entry) showToast(entry.trigger, entry.target);
	}
	m.redraw();
}

if (typeof document !== 'undefined') {
	// `focusout` rather than `blur`: blur does not bubble, so one listener
	// cannot cover composers that mount and unmount all game long
	document.addEventListener('focusout', () => {
		// A beat, so a tab BETWEEN two inputs is not read as looking up
		setTimeout(flushQueuedToasts, 150);
	});
}

function showToast(triggerType: string, target?: InboxTarget): void {
	const toast: AgoraToast = {
		notificationId: `local--${++localToastCounter}`,
		triggerType,
		text: '',
		target,
	};
	toasts.push(toast);
	armDismiss(toast.notificationId, triggerType, target);
}

/** Client-detected event → toast, without a backing notification doc */
export function pushLocalToast(triggerType: string, target?: InboxTarget): void {
	if (isTyping()) {
		queued.push({ trigger: triggerType, target });

		return;
	}
	showToast(triggerType, target);
	m.redraw();
}

/**
 * The collaboration loop's "come back" signal: when a proposal I sent a
 * suggestion on gets edited, toast me. Watermarked per session in
 * sessionStorage; the first observation of a proposal initializes silently
 * so fresh tabs don't replay history.
 * (Called from the proposals statements listener — the proposals ↔
 * notifications import cycle is call-time-only and benign.)
 */
/**
 * Subscribe the notification policy to the data layer's announcements.
 *
 * These detectors used to be CALLED from inside proposals.ts's snapshot
 * handlers, which made a real import cycle and put the decision "does this
 * deserve a toast" inside the function whose job was "apply this snapshot".
 * Now the listeners announce and this file decides. Call once when the
 * deliberation listeners are attached.
 */
let detectorsSubscribed = false;

export function subscribeNotificationDetectors(): void {
	// Idempotent, because the caller is a Mithril component factory and a new
	// subscription per construction would run every detector twice — which
	// queues the same celebration twice, and a modal celebration nobody expects
	// blocks the next tap.
	if (detectorsSubscribed) return;
	detectorsSubscribed = true;

	on('statements:changed', ({ sessionId, userId }) => {
		// Close the collaboration loop: tell helpers their proposal moved
		detectHelpedImprovements(sessionId, userId);
		// ...and the mirror: a message arrived in a thread I'm part of
		detectThreadMessages(sessionId, userId);
	});

	on('scores:changed', ({ sessionId, userId, classMax }) => {
		detectClassBridgeRecord(sessionId, classMax);
		// ...and the author's own two: standing in the bridge zone, and
		// climbing past another proposal on the way there
		detectProposalMilestones(sessionId, userId);
	});

	on('challenge:changed', ({ userId, phase }) => {
		announceChallengePhase(userId, phase);
	});
}

/**
 * What a move in the challenge round is worth saying, and how loudly.
 *
 * Being handed the floor is the one moment here that stops the screen: the
 * student is about to speak in front of the class and the alternative is
 * discovering it from a neighbour. Everything else is a toast, including the
 * outcomes — the round already narrates itself on the ballot, and a modal per
 * turn would be a modal every ninety seconds.
 */
function announceChallengePhase(userId: string, phase: ChallengePhase): void {
	const game = getSessionState().session?.votingGame;
	if (!game) return;

	if (phase === ChallengePhase.floor) {
		if (game.speakerUserId !== userId) return;
		celebrate({
			message: t('celebrate.your_turn'),
			hint: t('celebrate.your_turn_hint'),
		});

		return;
	}

	if (phase === ChallengePhase.vote) {
		pushLocalToast('agora_challenge_open');

		return;
	}

	if (phase !== ChallengePhase.resolved) return;

	const outcome = game.lastOutcome;
	// A pass or a skip is not a defeat and must not be announced as one.
	if (!outcome || outcome.by !== ChallengeResolvedBy.vote) return;

	if (outcome.survived && outcome.speakerUserId === userId) {
		celebrate({
			message: t('celebrate.challenge_survived'),
			detail: outcome.challengerStatement,
			sound: 'applause',
		});
	} else {
		pushLocalToast(outcome.survived ? 'agora_challenge_survived' : 'agora_challenge_failed');
	}

	// Whoever was holding the evicted option has just lost their vote. They can
	// see the ballot lost its highlight; this says why, so it reads as a
	// consequence rather than a glitch.
	if (outcome.evictedStatementId && myVoteWasFor(outcome.evictedStatementId)) {
		pushLocalToast('agora_challenge_vote_freed');
	}
}

/**
 * Did I hold the option that just fell? Read from the voting listener's own
 * state rather than remembered here — it is the same fact, and two copies of
 * it would disagree the moment a vote landed between snapshots.
 */
function myVoteWasFor(statementId: string): boolean {
	return getVotingState().myVoteStatementId === statementId;
}

export function detectHelpedImprovements(sessionId: string, userId: string): void {
	const key = `agora_${sessionId}_helped_toastmark`;
	let marks: Record<string, number> = {};
	try {
		marks = JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, number>;
	} catch {
		// Corrupt storage — start over
	}

	const { proposals, suggestions } = getDeliberationState();
	let changed = false;
	let toastDue: InboxTarget | null = null;
	for (const proposal of proposals) {
		if (proposal.creatorId === userId) continue;
		const mine = (suggestions[proposal.statementId] ?? []).filter(
			(suggestion) => suggestion.creatorId === userId,
		);
		if (mine.length === 0) continue;
		// The owner's REAL edit time. The statement's own lastUpdate moves for
		// reasons nobody edited anything — the evaluation pipeline writes its
		// aggregates onto the proposal doc, and every child write (a suggestion,
		// a chat line, this reader's own idea) bumps it — so watermarking on it
		// announced a revision every time a classmate merely rated.
		const editedAt = editClock(proposal.statementId);
		if (editedAt === 0) continue;
		const mark = marks[proposal.statementId];
		if (mark === undefined) {
			// First sighting: remember where we are, no toast
			marks[proposal.statementId] = editedAt;
			changed = true;
		} else if (editedAt > mark) {
			marks[proposal.statementId] = editedAt;
			changed = true;
			toastDue = { kind: 'helped', proposalId: proposal.statementId };
			// The edit clock keys the item, so the same revision files once
			addInboxItem({
				id: `helped-${proposal.statementId}-${editedAt}`,
				trigger: 'agora_helped_improved',
				at: editedAt,
				target: { kind: 'helped', proposalId: proposal.statementId },
				detail: proposal.statement,
			});
		}
	}
	if (changed) sessionStorage.setItem(key, JSON.stringify(marks));
	if (toastDue) pushLocalToast('agora_helped_improved', toastDue);
}

/**
 * The OTHER half of the loop, both directions of it: a classmate left an
 * improvement (or a chat message) on MY proposal, or an owner replied in a
 * thread I started at their stall. Without this the arrival is silent — the
 * conversation lives one tab away, so a student mid-square never learns
 * someone is talking to them.
 * Same watermark discipline as above: first sighting is silent, so a fresh
 * tab doesn't replay every message already received.
 */
export function detectThreadMessages(sessionId: string, userId: string): void {
	const key = `agora_${sessionId}_received_toastmark`;
	const { proposals, suggestions } = getDeliberationState();
	const mineIds = new Set(
		proposals
			.filter((proposal) => proposal.creatorId === userId)
			.map((proposal) => proposal.statementId),
	);

	// Every message addressed to me: anything on my proposals, plus replies
	// landing in a thread keyed by MY uid at a classmate's stall
	let anySuggestionForMe = false;
	const incoming: string[] = [];
	/** The same messages, with where each one can be answered */
	const arrivals = new Map<
		string,
		{ proposalId: string; helperUid: string; text: string; idea: boolean; at: number }
	>();
	for (const [proposalId, messages] of Object.entries(suggestions)) {
		const ownerSide = mineIds.has(proposalId);
		for (const message of messages) {
			if (message.creatorId === userId) continue;
			// The system's own lines are not somebody talking: an edit already
			// has its own "the proposal you helped moved" toast, and an award
			// arrives as a celebration. Toasting them here would double-announce
			// both, in the vaguest possible words ("new message").
			if (isSystemKind(message)) continue;
			const inMyThread = (message.agoraThreadUserId ?? message.creatorId) === userId;
			if (!ownerSide && !inMyThread) continue;
			incoming.push(message.statementId);
			arrivals.set(message.statementId, {
				proposalId,
				// The helper's uid names the thread on BOTH sides: on my own
				// proposal it is whoever wrote, at a classmate's stall it is me
				helperUid: message.agoraThreadUserId ?? message.creatorId,
				text: message.statement,
				idea: ownerSide && isSuggestionKind(message),
				at: message.createdAt,
			});
			if (ownerSide && isSuggestionKind(message)) {
				anySuggestionForMe = true;
			}
		}
	}
	// Nothing can have arrived yet — and writing a watermark now would make
	// the FIRST real message look like replayed history
	if (mineIds.size === 0 && incoming.length === 0) return;

	const stored = sessionStorage.getItem(key);
	let seen: string[] = [];
	try {
		seen = JSON.parse(stored ?? '[]') as string[];
	} catch {
		// Corrupt storage — start over
	}
	const seenSet = new Set(seen);
	const fresh = incoming.filter((id) => !seenSet.has(id));
	const freshSet = new Set(fresh);
	const freshSuggestionForMe =
		anySuggestionForMe &&
		[...mineIds].some((proposalId) =>
			(suggestions[proposalId] ?? []).some(
				(message) => freshSet.has(message.statementId) && isSuggestionKind(message),
			),
		);

	// The watermark is written on EVERY pass, including the empty one right
	// after I propose. Writing it only when messages exist made the first
	// arrival its own "first sighting" — and therefore silent, forever.
	sessionStorage.setItem(key, JSON.stringify(incoming));
	if (stored === null || fresh.length === 0) return;

	// The box gets a line per MESSAGE — one row per thing somebody said, each
	// pointing at the conversation it was said in. The toast below still fires
	// once per pass; it is an interruption, and three of them is a pile-up.
	for (const id of fresh) {
		const arrival = arrivals.get(id);
		if (!arrival) continue;
		addInboxItem({
			id,
			trigger: arrival.idea ? 'agora_suggestion_received' : 'agora_thread_message',
			at: arrival.at,
			target: {
				kind: 'thread',
				proposalId: arrival.proposalId,
				helperUid: arrival.helperUid,
			},
			detail: arrival.text,
		});
	}

	// One toast per pass: an improvement idea on my proposal is the loop's
	// actionable moment; everything else is conversation. Either way it now
	// points at the exact conversation rather than at the workshop in general
	// — the newest arrival is the one the student is being told about.
	const newest = fresh
		.map((id) => arrivals.get(id))
		.filter((arrival): arrival is NonNullable<typeof arrival> => arrival !== undefined)
		.sort((a, b) => b.at - a.at)[0];
	pushLocalToast(
		freshSuggestionForMe ? 'agora_suggestion_received' : 'agora_thread_message',
		newest
			? { kind: 'thread', proposalId: newest.proposalId, helperUid: newest.helperUid }
			: { kind: 'mine' },
	);
}

/**
 * Where a server-sent piece of news leads. The helper's rewards point back at
 * the proposal that earned them (re-read it, weigh it again); the author's
 * point at their own workshop; a decline points at the market, because its
 * next step is another stall.
 */
function serverNewsTarget(trigger: string, proposalId?: string): InboxTarget {
	if (trigger === NotificationTriggerType.AGORA_SUGGESTION_DECLINED) return { kind: 'market' };
	if (
		proposalId &&
		(trigger === NotificationTriggerType.AGORA_SUGGESTION_THANKED ||
			trigger === NotificationTriggerType.AGORA_SUGGESTION_ACCEPTED ||
			trigger === NotificationTriggerType.AGORA_SUGGESTION_IMPLEMENTED)
	) {
		return { kind: 'helped', proposalId };
	}

	return { kind: 'mine' };
}

function fileServerNews(data: {
	notificationId?: string;
	triggerType?: string;
	statementId?: string;
	parentId?: string;
	pointsAwarded?: number;
	createdAt?: number;
}): void {
	if (!data.notificationId || !data.triggerType) return;
	const suggestion = Object.values(getDeliberationState().suggestions)
		.flat()
		.find((candidate) => candidate.statementId === data.statementId);
	addInboxItem({
		id: data.notificationId,
		trigger: data.triggerType,
		at: data.createdAt ?? Date.now(),
		target: serverNewsTarget(data.triggerType, data.parentId),
		detail: suggestion?.statement,
	});
}

/** Listen to this user's unread agora notifications and surface them as toasts */
export function listenToNotifications(userId: string): void {
	if (listeningUserId === userId) return;
	stopNotifications();
	listeningUserId = userId;

	unsubscribe = onSnapshot(
		query(
			collection(db, Collections.inAppNotifications),
			where('userId', '==', userId),
			where('sourceApp', '==', SourceApp.AGORA),
			where('read', '==', false),
		),
		(snapshot) => {
			snapshot.docChanges().forEach((change) => {
				if (change.type !== 'added') return;
				const data = change.doc.data() as {
					notificationId?: string;
					triggerType?: string;
					text?: string;
					statementId?: string;
					parentId?: string;
					pointsAwarded?: number;
					bridgingTier?: number;
					createdAt?: number;
				};
				if (!data.notificationId) return;
				// The shared pipeline's generic twins (statement_reply, tagged
				// sourceApp agora) say nothing the game's own detectors have not
				// already said better — see isAgoraTrigger
				if (!isAgoraTrigger(data.triggerType)) return;

				const notificationId = data.notificationId;
				// Every server-sent reward or answer is filed before it is
				// SHOWN: celebrations are modal and one-shot, so without this a
				// student who pressed Escape had no way back to what happened.
				fileServerNews(data);
				const markRead = (): void => {
					updateDoc(doc(db, Collections.inAppNotifications, notificationId), {
						read: true,
						readAt: Date.now(),
					}).catch((error: unknown) => {
						console.error('[Notifications] Marking read failed:', error);
					});
				};

				// A thank-you, an accepted or a woven-in improvement deserves
				// glitter, not a toast: pop the celebration with the suggestion
				// text (already in the local deliberation state) and mark the
				// notification read. The thank-you is the whole positive answer
				// the places UI offers now, so it is a reward moment like the rest.
				if (
					data.triggerType === NotificationTriggerType.AGORA_SUGGESTION_THANKED ||
					data.triggerType === NotificationTriggerType.AGORA_SUGGESTION_ACCEPTED ||
					data.triggerType === NotificationTriggerType.AGORA_SUGGESTION_IMPLEMENTED
				) {
					const suggestion = Object.values(getDeliberationState().suggestions)
						.flat()
						.find((candidate) => candidate.statementId === data.statementId);
					const thanked = data.triggerType === NotificationTriggerType.AGORA_SUGGESTION_THANKED;
					const implemented =
						data.triggerType === NotificationTriggerType.AGORA_SUGGESTION_IMPLEMENTED;
					// "Woven in" means the TEXT CHANGED — the improvement loop
					// closes only if the suggester re-reads and re-rates it. The
					// celebration carries that next step; parentId is the proposal.
					const proposalId = data.parentId;
					// The number comes from the SERVER, never from a hardcoded
					// string: past the collusion cap a weave is celebrated with no
					// points attached, and retuning AGORA_POINTS can't make copy lie.
					const awarded = data.pointsAwarded ?? 0;
					celebrate({
						message: thanked
							? t('celebrate.suggestion_thanked', { n: awarded })
							: implemented
								? awarded > 0
									? t('celebrate.suggestion_implemented', { n: awarded })
									: t('celebrate.suggestion_implemented_capped')
								: t('celebrate.suggestion_accepted', { n: awarded }),
						detail: suggestion?.statement,
						// Accept is the promise, not the payoff. Saying what comes
						// next turns the wait for "+2" into anticipation instead of
						// an invisible state — and teaches the ladder when it lands.
						// A thank-you IS the payoff — it promises nothing further.
						hint:
							implemented || thanked
								? undefined
								: t('celebrate.accepted_hint', { n: AGORA_POINTS.SUGGESTION_IMPLEMENTED }),
						action:
							implemented && proposalId
								? {
										label: t('celebrate.see_improved'),
										run: () => {
											requestHelpedFocus(proposalId);
										},
									}
								: undefined,
					});
					markRead();

					return;
				}

				// The AUTHOR's own rewards. Both used to be paid in total silence:
				// a student could bridge the two camps, or write the opening draft
				// the whole lesson runs on, and never learn anything happened.
				if (
					data.triggerType === NotificationTriggerType.AGORA_BRIDGING_ACHIEVED ||
					data.triggerType === NotificationTriggerType.AGORA_PROPOSAL_CREDITED
				) {
					const bridging = data.triggerType === NotificationTriggerType.AGORA_BRIDGING_ACHIEVED;
					const awarded = data.pointsAwarded ?? 0;
					celebrate({
						message: bridging
							? (data.bridgingTier ?? 1) >= 2
								? t('celebrate.bridging_full', { n: awarded })
								: t('celebrate.bridging_reached', { n: awarded })
							: t('celebrate.proposal_credited', { n: awarded }),
						hint: bridging ? t('celebrate.bridging_hint') : t('celebrate.proposal_credited_hint'),
						// Bridging arrives while you are off rating classmates, so it
						// offers the trip back to your proposal. The first-proposal
						// credit fires the instant you submit — you are already
						// standing in the workshop, so a "go to your workshop" button
						// would just be a second close button wearing a costume.
						action: bridging
							? {
									label: t('celebrate.see_my_proposal'),
									run: () => {
										requestMineFocus();
									},
								}
							: undefined,
					});
					markRead();

					return;
				}

				// The author revised after real feedback. FIRST credited revision →
				// the full celebration (process praise for the game's hardest
				// move); later ones → a quiet +1 toast. Ineligible saves get
				// nothing here at all — the server only writes this notification
				// when the revision earned it, which is what keeps the
				// celebration channel honest.
				if (data.triggerType === NotificationTriggerType.AGORA_REVISION_CREDITED) {
					const awarded = data.pointsAwarded ?? 0;
					const first = (data as { agoraFirstRevision?: boolean }).agoraFirstRevision === true;
					if (first) {
						celebrate({
							message: t('celebrate.revision_first', { n: awarded }),
							hint: t('celebrate.revision_first_hint'),
						});
					} else {
						pushLocalToast('agora_revision_credited');
					}
					markRead();

					return;
				}

				// The weave: a revision that followed a thank paid the author for
				// the editorial labor of working a classmate's idea in. The idea
				// is credited, never the helper's name next to a number.
				if (data.triggerType === NotificationTriggerType.AGORA_WEAVE_CREDITED) {
					celebrate({
						message: t('celebrate.weave_credited', { n: data.pointsAwarded ?? 0 }),
					});
					markRead();

					return;
				}

				if (toasts.some((toast) => toast.notificationId === data.notificationId)) return;
				const toast: AgoraToast = {
					notificationId: data.notificationId,
					triggerType: data.triggerType ?? '',
					text: data.text ?? '',
					// The same target its inbox row got — a decline leads back to the
					// market, everything else to my own workshop. Without this the
					// server's toasts were the only ones that led nowhere.
					target: serverNewsTarget(data.triggerType ?? '', data.parentId),
				};
				toasts.push(toast);
				armDismiss(toast.notificationId, toast.triggerType, toast.target);
			});
			m.redraw();
		},
		(error) => {
			console.error('[Notifications] Listener failed:', error);
		},
	);
}

export function stopNotifications(): void {
	if (unsubscribe) unsubscribe();
	unsubscribe = null;
	listeningUserId = '';
	toasts.length = 0;
	timers.forEach((timer) => clearTimeout(timer));
	timers.clear();
	held.clear();
}

/**
 * The COLLECTIVE moment. Every other celebration in the game is personal;
 * this one fires for the whole class when the strongest bridge on the square
 * beats its own record — the shared outcome the class score is actually
 * built on (it averages everyone's points), which no student ever sees
 * happen live.
 *
 * Watermarked in sessionStorage like the other detectors: the first sighting
 * is silent, so opening a tab mid-lesson doesn't replay the whole climb.
 * Only real jumps announce themselves, so it stays an event, not a ticker.
 */
export function detectClassBridgeRecord(sessionId: string, classMax: number): void {
	if (classMax <= 0) return;
	const key = `agora_${sessionId}_bridgerecord`;
	const stored = sessionStorage.getItem(key);
	if (stored === null) {
		sessionStorage.setItem(key, String(classMax));

		return;
	}
	const previous = Number(stored);
	if (classMax <= previous + CLASS_RECORD_MIN_JUMP) return;
	sessionStorage.setItem(key, String(classMax));
	// No target: a class record is the square's own news, not an errand
	addInboxItem({
		id: `record-${Math.round(classMax)}`,
		trigger: 'agora_class_record',
	});
	pushLocalToast('agora_class_record');
}

/**
 * A record has to MEAN something. One point of drift on a fresh rating
 * would otherwise toast the whole class every few seconds.
 */
const CLASS_RECORD_MIN_JUMP = 5;

/**
 * The author's own two milestones on the class map, watched wherever they are
 * standing — the board is a tab, and the moment a classmate's rating lands is
 * not a moment anyone is watching a chart.
 *
 * Both are MONOTONIC (best-ever, not current): a proposal that later slips out
 * of the zone or down a rank is told nothing at all. The game never uses a
 * student's own high-water mark to point out that they have fallen.
 */
export function detectProposalMilestones(sessionId: string, userId: string): void {
	const { proposals, scores } = getDeliberationState();
	const mine = proposals.find((proposal) => proposal.creatorId === userId);
	if (!mine) return;
	const score = scores[mine.statementId];
	if (!score?.classConsensus) return;

	// ---- 1. The bridge zone: the goal, made into a place on the map ----
	const zoneKey = `agora_${sessionId}_zone`;
	if (inBridgeZone(score) && !sessionStorage.getItem(zoneKey)) {
		sessionStorage.setItem(zoneKey, '1');
		addInboxItem({
			id: `zone-${mine.statementId}`,
			trigger: 'agora_bridge_zone',
			target: { kind: 'mine' },
			detail: mine.statement,
		});
		celebrate({
			message: t('celebrate.bridge_zone'),
			detail: mine.statement,
			hint: t('celebrate.bridge_zone_hint'),
			sound: 'applause',
		});
	}

	// ---- 2. Climbing past another proposal ----
	// Rank alone would cheer a student for standing still while somebody
	// else's proposal fell. The climb has to be THEIRS: the reading has to
	// have risen too, or nothing is said.
	const board = standings(proposals, scores);
	const here = board.find((entry) => entry.statementId === mine.statementId);
	if (!here) return;
	const rankKey = `agora_${sessionId}_bestrank`;
	const percentKey = `agora_${sessionId}_bestpercent`;
	const bestRank = Number(sessionStorage.getItem(rankKey) ?? '0');
	const bestPercent = Number(sessionStorage.getItem(percentKey) ?? '-101');
	// First sighting is silent — arriving on the board is not a climb
	if (bestRank === 0) {
		sessionStorage.setItem(rankKey, String(here.rank));
		sessionStorage.setItem(percentKey, String(here.percent));

		return;
	}
	const climbed = here.rank < bestRank && here.percent > bestPercent;
	if (here.percent > bestPercent) sessionStorage.setItem(percentKey, String(here.percent));
	if (here.rank < bestRank) sessionStorage.setItem(rankKey, String(here.rank));
	if (!climbed) return;

	const passed = bestRank - here.rank;
	addInboxItem({
		id: `climb-${mine.statementId}-${here.rank}`,
		trigger: 'agora_climbed',
		target: { kind: 'mine' },
		detail: mine.statement,
	});
	// A toast, not a modal: a climb is the smaller moment, and it happens
	// often enough that stopping the game for it would wear out fast
	pushLocalToast('agora_climbed', { kind: 'mine' });
	playCheer();
	console.info(`[Agora] proposal climbed past ${passed} to rank ${here.rank}`);
}
