import m from 'mithril';
import type { ClassTableAction, Statement } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion } from '@/lib/lesson';
import { initLiveDrafts, teardownLiveDrafts } from '@/lib/liveDrafts';
import { getSubQuestions } from '@/lib/store';
import { classState, trackTableChange } from '@/lib/classroom/classState';
import { predictTableAction } from '@/lib/classroom/tableOptimism';
import { classTableStep } from '@/lib/classroom/api';
import { currentUid } from '@/lib/classroom/c3Data';
import { officialSubstep, type FlowKind } from '@/lib/classroom/c3Logic';
import { refusalReason } from '@/lib/classroom/turnMoment';
import { serverNow } from '@/lib/classroom/serverClock';
import { clearImproveHandler } from '@/lib/classroom/replyUi';
import { ErrorLine } from './ErrorLine';
import { FlowError, FlowState, type FlowCtx, type FlowParts, type RunOptions } from './flowTypes';
import { proposalsParts } from './proposalsParts';
import { SubStepStrip } from './SubStepStrip';
import { tableTalkParts } from './tableTalkParts';

export interface TableFlowAttrs {
	main: Statement;
	kind: FlowKind;
}

/** A second look just after a minute ends: the server clock may be a hair behind the table doc. */
const REDRAW_AFTER_MINUTE_MS = 350;
/** A state change within this long of the student's own tap is the effect of that tap: focus stays. */
const TAP_FOCUS_WINDOW_MS = 1500;

/** What the inline error says: a named message, "already asked" for a used question, or the generic one. */
function failureText(error: unknown): string {
	if (error instanceof FlowError) return t(error.key);
	if (refusalReason(error) === 'question-used') return t('turn.question_taken');

	return t('turn.action_failed');
}

function stateOf(vnode: m.Vnode<TableFlowAttrs>): FlowState {
	return (vnode.state as { self?: FlowState }).self as FlowState;
}

/**
 * One table's whole student experience at Table talk and at Proposals. The table
 * doc (listener started by StudentStage) decides the screen. Table talk (UX 16
 * rev 3) is one calm screen per state, built by tableTalkParts. Proposals goes
 * Talk, Write, Rate with the whole table: the phone always shows the table's step
 * (a read-only marker on top), built by proposalsParts. Every callable shows an
 * inline error with a retry; a lost race just shows what the table is doing.
 */
