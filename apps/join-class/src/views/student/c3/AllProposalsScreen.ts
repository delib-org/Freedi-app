import m from 'mithril';
import type { ClassTableAction, Statement } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import '@/styles/student-c3-all-proposals.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion } from '@/lib/lesson';
import { initLiveDrafts, teardownLiveDrafts } from '@/lib/liveDrafts';
import { getSubQuestions } from '@/lib/store';
import { classState } from '@/lib/classroom/classState';
import { classTableStep } from '@/lib/classroom/api';
import { currentUid } from '@/lib/classroom/c3Data';
import { myProposal } from '@/lib/classroom/c3Logic';
import {
	allProposalsPool,
	boardProgress,
	isBoardDone,
	needsNextBatch,
	serveNextBatch,
	startBoard,
	type Board,
	type IsRated,
} from '@/lib/classroom/allProposalsBoard';
import { selectBatch } from '@/lib/classroom/proposalSampler';
import { ErrorLine } from './ErrorLine';
import { FlowFeed } from './FlowFeed';
import { WritePanel } from './WritePanel';
import { arrivalText, boardView, ownCardView } from './allProposalsParts';

export interface AllProposalsScreenAttrs {
	main: Statement;
}

/** The next batch arrives about a second after the last tap of the current one (IA 19.4). */
const ARRIVAL_DELAY_MS = 1000;

class AllProposalsState {
	feed = new FlowFeed();
	board: Board | null = null;
	/** The pool and rating check of the last draw, read when the arrival timer fires. */
	pool: Statement[] = [];
	isRated: IsRated = () => false;
	arrivalTimer: ReturnType<typeof setTimeout> | null = null;
	/** The words of the latest live arrival, for the polite live region. */
	arrival = '';
	error: string | null = null;
	retry: (() => void) | null = null;
	editing = false;
	liveFor: string | null = null;
}

function stateOf(vnode: m.Vnode<AllProposalsScreenAttrs>): AllProposalsState {
	return (vnode.state as { self?: AllProposalsState }).self as AllProposalsState;
}

function clearArrival(self: AllProposalsState): void {
	if (self.arrivalTimer) clearTimeout(self.arrivalTimer);
	self.arrivalTimer = null;
}

/** Schedules the next batch once every card on the board is rated; cancels it if that stops being true. */
function syncArrival(self: AllProposalsState): void {
	const board = self.board;
	const due = board !== null && needsNextBatch(board, self.pool, self.isRated);
	if (!due) {
		clearArrival(self);

		return;
	}
	if (self.arrivalTimer) return;
	self.arrivalTimer = setTimeout(() => {
		self.arrivalTimer = null;
		const current = self.board;
		if (!current || !needsNextBatch(current, self.pool, self.isRated)) return;
		const next = serveNextBatch(current, self.pool, (c) => selectBatch(c));
		self.board = next;
		const added =
			next.batches.length > current.batches.length ? next.batches[next.batches.length - 1] : null;
		if (added) self.arrival = arrivalText(added.ids.length);
		m.redraw();
	}, ARRIVAL_DELAY_MS);
}

function rateWithRetry(self: AllProposalsState, item: Statement, score: number): void {
	self.error = null;
	self.retry = null;
	self.feed.rate(item, score).catch((error: unknown) => {
		console.error(
			'[C3] rating failed',
			{ operation: 'allProposals.rate', statementId: item.statementId, parentId: item.parentId },
			error,
		);
		self.error = t('rate.failed');
		self.retry = () => rateWithRetry(self, item, score);
		m.redraw();
	});
}

function loadingView(): m.Children {
	return m('.all-proposals__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') }, [
		m('.all-proposals__skeleton-card'),
		m('.all-proposals__skeleton-card'),
	]);
}

/**
 * "כל ההצעות" (IA 19.4): every phone rates the class's proposals, up to six at a
 * time picked by Thompson Sampling. Rated cards stay on the board and can be
 * rated again; when the whole board is rated the next batch arrives by itself,
 * under an "n new proposals" divider. The student's own proposal is pinned on
 * top and stays editable until the Vote opens.
 */
export const AllProposalsScreen: m.ClassComponent<AllProposalsScreenAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: AllProposalsState }).self = new AllProposalsState();
	},

	onremove(vnode) {
		const self = stateOf(vnode);
		clearArrival(self);
		self.feed.stop();
		if (self.liveFor) teardownLiveDrafts();
	},

	view(vnode) {
		const self = stateOf(vnode);
		const { main } = vnode.attrs;
		const uid = currentUid();
		const challenge = getChallengeQuestion(getSubQuestions());
		const challengeId = challenge?.statementId ?? null;
		const frame = (children: m.Children): m.Children =>
			m(
				StudentFrame,
				{ headerLine: t('step.allProposals'), instruction: t('allProposals.instruction') },
				children,
			);
		if (!uid) return frame(m('p.rated-list__empty', t('proposal.none_yet')));

		self.feed.sync(main, main.statementId, null, challengeId ? [challengeId] : [], false);
		if (challengeId && challengeId !== self.liveFor) {
			self.liveFor = challengeId;
			initLiveDrafts(challengeId);
		}
		if (!self.feed.optionsLoaded || !self.feed.ratingsLoaded) return frame(loadingView());

		const feed = self.feed;
		const isRated: IsRated = (id) => feed.ratingOf(id) !== undefined;
		const pool = allProposalsPool(feed.options, challengeId, uid);
		self.pool = pool;
		self.isRated = isRated;
		if (!self.board) self.board = startBoard(pool, isRated, (c) => selectBatch(c));
		syncArrival(self);

		const table = classState.table;
		const canWrite = !!challenge && !!table && !challenge.statementSettings?.ballot;
		const mine = myProposal(
			feed.options.filter((o) => o.parentId === challengeId),
			uid,
		);
		const progress = boardProgress(pool, isRated);
		const done = isBoardDone(self.board, pool, isRated);
		const act = (action: ClassTableAction): void => {
			if (!table) return;
			classTableStep({ tableId: table.tableId, ...action }).catch((error: unknown) => {
				console.error(
					'[C3] table action failed',
					{ operation: 'allProposals.tableAction', tableId: table.tableId },
					error,
				);
			});
		};

		return frame([
			pool.length > 0
				? m(
						'p.all-proposals__progress',
						{ 'data-testid': 'all-proposals-progress' },
						t('allProposals.progress', { n: progress.rated, m: progress.total }),
					)
				: null,
			m('p.visually-hidden', { 'aria-live': 'polite' }, self.arrival),
			m(ErrorLine, { message: self.error, onRetry: self.retry ?? undefined }),
			ownCardView({
				mine,
				canWrite,
				editing: self.editing,
				editor:
					self.editing && table
						? m(WritePanel, {
								main,
								kind: 'proposals',
								table,
								feed,
								uid,
								mates: [],
								question: null,
								challenge,
								locked: !canWrite,
								busy: false,
								onAction: act,
							})
						: null,
				onToggleEdit: () => {
					self.editing = !self.editing;
				},
			}),
			pool.length === 0
				? m('p.rated-list__empty', { 'data-testid': 'all-proposals-empty' }, t('proposal.none_yet'))
				: boardView({
						board: self.board,
						pool,
						ratingOf: (id) => feed.ratingOf(id),
						onRate: (item, score) => rateWithRetry(self, item, score),
					}),
			done
				? m(
						'p.all-proposals__done',
						{ 'data-testid': 'all-proposals-done', role: 'status' },
						t('allProposals.done'),
					)
				: null,
		]);
	},
};
