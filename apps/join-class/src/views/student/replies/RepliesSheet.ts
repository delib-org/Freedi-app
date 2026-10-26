import m from 'mithril';
import { CLASS_REPLY_MAX_LENGTH, type Statement } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import '@/styles/student-replies.scss';
import { t } from '@/lib/i18n';
import type { Unsubscribe } from '@/lib/firebase';
import { firstUnreadId, newReplyIds, replyRole, visibleReplies } from '@/lib/classroom/replyLogic';
import {
	listenProposalReplies,
	markRepliesRead,
	newReplyId,
	postReply,
} from '@/lib/classroom/replies';
import {
	backFromReplies,
	closeReplies,
	improveFromReplies,
	replyUi,
} from '@/lib/classroom/replyUi';
import { Sheet } from '../c3/Sheet';
import { ErrorLine } from '../c3/ErrorLine';

export interface RepliesSheetAttrs {
	mainId: string;
	proposal: Statement;
	uid: string;
	/** The ballot is frozen: the proposal itself can no longer be edited. */
	ballotFrozen: boolean;
	/** Back to the sheet the replies replaced; absent = a plain close. */
	hasBack: boolean;
}

type SendState = 'idle' | 'sending' | 'refused' | 'failed';

class RepliesState {
	replies: Statement[] = [];
	loaded = false;
	stop: Unsubscribe | null = null;
	draft = '';
	send: SendState = 'idle';
	/** The id of the reply being sent; kept for a retry so it is never posted twice. */
	pendingId: string | null = null;
	/** The read mark when the author opened the sheet: what counts as new on this visit. */
	openedReadAt: number | undefined;
	scrolled = false;
}

function stateOf(vnode: m.Vnode<RepliesSheetAttrs>): RepliesState {
	return (vnode.state as { self?: RepliesState }).self as RepliesState;
}

function tagOf(reply: Statement): string {
	const role = replyRole(reply);
	if (role === 'teacher') return t('reply.by_teacher');
	if (role === 'author') return t('reply.by_author');

	return reply.creator?.displayName?.trim() || t('turn.someone');
}

function replyView(
	reply: Statement,
	uid: string,
	newIds: ReadonlySet<string>,
	firstNewId: string | null,
): m.Vnode {
	const hidden = reply.hide === true;
	const role = replyRole(reply);
	const isNew = newIds.has(reply.statementId);

	return m(
		'li.reply',
		{
			key: reply.statementId,
			'data-testid': 'reply-item',
			id: reply.statementId === firstNewId ? 'reply-first-new' : undefined,
			class: [
				hidden ? 'reply--hidden' : '',
				role === 'teacher' ? 'reply--teacher' : '',
				role === 'author' ? 'reply--author' : '',
				reply.creatorId === uid ? 'reply--mine' : '',
				isNew ? 'reply--new' : '',
			]
				.filter(Boolean)
				.join(' '),
		},
		[
			m('p.reply__tag', [
				m('span', tagOf(reply)),
				isNew ? m('span.reply__new-tag', t('reply.new_tag')) : null,
			]),
			m('p.reply__text', { dir: 'auto' }, reply.statement),
			hidden ? m('p.reply__hidden', t('reply.hidden_mine')) : null,
		],
	);
}

async function send(self: RepliesState, attrs: RepliesSheetAttrs): Promise<void> {
	const text = self.draft.trim();
	if (!text || self.send === 'sending') return;
	self.pendingId = self.pendingId ?? newReplyId();
	self.send = 'sending';
	m.redraw();
	try {
		const res = await postReply(attrs.mainId, attrs.proposal.statementId, self.pendingId, text);
		if (res.ok) {
			self.draft = '';
			self.pendingId = null;
			self.send = 'idle';
		} else {
			// Refused words: the text stays in the box; a new id for the rephrased reply.
			self.pendingId = null;
			self.send = 'refused';
		}
	} catch {
		self.send = 'failed';
	} finally {
		m.redraw();
	}
}