export const TableFlow: m.ClassComponent<TableFlowAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: FlowState }).self = new FlowState();
	},

	onremove(vnode) {
		const self = stateOf(vnode);
		clearImproveHandler(self);
		self.feed.stop();
		if (self.redrawTimer) clearTimeout(self.redrawTimer);
		teardownLiveDrafts();
	},

	view(vnode) {
		const self = stateOf(vnode);
		const { main, kind } = vnode.attrs;
		const table = classState.table;
		const uid = currentUid();
		if (!table || !uid) {
			return m(StudentFrame, {
				headerLine: t('turn.no_table_header'),
				instruction: t('turn.no_table'),
			});
		}

		const questions = getSubQuestions();
		const challenge = getChallengeQuestion(questions);
		const questionIds = questions.map((q) => q.statementId);
		self.feed.sync(main, main.statementId, table.tableId, questionIds);
		const liveId = challenge?.statementId ?? table.questionId ?? null;
		if (liveId && liveId !== self.liveFor) {
			self.liveFor = liveId;
			initLiveDrafts(liveId);
		}
		if (table.speakerEndsAt !== undefined && self.redrawFor !== table.speakerEndsAt) {
			self.redrawFor = table.speakerEndsAt;
			const wait = table.speakerEndsAt - serverNow() + REDRAW_AFTER_MINUTE_MS;
			if (self.redrawTimer) clearTimeout(self.redrawTimer);
			self.redrawTimer = wait > 0 ? setTimeout(() => m.redraw(), wait) : null;
		}
		const feed = self.feed;
		// Only the people the table doc seats (a stale tableId on a subscription must not add a chip).
		// In seating order (the table doc's), so the askers row and the chips read the same on every phone.
		const seated = feed.mates
			.filter((x) => table.memberUids.includes(x.uid))
			.sort((a, b) => table.memberUids.indexOf(a.uid) - table.memberUids.indexOf(b.uid));
		const someone = t('turn.someone');
		const mates =
			seated.length > 0 ? seated : table.memberUids.map((id) => ({ uid: id, name: someone }));
		const now = serverNow();
		const tableTalk = kind === 'tableTalk';
		// One screen per state at Table talk; at Proposals the phone follows the table's step.
		const step = tableTalk ? table.step : officialSubstep(table);

		const run = (op: () => Promise<unknown>, options?: RunOptions): void => {
			const key = options?.optimistic?.key;
			if (self.busy || (key !== undefined && self.pending.has(key))) return;
			self.lastTapAt = Date.now();
			const attempt = async (): Promise<void> => {
				// An optimistic action already shows its result: the screen stays live while it is out.
				if (key === undefined) self.busy = true;
				else self.pending.add(key);
				self.error = null;
				self.retry = attempt;
				m.redraw();
				try {
					await op();
					self.retry = null;
				} catch (error) {
					console.error(
						'[TableFlow] classTableStep failed',
						{ tableId: table.tableId, uid },
						error,
					);
					self.error = failureText(error);
				} finally {
					if (key === undefined) self.busy = false;
					else self.pending.delete(key);
					m.redraw();
				}
			};
			void attempt();
		};
		const act = (action: ClassTableAction): void => {
			const change = predictTableAction(table.tableId, action, {
				uid,
				isAdmin: false,
				now: serverNow(),
			});
			run(
				() => trackTableChange(change, () => classTableStep({ tableId: table.tableId, ...action })),
				change ? { optimistic: { key: action.action } } : undefined,
			);
		};
		const ctx: FlowCtx = {
			main,
			kind,
			table,
			uid,
			mates,
			self,
			feed,
			step,
			questions,
			challenge,
			now,
			someone,
			run,
			act,
		};
		const parts: FlowParts = tableTalk ? tableTalkParts(ctx) : proposalsParts(ctx);

		const { body, action, instruction } = parts;
		if (tableTalk) return tableTalkFrame(self, parts, instruction, action);

		return m(
			StudentFrame,
			{
				headerLine: parts.headerLine,
				instruction,
				ask: parts.ask,
				action,
				down: parts.down,
			},
			[
				m(
					'p.visually-hidden',
					{ key: 'live', 'aria-live': 'polite', 'data-testid': 'state-status' },
					parts.status ?? '',
				),
				parts.strip ? m(SubStepStrip, { current: parts.strip }) : null,
				m(ErrorLine, {
					message: self.error,
					onRetry: self.retry ? () => void self.retry?.() : undefined,
				}),
				body,
			],
		);
	},
};

/**
 * The Table talk frame: stage name over the table line, the state's heading, its
 * body and footer, and one polite live region that says the new state once. Errors
 * sit inside the footer under the button that failed (tableTalkParts), never here.
 * When the state changes by someone else's move, focus goes to the new heading.
 */
function tableTalkFrame(
	self: FlowState,
	parts: FlowParts,
	instruction: string | undefined,
	action: m.Children,
): m.Children {
	const key = parts.stateKey ?? '';
	if (key !== self.stateKey) {
		self.stateKey = key;
		const own = Date.now() - self.lastTapAt < TAP_FOCUS_WINDOW_MS;
		if (!own) {
			requestAnimationFrame(() =>
				document.querySelector<HTMLElement>('.frame__instruction')?.focus({ preventScroll: true }),
			);
		}
	}

	return m(
		StudentFrame,
		{
			headerLine: parts.headerLine,
			instruction,
			questionHeading: parts.questionHeading,
			action,
			down: parts.down,
		},
		[
			m(
				'p.visually-hidden',
				{ key: 'live', 'aria-live': 'polite', 'data-testid': 'state-status' },
				parts.status ?? '',
			),
			parts.body,
		],
	);
}
