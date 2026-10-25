import m from 'mithril';
import type { ClassTableAction, Statement, TableStep } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion } from '@/lib/lesson';
import { initLiveDrafts, teardownLiveDrafts } from '@/lib/liveDrafts';
import { getSubQuestions } from '@/lib/store';
import { classState } from '@/lib/classroom/classState';
import { classTableStep } from '@/lib/classroom/api';
import { currentUid } from '@/lib/classroom/c3Data';
import { resolveSubstep, type FlowKind } from '@/lib/classroom/c3Logic';
import { refusalReason } from '@/lib/classroom/turnMoment';
import { serverNow } from '@/lib/classroom/serverClock';
import { ErrorLine } from './ErrorLine';
import { FlowError, FlowState, type FlowCtx, type FlowParts } from './flowTypes';
import { liveWritingParts } from './liveWritingParts';
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
 * rev 3) is one calm screen per state, built by tableTalkParts. Proposals keeps
 * its step strip: each phone moves between talk, write and rate freely (IA 17.13),
 * and the table step only says where phones land. Every callable shows an inline
 * error with a retry; a lost race just shows what the table is doing.
 */
export const TableFlow: m.ClassComponent<TableFlowAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: FlowState }).self = new FlowState();
	},

	onremove(vnode) {
		const self = stateOf(vnode);
		self.feed.stop();
		if (self.redrawTimer) clearTimeout(self.redrawTimer);
		if (self.lineTimer) clearTimeout(self.lineTimer);
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
		// Table talk has one screen per state: no sub-steps. Proposals: the phone's own sub-step.
		const view = tableTalk
			? { current: table.step, official: table.step }
			: resolveSubstep(table, self.override);
		const setLocal = (next: TableStep): void => {
			self.override = { step: next, officialAtPick: view.official, turnAtPick: table.turn };
		};

		const run = (op: () => Promise<unknown>): void => {
			if (self.busy) return;
			self.lastTapAt = Date.now();
			const attempt = async (): Promise<void> => {
				self.busy = true;
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
					self.busy = false;
					m.redraw();
				}
			};
			void attempt();
		};
		const act = (action: ClassTableAction): void => {
			run(() => classTableStep({ tableId: table.tableId, ...action }));
		};
		const ctx: FlowCtx = {
			main,
			kind,
			table,
			uid,
			mates,
			self,
			feed,
			step: view.current,
			official: view.official,
			questions,
			challenge,
			now,
			someone,
			goto: setLocal,
			run,
			act,
		};
		const parts: FlowParts = tableTalk ? tableTalkParts(ctx) : proposalsParts(ctx);

		const { body, action, instruction } = parts;
		if (tableTalk) {
			// no watch view here: a hidden one would reopen (and push history) on the way back to Proposals
			self.watch = null;

			return tableTalkFrame(self, parts, instruction, action);
		}
		const live = liveWritingParts({
			self,
			table,
			uid,
			mates,
			someone,
			feed,
			challengeId: challenge?.statementId ?? null,
			plenum: challenge?.statementSettings?.roundPhase === 'improve',
		});

		return [
			m(
				StudentFrame,
				{
					headerLine: parts.headerLine,
					askerMark: parts.askerMark ? '?' : undefined,
					instruction,
					action,
					down: parts.down,
				},
				[
					parts.askerLine !== null || parts.barExtra
						? m('.flow__bar', [
								parts.askerLine !== null
									? m(
											'p.flow__asker',
											{ 'data-testid': table.askerUid === uid ? 'asker-mark' : undefined },
											parts.askerLine,
										)
									: m('span'),
								parts.barExtra,
							])
						: null,
					live.status,
					parts.showStrip ? m(SubStepStrip, { view, onSelect: setLocal }) : null,
					live.line,
					m(ErrorLine, {
						message: self.error,
						onRetry: self.retry ? () => void self.retry?.() : undefined,
					}),
					body,
				],
			),
			parts.overlay,
			live.overlay,
		];
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
			stageName: parts.stageName,
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
