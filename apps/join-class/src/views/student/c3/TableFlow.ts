import m from 'mithril';
import type { ClassTableAction, Statement, TableStep } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion, getGuidingQuestions } from '@/lib/lesson';
import { initLiveDrafts, teardownLiveDrafts } from '@/lib/liveDrafts';
import { getSubQuestions } from '@/lib/store';
import { classState } from '@/lib/classroom/classState';
import { classTableStep } from '@/lib/classroom/api';
import { createTableQuestion, currentUid } from '@/lib/classroom/c3Data';
import {
	listableItems,
	resolveSubstep,
	type FlowKind,
	type SubstepOverride,
} from '@/lib/classroom/c3Logic';
import {
	askerStates,
	instructionFor,
	myAnswer,
	rateMoment,
	refusalReason,
	sentCount,
} from '@/lib/classroom/turnMoment';
import { AskersRow } from './AskersRow';
import { FlowFeed } from './FlowFeed';
import { ErrorLine } from './ErrorLine';
import { QuestionPick, type PickQuestion } from './QuestionPick';
import { rateBody } from './RateScreen';
import { RatedList } from './RatedList';
import { Sheet } from './Sheet';
import { SubStepStrip } from './SubStepStrip';
import { TalkScreen, isTimeUp, talkFinishAction } from './TalkScreen';
import { WritePanel } from './WritePanel';

export interface TableFlowAttrs {
	main: Statement;
	kind: FlowKind;
}

class FlowState {
	feed = new FlowFeed();
	override: SubstepOverride | null = null;
	sheetOpen = false;
	busy = false;
	error: string | null = null;
	retry: (() => Promise<void>) | null = null;
	chosenId: string | null = null;
	chosenTurn = 0;
	editing = false;
	liveFor: string | null = null;
}

function stateOf(vnode: m.Vnode<TableFlowAttrs>): FlowState {
	return (vnode.state as { self?: FlowState }).self as FlowState;
}

/**
 * One table's whole student experience at Table talk and at Proposals (UX
 * §2.6, §2.7, §3, §11, §16): header line, asker line, the askers row (who has
 * asked, who asks now), the four-pill strip and the screen of the table's
 * step. The table doc (listener started by StudentStage) decides the screen.
 * The pills stay a peek: a screen that is not the official step is drawn with
 * every control disabled, a line saying what the table is doing now and a
 * one-tap "back to now". Every callable shows an inline error with a retry,
 * except a lost race for the next turn, which just shows whose turn it is.
 */
