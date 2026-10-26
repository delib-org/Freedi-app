import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { getChallengeQuestion } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { classState } from '@/lib/classroom/classState';
import { currentUid } from '@/lib/classroom/c3Data';
import { listenProposalDoc, listenRepliesToMe, loadProposal } from '@/lib/classroom/replies';
import { openReplies, replyUi, resetReplyUi } from '@/lib/classroom/replyUi';
import { refreshReplyPush } from '@/lib/classroom/replyPush';
import { afterLoad } from '@/lib/deferWork';
import { RepliesSheet } from './RepliesSheet';

/**
 * The student's replies layer for one lesson (IA 22, 23), started beside the
 * step screens by StudentStage:
 *  - draws the one open replies sheet over whatever step is showing;
 *  - keeps the author's ONE listener (replies to my proposal) in `replyUi`: the
 *    lasting notice line (ReplyNotice) and the count on the own card read it;
 *  - watches whether the teacher hid my proposal (its replies then drop out of
 *    the count);
 *  - opens the author's replies from the notice line and from a push tap
 *    (`?replies=<proposalId>`).
 */

/** The query parameter a push tap carries. */
export const REPLIES_PARAM = 'replies';
/** The push worker's message to an open window (public/class-push-sw.js). */
const PUSH_OPEN_MESSAGE = 'class-open-url';

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

/** One watcher per proposal of mine that has replies; keeps `replyUi.hiddenProposals` current. */
function startHiddenWatch(uid: string): {
	sync: (replies: readonly Statement[]) => void;
	stop: () => void;
} {
	const stops = new Map<string, () => void>();
	const hidden = new Set<string>();
	const publish = (): void => {
		replyUi.hiddenProposals = new Set(hidden);
		m.redraw();
	};

	return {
		sync(replies) {
			for (const id of new Set(replies.map((r) => r.parentId))) {
				if (stops.has(id)) continue;
				stops.set(
					id,
					listenProposalDoc(
						id,
						(proposal) => {
							const isHidden = proposal?.hide === true || proposal === null;
							if (isHidden === hidden.has(id)) return;
							if (isHidden) hidden.add(id);
							else hidden.delete(id);
							publish();
						},
						(error) =>
							console.error(
								'[Replies] own proposal listener error',
								{ operation: 'replyHost.watchProposal', uid, statementId: id },
								error,
							),
					),
				);
			}
		},
		stop() {
			stops.forEach((stop) => stop());
			stops.clear();
		},
	};
}

export function startReplyHost(main: Statement): () => void {
	resetReplyUi();
	const uid = currentUid();
	const host = document.createElement('div');
	document.body.appendChild(host);
	const hiddenWatch = uid ? startHiddenWatch(uid) : null;
	replyUi.openById = (proposalId: string): void => void openById(proposalId);

	const onReplies = (list: Statement[]): void => {
		replyUi.toMe = list;
		syncReadMark();
		hiddenWatch?.sync(list);
		m.redraw();
	};

	const stop = uid
		? listenRepliesToMe(main.topParentId || main.statementId, uid, onReplies, (error) =>
				console.error(
					'[Replies] author listener error',
					{ operation: 'replyHost.listen', uid, statementId: main.statementId },
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
	// A push tapped while the app is open: the worker focuses this window and names the link.
	const onWorkerMessage = (event: MessageEvent): void => {
		const data = event.data as { type?: string; url?: string } | null;
		if (data?.type !== PUSH_OPEN_MESSAGE || typeof data.url !== 'string') return;
		const url = new URL(data.url, window.location.origin);
		if (url.pathname !== window.location.pathname) {
			window.location.assign(url.href);

			return;
		}
		const proposalId = url.searchParams.get(REPLIES_PARAM);
		if (proposalId) void openById(proposalId);
	};
	navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
	afterLoad(refreshReplyPush);

	return () => {
		navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
		stop();
		hiddenWatch?.stop();
		m.mount(host, null);
		host.remove();
		resetReplyUi();
	};
}
