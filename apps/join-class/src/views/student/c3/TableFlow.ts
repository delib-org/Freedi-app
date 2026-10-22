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
import { serverNow } from '@/lib/classroom/serverClock';
import { claimMoment, askerStates } from '@/lib/classroom/turnMoment';
import { AskersRow } from './AskersRow';
import { ErrorLine } from './ErrorLine';
import { FlowState, type FlowCtx, type FlowParts } from './flowTypes';
import { proposalsParts } from './proposalsParts';
import { SubStepStrip } from './SubStepStrip';
import { tableTalkParts } from './tableTalkParts';

export interface TableFlowAttrs {
	main: Statement;
	kind: FlowKind;
}

/** A second look just after a minute ends: the server clock may be a hair behind the table doc. */
const REDRAW_AFTER_MINUTE_MS = 350;

function stateOf(vnode: m.Vnode<TableFlowAttrs>): FlowState {
	return (vnode.state as { self?: FlowState }).self as FlowState;
}

/**
 * One table's whole student experience at Table talk and at Proposals (UX
 * §2.6, §2.7, §3, §11, §16): header line, asker line, the askers row (Table
 * talk), the strip and the screen of the table's step. The table doc (listener
 * started by StudentStage) decides the screen; tableTalkParts / proposalsParts
 * build what each flow shows. The pills stay a peek: a screen that is not the
 * official step is drawn with every control disabled, a line saying what the
 * table is doing now and a one-tap "back to now". Every callable shows an
 * inline error with a retry, except a lost race for the next turn, which just
 * shows whose turn it is.
 */
export const TableFlow: m.ClassComponent<TableFlowAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: FlowState }).self = new FlowState();
	},

	onremove(vnode) {
		const self = stateOf(vnode);
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
		if (self.chosenTurn !== table.turn) {
			self.chosenTurn = table.turn;
			self.chosenId = null;
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
		// A finished table has nothing to peek at: any pill the student chose lapses.
		if (tableTalk && claimMoment(table, uid, now).phase === 'done') self.override = null;
		const view = resolveSubstep(kind, table, self.override);
		const peek = view.detached;

		const run = (op: () => Promise<unknown>): void => {
			if (self.busy) return;
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
					self.error = t('turn.action_failed');
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
			run,
			act,
		};
		const parts: FlowParts = tableTalk ? tableTalkParts(ctx) : proposalsParts(ctx);

		let { body, action } = parts;
		const instruction = peek ? t(`turn.peek_why_${view.official}`) : parts.instruction;
		if (peek) {
			// Off the official step nothing on the screen may act; the one live control leads back.
			body = m('fieldset.flow__peek', { disabled: true, 'data-testid': 'peek-body' }, body);
			action = m(
				'button.btn.btn--primary',
				{
					type: 'button',
					'data-testid': 'peek-back',
					onclick: () => {
						self.override = null;
					},
				},
				t('turn.peek_back'),
			);
		}
		const setLocal = (next: TableStep): void => {
			self.override = { step: next, officialAtPick: view.official, turnAtPick: table.turn };
		};
		const passedMe = (table.passedAskingUids ?? []).includes(uid);

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
					tableTalk ? m(AskersRow, { chips: askerStates(table, mates, now), uid }) : null,
					parts.showStrip ? m(SubStepStrip, { kind, view, onSelect: setLocal }) : null,
					m(ErrorLine, {
						message: self.error,
						onRetry: self.retry ? () => void self.retry?.() : undefined,
					}),
					tableTalk
						? m(
								'p.visually-hidden',
								{ 'aria-live': 'polite' },
								passedMe ? t('turn.passed_ask_done') : '',
							)
						: null,
					body,
				],
			),
			parts.overlay,
		];
	},
};