export const TableFlow: m.ClassComponent<TableFlowAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: FlowState }).self = new FlowState();
	},

	onremove(vnode) {
		const self = stateOf(vnode);
		self.feed.stop();
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
		const tableQuestion = questions.find((q) => q.statementId === table.questionId) ?? null;
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
		const feed = self.feed;
		// Only the people the table doc seats (a stale tableId on a subscription must not add a chip).
		// In seating order (the table doc's), so the askers row and the chips read the same on every phone.
		const seated = feed.mates
			.filter((x) => table.memberUids.includes(x.uid))
			.sort((a, b) => table.memberUids.indexOf(a.uid) - table.memberUids.indexOf(b.uid));
		const mates =
			seated.length > 0
				? seated
				: table.memberUids.map((id) => ({ uid: id, name: t('turn.someone') }));
		const isAsker = table.askerUid === uid;
		const view = resolveSubstep(kind, table, self.override);
		const step = view.current;
		const peek = view.detached;
		const tableTalk = kind === 'tableTalk';
		const challengeId = challenge?.statementId ?? null;
		const ballotFrozen = !!challenge?.statementSettings?.ballot;
		const plenum = kind === 'proposals' && challenge?.statementSettings?.roundPhase === 'improve';
		const items = listableItems(
			feed.options.filter((o) =>
				kind === 'proposals' ? o.parentId === challengeId : questionIds.includes(o.parentId),
			),
			{ uid, tableId: table.tableId, challengeId },
		);
		const unrated = items.filter((i) => feed.ratingOf(i.statementId) === undefined).length;

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
		// First tap wins: a lost race is not an error, the table doc already shows who won.
		const claimTurn = (): void => {
			run(async () => {
				try {
					await classTableStep({
						tableId: table.tableId,
						action: 'nextTurn',
						fromTurn: table.turn,
					});
				} catch (error) {
					if (refusalReason(error) !== 'turn-claimed') throw error;
				}
			});
		};
		const pickQuestion = (id: string): void => {
			self.chosenId = id;
			run(async () => {
				try {
					await classTableStep({ tableId: table.tableId, action: 'pickQuestion', questionId: id });
				} catch (error) {
					self.chosenId = null;
					throw error;
				}
			});
		};

		const someone = t('turn.someone');
		const asker = mates.find((x) => x.uid === table.askerUid);
		const askerLine = isAsker
			? t('turn.asker_me')
			: t('turn.asker', { name: asker?.name ?? someone });
		const stepName = t(`turn.now_${view.official}`);
		const headerLine = tableTalk
			? t('turn.header', {
					n: table.n,
					turn: table.turn,
					max: Math.max(table.memberUids.length, table.turn),
					step: stepName,
				})
			: t('turn.header_proposals', { n: table.n, step: stepName });
		const prompt =
			kind === 'proposals' ? (challenge?.statement ?? '') : (tableQuestion?.statement ?? '');

		const pickQuestions: PickQuestion[] = getGuidingQuestions(questions)
			.filter((q) => !q.classTable || q.classTable.tableId === table.tableId)
			.map((q) => ({
				id: q.statementId,
				text: q.statement,
				hint: q.statementSettings?.hint,
				own: !!q.classTable,
				used: table.usedQuestionIds.includes(q.statementId),
			}));
		const chosenId = isAsker
			? (self.chosenId ?? table.questionId ?? null)
			: (table.questionId ?? null);

		const editor = self.editing
			? m(WritePanel, {
					main,
					kind,
					table,
					feed,
					uid,
					mates,
					question: tableQuestion,
					challenge,
					locked: ballotFrozen,
					busy: self.busy,
					onAction: act,
				})
			: null;
		// The hand-off belongs to the table's own rate step, not to a peek at it.
		const moment = tableTalk && table.step === 'rate' ? rateMoment(table, uid) : null;

		let body: m.Children = null;
		let action: m.Children = null;
		if (step === 'pick') {
			body = m(QuestionPick, {
				questions: pickQuestions,
				chosenId,
				canChoose: isAsker,
				onPick: pickQuestion,
				onAddOwn: async (text: string) => {
					await createTableQuestion(main, text, table.tableId);
				},
			});
			action = isAsker
				? m(
						'button.btn.btn--primary',
						{
							type: 'button',
							'data-testid': 'table-start',
							disabled: !chosenId || self.busy,
							onclick: () => act({ action: 'toTalk' }),
						},
						t('turn.to_talk'),
					)
				: null;
		} else if (step === 'talk') {
			body = m(TalkScreen, { kind, table, uid, mates, prompt, busy: self.busy, onAction: act });
			action = talkFinishAction(kind, table, uid, mates, self.busy, act);
		} else if (step === 'write') {
			body = m(WritePanel, {
				main,
				kind,
				table,
				feed,
				uid,
				mates,
				question: tableQuestion,
				challenge,
				locked: ballotFrozen,
				busy: self.busy,
				onAction: act,
			});
			action = isAsker
				? m(
						'button.btn.btn--secondary',
						{
							type: 'button',
							'data-testid': 'table-to-rate',
							disabled: self.busy,
							onclick: () => act({ action: 'toRate' }),
						},
						t('turn.to_rate'),
					)
				: null;
		} else {
			body = rateBody({
				feed,
				items,
				challengeId,
				uid,
				mates,
				plenum,
				proposals: kind === 'proposals',
				moment,
				sent: tableTalk ? sentCount(table, feed.options) : null,
				mineAnswer: tableTalk ? myAnswer(table, feed.options, uid) : null,
				editor,
				editing: self.editing,
				onToggleEdit: () => {
					self.editing = !self.editing;
				},
				onError: (message: string) => {
					self.error = message;
				},
				someone,
			});
			action = moment?.card
				? m(
						'button.btn.btn--primary',
						{
							type: 'button',
							'data-testid': 'table-claim',
							disabled: self.busy,
							onclick: claimTurn,
						},
						t(self.busy ? 'turn.saving' : 'turn.start_mine'),
					)
				: null;
		}

		const official: TableStep = view.official;
		const instruction = peek
			? t(`turn.peek_why_${official}`)
			: (() => {
					const line = instructionFor(
						official,
						{ kind, table, uid, mates, timeUp: isTimeUp(table) },
						someone,
					);

					return t(line.key, line.params);
				})();
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
		const classButton = m(
			'button.btn.btn--secondary.btn--small.flow__class',
			{
				type: 'button',
				onclick: () => {
					self.sheetOpen = true;
				},
			},
			[unrated > 0 ? m('span.flow__count', `${unrated} · `) : null, t('rate.class_writing')],
		);
		// At rate the asker's turn is over: the askers row and the card say who is next.
		const showAskerLine = !tableTalk || table.step !== 'rate';

		return [
			m(
				StudentFrame,
				{
					headerLine,
					askerMark: isAsker && showAskerLine ? '?' : undefined,
					instruction,
					action,
					down: step === 'talk',
				},
				[
					m('.flow__bar', [
						showAskerLine
							? m('p.flow__asker', { 'data-testid': isAsker ? 'asker-mark' : undefined }, askerLine)
							: m('span'),
						classButton,
					]),
					tableTalk ? m(AskersRow, { chips: askerStates(table, mates), uid }) : null,
					m(SubStepStrip, { kind, view, onSelect: setLocal }),
					m(ErrorLine, {
						message: self.error,
						onRetry: self.retry ? () => void self.retry?.() : undefined,
					}),
					body,
				],
			),
			self.sheetOpen
				? m(
						Sheet,
						{
							title: t(kind === 'proposals' ? 'proposal.class_list' : 'answer.class_list'),
							onClose: () => {
								self.sheetOpen = false;
							},
						},
						m(RatedList, {
							items,
							feed,
							challengeId,
							emptyText: t(kind === 'proposals' ? 'proposal.none_yet' : 'answer.none_yet'),
							onError: (message: string) => {
								self.error = message;
							},
						}),
					)
				: null,
		];
	},
};