function composer(self: RepliesState, attrs: RepliesSheetAttrs): m.Children {
	const left = CLASS_REPLY_MAX_LENGTH - self.draft.length;
	const sending = self.send === 'sending';

	return m('.reply-composer', [
		self.send === 'refused'
			? m('p.reply-composer__refused', { role: 'alert' }, t('reply.refused'))
			: null,
		m(ErrorLine, {
			message: self.send === 'failed' ? t('reply.failed') : null,
			onRetry: () => void send(self, attrs),
		}),
		m('label.reply-composer__label', [
			m('span.visually-hidden', t('reply.placeholder')),
			m('textarea.reply-composer__area', {
				dir: 'auto',
				rows: 2,
				maxlength: CLASS_REPLY_MAX_LENGTH,
				placeholder: t('reply.placeholder'),
				'data-testid': 'reply-input',
				value: self.draft,
				oninput: (event: Event) => {
					self.draft = (event.target as HTMLTextAreaElement).value;
					if (self.send === 'refused' || self.send === 'failed') self.send = 'idle';
				},
			}),
		]),
		m('.reply-composer__row', [
			m(
				'span.reply-composer__count',
				{ 'aria-hidden': 'true' },
				t('reply.count_left', { n: left }),
			),
			m(
				'button.btn.btn--primary.btn--small',
				{
					type: 'button',
					'data-testid': 'reply-send',
					disabled: sending || self.draft.trim().length === 0 ? true : undefined,
					'aria-busy': sending ? 'true' : undefined,
					onclick: () => void send(self, attrs),
				},
				sending ? t('reply.sending') : t('reply.send'),
			),
		]),
	]);
}

function authorFooter(attrs: RepliesSheetAttrs): m.Children {
	if (attrs.ballotFrozen) return m('p.replies__closed', t('reply.improve_closed'));
	if (!replyUi.improve) return null;

	return m(
		'button.btn.btn--secondary.btn--small.replies__improve',
		{ type: 'button', 'data-testid': 'reply-improve', onclick: improveFromReplies },
		t('reply.improve'),
	);
}

/**
 * The replies on one proposal (IA 22.6): oldest first, each tagged with the
 * replier's class name, "the proposal's author" or "Teacher", and a composer
 * at the bottom. On the author's own proposal the sheet writes the read mark,
 * scrolls to the first new reply, and offers "Improve my proposal" (or, once
 * the ballot is frozen, a short line). Replies never close.
 */
export const RepliesSheet: m.ClassComponent<RepliesSheetAttrs> = {
	oninit(vnode) {
		const self = new RepliesState();
		(vnode.state as { self?: RepliesState }).self = self;
		const { proposal, uid, mainId } = vnode.attrs;
		self.stop = listenProposalReplies(
			proposal.statementId,
			(list) => {
				self.replies = list;
				self.loaded = true;
				m.redraw();
			},
			(error) =>
				console.error(
					'[Replies] listener error',
					{ operation: 'RepliesSheet.listen', statementId: proposal.statementId },
					error,
				),
		);
		if (proposal.creatorId === uid) {
			self.openedReadAt = replyUi.readAt;
			const now = Date.now();
			replyUi.readAt = now;
			void markRepliesRead(mainId, now);
		}
	},

	onremove(vnode) {
		stateOf(vnode).stop?.();
	},

	onupdate(vnode) {
		const self = stateOf(vnode);
		if (self.scrolled || !self.loaded) return;
		self.scrolled = true;
		document.getElementById('reply-first-new')?.scrollIntoView({ block: 'center' });
	},

	view(vnode) {
		const self = stateOf(vnode);
		const { proposal, uid } = vnode.attrs;
		const own = proposal.creatorId === uid;
		const list = visibleReplies(self.replies, uid);
		const firstNewId = own ? firstUnreadId(self.replies, uid, self.openedReadAt) : null;
		const newIds = own
			? newReplyIds(visibleReplies(self.replies, uid), uid, self.openedReadAt)
			: new Set<string>();
		let body: m.Children;
		if (!self.loaded) {
			body = m('.replies__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') }, [
				m('.replies__skeleton-line'),
				m('.replies__skeleton-line'),
			]);
		} else if (list.length === 0) {
			body = m('p.replies__empty', t('reply.empty'));
		} else {
			body = m(
				'ol.replies__list',
				list.map((r) => replyView(r, uid, newIds, firstNewId)),
			);
		}

		return m(
			Sheet,
			{ title: t('reply.title'), onClose: closeReplies },
			m('.replies', { 'data-testid': 'replies-sheet' }, [
				vnode.attrs.hasBack
					? m(
							'button.btn.btn--tertiary.btn--small.replies__back',
							{ type: 'button', 'data-testid': 'replies-back', onclick: backFromReplies },
							[m('span', { 'aria-hidden': 'true' }, '‹ '), t('reply.back')],
						)
					: null,
				m('blockquote.replies__proposal', { dir: 'auto' }, proposal.statement),
				own ? m('p.replies__hint', t('reply.author_hint')) : null,
				own ? authorFooter(vnode.attrs) : null,
				body,
				composer(self, vnode.attrs),
			]),
		);
	},
};
