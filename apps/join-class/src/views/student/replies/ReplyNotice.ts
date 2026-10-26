import m from 'mithril';
import '@/styles/reply-notice.scss';
import { t } from '@/lib/i18n';
import { getUserState } from '@/lib/user';
import { noticeKey, replyNotice } from '@/lib/classroom/replyLogic';
import { replyUi } from '@/lib/classroom/replyUi';

/**
 * The lasting "someone replied to you" line (IA 23.1): one tappable line under
 * the step title, on every step and sub-step, while the author has unread
 * replies. It reads the author's one listener through `replyUi` (nothing of
 * its own), so it costs no query. A tap opens the replies (which writes the
 * read mark and so clears the line). Never on the projector.
 */
export const ReplyNotice: m.Component = {
	view() {
		const uid = getUserState().user?.uid;
		if (!uid) return null;
		const notice = replyNotice(replyUi.toMe, uid, replyUi.readAt, replyUi.hiddenProposals);
		const line = noticeKey(notice.count);
		const proposalId = notice.proposalId;
		if (!line || !proposalId) return null;

		return m(
			'button.reply-notice',
			{
				type: 'button',
				'data-testid': 'reply-notice',
				onclick: () => replyUi.openById?.(proposalId),
			},
			[
				m('span.reply-notice__dot', { 'aria-hidden': 'true' }),
				m('span.reply-notice__text', t(line.key, line.params)),
			],
		);
	},
};
