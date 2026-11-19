import m from 'mithril';
import { proposalLimitOf } from '@freedi/shared-types';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import {
	isBroadcasting,
	startBroadcast,
	stopBroadcast,
	updateBroadcastText,
} from '@/lib/liveDrafts';
import {
	changeProposal,
	newProposalId,
	sendProposal,
	type ProposalResult,
} from '@/lib/classroom/proposals';
import { clearDraft, readDraft, writeDraft } from '@/lib/classroom/c3Draft';
import { myProposals } from '@/lib/classroom/c3Logic';
import {
	otherOwnProposals,
	proposalDraftScope,
	showsOwnProposalList,
	writeTargetOf,
} from '@/lib/classroom/proposalLimit';
import { refusalReason } from '@/lib/classroom/turnMoment';
import type { FlowFeed } from './FlowFeed';
import { ErrorLine } from './ErrorLine';
import { ownProposalCards } from './ownProposalCards';
import { WriteBox, type WriteState } from './WriteBox';
import { ReplyEntry } from '../replies/ReplyEntry';
import { PushAsk } from '../replies/PushAsk';

/**
 * 'pen': the student holds the table's one pen and writes a NEW proposal; the table
 * reads the text as it is typed (W2). 'edit': the box only changes a proposal that
 * was already sent (my own card after sending, or "improve" from the replies); it
 * needs no pen and shows nothing to the table. 'any': the box follows the lesson's
 * limit, a new proposal or an edit, with no pen (the later All proposals step).
 */
export type WritePanelMode = 'pen' | 'edit' | 'any';

export interface WritePanelAttrs {
	main: Statement;
	table: ClassTable;
	feed: FlowFeed;
	uid: string;
	/** The challenge question (proposals go under it); null when the lesson has none. */
	challenge: Statement | null;
	/** The ballot is frozen: proposals can no longer change. */
	locked: boolean;
	mode: WritePanelMode;
	busy: boolean;
	/** One proposal the screen wants in the box ("Edit" on a pinned card, "improve" from the replies). */
	takeEditRequest?: () => string | null;
	/** Pen: "I want to pass" (a quiet button under Send). */
	onPass?: () => void;
	/** Pen: the holder left the screen (hidden or closed): give the pen back. */
	onRelease?: () => void;
}

class PanelState {
	scope = '';
	edit: string | undefined = undefined;
	state: WriteState = 'idle';
	sending = false;
	error: string | null = null;
	/** The id of the proposal being sent; kept for a retry so it is never written twice. */
	proposalId: string | null = null;
	/** The proposal the student chose to edit; null = the box follows the limit. */
	editId: string | null = null;
	/** The draft key the proposal box is writing under now. */
	proposalScope = '';
	/** The server said the author already holds their proposal, ahead of this phone's listener. */
	limitRefused = false;
	/** The pen's live text was started for this pen (a restored draft is shown to the table too). */
	liveStarted = false;
	/** Pen: the latest `onRelease`, called when the page is hidden or closed. */
	release: (() => void) | null = null;
	onLeave: (() => void) | null = null;
}

function ownProposalsOf(a: WritePanelAttrs): Statement[] {
	if (!a.challenge) return [];
	const id = a.challenge.statementId;

	return myProposals(
		a.feed.options.filter((o) => o.parentId === id),
		a.uid,
	);
}

/** The pen holder left the screen (the phone locked, another app, the tab closed): the pen goes back to the table. */
function leave(self: PanelState): void {
	if (isBroadcasting()) void stopBroadcast();
	self.release?.();
}

/**
 * The write box of Proposals (UX §2.6.3). In 'pen' mode (W2) it writes one new
 * proposal while the table reads it; "Send" and the quiet "I want to pass" are its
 * only controls. In 'edit' mode it changes a proposal that was already sent. A
 * send that fails keeps the draft (localStorage) and shows an inline retry.
 */
