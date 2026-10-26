import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { unreadLineKey, unreadReplies } from '@/lib/classroom/replyLogic';
import { openReplies, replyUi } from '@/lib/classroom/replyUi';

export interface ReplyEntryAttrs {
	proposal: Statement;
	/** The viewer wrote this proposal: the entry also says how many replies are new. */
	own?: boolean;
	uid?: string | null;
	/**
	 * Opened from inside another sheet ("כל ההצעות"): `leave` closes that sheet
	 * first and `back` reopens it, so the replies replace it (no sheet on sheet).
	 */
	leave?: () => void;
	back?: () => void;
}

/** New replies on the viewer's own proposal, from the author's one listener. */
export function unreadOn(proposalId: string, uid: string | null | undefined): number {
	if (!uid) return 0;

	return unreadReplies(
		replyUi.toMe.filter((r) => r.parentId === proposalId),
		uid,
		replyUi.readAt,
	).length;
}

/**
 * "תגובות · n" on a proposal card (IA 22.2): its own small control, never the
 * card's pick or rate target (taps stop here). The count is the proposal's
 * server-kept `replyCount`, so no card needs a listener of its own.
 */
export const ReplyEntry: m.Component<ReplyEntryAttrs> = {
	view({ attrs }) {
		const { proposal } = attrs;
		const unread = attrs.own ? unreadOn(proposal.statementId, attrs.uid) : 0;
		const line = unreadLineKey(unread);

		return m(
			'button.reply-entry',
			{
				type: 'button',
				'data-testid': 'reply-entry',
				class: unread > 0 ? 'reply-entry--new' : '',
				onclick: (event: Event) => {
					event.stopPropagation();
					attrs.leave?.();
					openReplies({ proposal, onBack: attrs.back });
				},
			},
			[
				m('span.reply-entry__count', t('reply.open', { n: proposal.replyCount ?? 0 })),
				line ? m('span.reply-entry__new', t(line.key, line.params)) : null,
			],
		);
	},
};
