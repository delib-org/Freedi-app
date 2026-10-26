import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getChallengeQuestion } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { classState } from '@/lib/classroom/classState';
import { currentUid } from '@/lib/classroom/c3Data';
import { listenRepliesToMe, loadProposal } from '@/lib/classroom/replies';
import { shouldToast, unreadReplies } from '@/lib/classroom/replyLogic';
import { openReplies, replyUi, resetReplyUi } from '@/lib/classroom/replyUi';
import { showStudentNotice } from '@/lib/classroom/studentNotices';
import { RepliesSheet } from './RepliesSheet';

/**
 * The student's replies layer for one lesson (IA 22), started beside the step
 * screens by StudentStage:
 *  - draws the one open replies sheet over whatever step is showing;
 *  - keeps the author's ONE listener (replies to my proposal) and the unread
 *    count the own card shows;
 *  - says "New reply to your proposal" (tappable) at most once a minute, and
 *    never while those replies are open;
 *  - opens the author's replies from a push tap (`?replies=<proposalId>`).
 */

/** The query parameter a push tap carries. */
export const REPLIES_PARAM = 'replies';

async function openById(proposalId: string): Promise<void> {
	const proposal = await loadProposal(proposalId);
	if (proposal) openReplies({ proposal });
}

/** A push tap: open the replies once, then drop the parameter so a reload does not reopen them. */
function openFromLink(): void {
	const url = new URL(window.location.href);
	const proposalId = url.searchParams.get(REPLIES_PARAM);
	if (!proposalId) return;
	url.searchParams.delete(REPLIES_PARAM);
	window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
	void openById(proposalId);
}

function syncReadMark(): void {
	const stored = classState.mySubscription?.proposalRepliesReadAt;
	if (stored !== undefined && (replyUi.readAt === undefined || stored > replyUi.readAt)) {
		replyUi.readAt = stored;
	}
}

export function startReplyHost(main: Statement): () => void {
	resetReplyUi();
	const uid = currentUid();
	const host = document.createElement('div');
	document.body.appendChild(host);
	const seen = new Set<string>();
	let firstDelivery = true;
	let lastToastAt: number | null = null;

	const onReplies = (list: Statement[]): void => {
		replyUi.toMe = list;
		syncReadMark();
		if (!uid) return;
		const unread = unreadReplies(list, uid, replyUi.readAt);
		if (firstDelivery) {
			firstDelivery = false;
			list.forEach((r) => seen.add(r.statementId));
		}
		const sheetOpen = replyUi.open?.proposal.creatorId === uid;
		const now = Date.now();
		if (shouldToast({ now, lastToastAt, seen, unread, sheetOpen })) {
			lastToastAt = now;
			const proposalId = unread[unread.length - 1]?.parentId;
			showStudentNotice(t('reply.toast'), {
				label: t('reply.toast_open'),
				run: () => {
					if (proposalId) void openById(proposalId);
				},
			});
		}
		unread.forEach((r) => seen.add(r.statementId));
		m.redraw();
	};

	const stop = uid
		? listenRepliesToMe(main.topParentId || main.statementId, uid, onReplies, (error) =>
				console.error(
					'[Replies] author listener error',
					{ operation: 'replyHost.listen', uid },
					error,
				),
			)
		: () => undefined;

	m.mount(host, {
		view() {
			syncReadMark();
			const target = replyUi.open;
			if (!target || !uid) return null;
			const challenge = getChallengeQuestion(getSubQuestions());

			return m(RepliesSheet, {
				key: target.proposal.statementId,
				mainId: main.statementId,
				proposal: target.proposal,
				uid,
				ballotFrozen: !!challenge?.statementSettings?.ballot,
				hasBack: !!target.onBack,
			});
		},
	});
	openFromLink();

	return () => {
		stop();
		m.mount(host, null);
		host.remove();
		resetReplyUi();
	};
}