export const WritePanel: m.ClassComponent<WritePanelAttrs> = {
	oninit(vnode) {
		const self = new PanelState();
		(vnode.state as { self?: PanelState }).self = self;
		if (vnode.attrs.mode !== 'pen') return;
		// A phone that goes to the background or closes gives the pen back; this is best effort (see the Trello notes).
		self.onLeave = () => {
			if (document.visibilityState === 'hidden') leave(self);
		};
		document.addEventListener('visibilitychange', self.onLeave);
		window.addEventListener('pagehide', self.onLeave);
	},

	onremove(vnode) {
		const self = (vnode.state as { self?: PanelState }).self as PanelState;
		if (self.onLeave) {
			document.removeEventListener('visibilitychange', self.onLeave);
			window.removeEventListener('pagehide', self.onLeave);
		}
		if (isBroadcasting()) void stopBroadcast();
	},

	view(vnode) {
		const self = (vnode.state as { self?: PanelState }).self as PanelState;
		const a = vnode.attrs;
		const pen = a.mode === 'pen';
		const { uid } = a;
		const mainId = a.main.statementId;
		self.release = a.onRelease ?? null;
		const requested = pen ? null : a.takeEditRequest?.();
		if (requested) self.editId = requested;
		const limit = proposalLimitOf(a.main);
		const mine = ownProposalsOf(a);
		// A send whose answer was lost, seen arriving by the listener: it is sent, not a draft any more.
		const landed = self.proposalId
			? mine.find((p) => p.statementId === self.proposalId)
			: undefined;
		if (landed) {
			self.proposalId = null;
			if ((self.edit ?? '').trim() === landed.statement) {
				self.edit = undefined;
				clearDraft(mainId, 'proposal');
				self.state = 'idle';
			}
		}
		const newDraft =
			self.proposalScope === mainId ? (self.edit ?? '') : readDraft(mainId, 'proposal');
		// The pen writes a new proposal; the edit box changes one that was sent.
		const target = pen
			? ({ kind: 'new' } as const)
			: writeTargetOf({
					limit,
					mine,
					editId: self.editId,
					hasNewDraft: newDraft.trim() !== '',
				});
		const proposalScope = proposalDraftScope(mainId, target);
		if (proposalScope !== self.scope) {
			self.scope = proposalScope;
			self.proposalScope = proposalScope;
			self.edit = readDraft(proposalScope, 'proposal') || undefined;
			self.state = 'idle';
		}
		const limitReached =
			limit === 'one' &&
			(target.kind === 'blocked' || (self.limitRefused && target.kind === 'new'));
		const showBox = !!a.challenge && (a.mode !== 'edit' || target.kind === 'edit');
		const sentProposal = target.kind === 'edit' ? target.proposal : null;

		const valueOf = (): string => self.edit ?? sentProposal?.statement ?? '';
		const stateOf = (): WriteState => {
			if (self.state === 'sending' || self.state === 'failed' || self.state === 'refused') {
				return self.state;
			}

			return sentProposal &&
				(self.edit === undefined || self.edit.trim() === sentProposal.statement)
				? 'sent'
				: 'idle';
		};

		// The pen's text goes to the table as it is typed (W3 on their phones); a restored draft goes too.
		if (pen && !self.liveStarted && valueOf().trim() !== '') {
			self.liveStarted = true;
			if (!isBroadcasting()) void startBroadcast(valueOf());
		}
		const onInput = (text: string): void => {
			self.edit = text;
			self.state = 'idle';
			// Changed words are a new send: the server answers "sent" for a known id without writing.
			self.proposalId = null;
			writeDraft(proposalScope, 'proposal', text);
			if (!pen) return;
			self.liveStarted = true;
			if (isBroadcasting()) updateBroadcastText(text);
			else void startBroadcast(text);
		};

		const dirty = (): boolean => (self.edit ?? '').trim().length > 0 && stateOf() !== 'sent';
		const sendable = showBox && !a.locked && dirty() && !limitReached;
		const canSend = !self.sending && sendable;

		const sendOne = async (): Promise<void> => {
			const text = (self.edit ?? '').trim();
			self.state = 'sending';
			m.redraw();
			try {
				// The server checks the words first (IA 24.3): refused text is not published.
				let result: ProposalResult;
				if (sentProposal) {
					result = await changeProposal(mainId, sentProposal.statementId, text);
				} else {
					self.proposalId ??= newProposalId();
					result = await sendProposal(mainId, self.proposalId, text);
				}
				if (!result.ok) {
					// Not sent: the text stays in the box and the student writes it again.
					self.state = 'refused';
					self.proposalId = null;

					return;
				}
				self.proposalId = null;
				clearDraft(proposalScope, 'proposal');
				self.edit = undefined;
				self.state = 'sent';
			} catch (error) {
				if (refusalReason(error) === 'already-proposed') {
					// The limit, not a failure: nothing to retry, and the text stays in the box.
					self.limitRefused = true;
					self.proposalId = null;
					self.state = 'idle';

					return;
				}
				self.state = 'failed';
				throw error;
			}
		};
		const send = (): void => {
			self.sending = true;
			self.error = null;
			(async () => {
				await sendOne();
				if (isBroadcasting()) await stopBroadcast();
			})()
				.catch((error: unknown) => {
					console.error('[WritePanel] send failed', { tableId: a.table.tableId, uid }, error);
					self.error = t('answer.send_failed');
				})
				.finally(() => {
					self.sending = false;
					m.redraw();
				});
		};

		const busySend = self.sending || stateOf() === 'sending';
		const ownCards = showsOwnProposalList(limit, mine, target)
			? ownProposalCards({
					proposals: otherOwnProposals(mine, target),
					uid,
					canEdit: !a.locked && !pen,
					onEdit: (id) => {
						self.editId = id;
						self.limitRefused = false;
					},
				})
			: null;

		return m('.write-panel', [
			showBox
				? m(WriteBox, {
						label: t('proposal.mine'),
						value: valueOf(),
						onInput,
						readOnly: a.locked,
						state: stateOf(),
						placeholder: t('proposal.placeholder'),
						testId: 'proposal-box',
					})
				: null,
			!a.challenge ? m('p.write-panel__note', t('proposal.none')) : null,
			pen ? m('p.write-panel__live', t('proposals.write.mine_line')) : null,
			limitReached
				? m(
						'p.write-panel__note.write-panel__note--limit',
						{ role: 'status', 'data-testid': 'proposal-limit-reached' },
						t('proposal.limit_reached'),
					)
				: null,
			!pen && self.editId && sentProposal && (limit === 'unlimited' || mine.length > 1)
				? m(
						'button.btn.btn--secondary.btn--small',
						{
							type: 'button',
							'data-testid': 'proposal-edit-done',
							onclick: () => {
								self.editId = null;
							},
						},
						t('proposal.edit_done'),
					)
				: null,
			sentProposal?.hide ? m('p.write-panel__note', t('proposal.hidden_mine')) : null,
			sentProposal && !sentProposal.hide
				? [m(ReplyEntry, { proposal: sentProposal, uid }), m(PushAsk, { mainId })]
				: null,
			ownCards,
			!sentProposal && mine.length > 0 ? m(PushAsk, { mainId }) : null,
			m(ErrorLine, { message: self.error, onRetry: canSend ? send : undefined }),
			showBox && !a.locked
				? m('.write-panel__footer', [
						m(
							'button.btn.btn--primary.write-panel__send',
							{
								type: 'button',
								'data-testid': 'proposal-send',
								disabled: !canSend || undefined,
								onclick: send,
							},
							busySend ? t('text.checking') : t('proposal.send_mine'),
						),
						pen && a.onPass
							? m(
									'button.btn.btn--text.write-panel__pass',
									{
										type: 'button',
										'data-testid': 'pen-pass',
										disabled: a.busy || self.sending,
										onclick: () => {
											if (isBroadcasting()) void stopBroadcast();
											a.onPass?.();
										},
									},
									t('proposals.pass'),
								)
							: null,
					])
				: null,
		]);
	},
};
