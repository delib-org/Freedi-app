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
	myProposal,
	resolveSubstep,
	type FlowKind,
	type SubstepOverride,
} from '@/lib/classroom/c3Logic';
import { FlowFeed } from './FlowFeed';
import { ErrorLine } from './ErrorLine';
import { LiveWritersCard } from './LiveWritersCard';
import { QuestionPick, type PickQuestion } from './QuestionPick';
import { RatedList } from './RatedList';
import { Sheet } from './Sheet';
import { SubStepStrip } from './SubStepStrip';
import { TalkScreen, talkFinishAction } from './TalkScreen';
import { TextCard } from './TextCard';
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
	editingProposal = false;
	liveFor: string | null = null;
}

function stateOf(vnode: m.Vnode<TableFlowAttrs>): FlowState {
	return (vnode.state as { self?: FlowState }).self as FlowState;
}

/**
 * One table's whole student experience at Table talk and at Proposals (UX
 * §2.6, §2.7, §3, §11): header line, asker line, the four-pill sub-step strip,
 * and the screen of the table's step (pick, talk, write, rate). The table doc
 * (listener started by StudentStage) decides the default screen; the pills
 * only change what THIS phone shows. Every callable shows an inline error with
 * a retry; none of them can crash the screen.
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
		const feed = self.feed;
		// Only the people the table doc seats (a stale tableId on a subscription must not add a chip).
		const seated = feed.mates.filter((x) => table.memberUids.includes(x.uid));
		const mates =
			seated.length > 0
				? seated
				: table.memberUids.map((id) => ({ uid: id, name: t('turn.someone') }));
		const isAsker = table.askerUid === uid;
		const view = resolveSubstep(kind, table, self.override);
		const step = view.current;
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
				} catch {
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

		const asker = mates.find((x) => x.uid === table.askerUid);
		const askerLine = isAsker
			? t('turn.asker_me')
			: t('turn.asker', { name: asker?.name ?? t('turn.someone') });
		const stepName = t(`turn.now_${step}`);
		const headerLine =
			kind === 'tableTalk'
				? t('turn.header', { n: table.n, turn: table.turn, step: stepName })
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

		let body: m.Children = null;
		let action: m.Children = null;
		if (step === 'pick') {
			body = m(QuestionPick, {
				questions: pickQuestions,
				chosenId,
				canChoose: isAsker,
				onPick: (id: string) => {
					self.chosenId = id;
				},
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
							onclick: () =>
								run(async () => {
									if (!chosenId) return;
									if (chosenId !== table.questionId) {
										await classTableStep({
											tableId: table.tableId,
											action: 'pickQuestion',
											questionId: chosenId,
										});
									}
									await classTableStep({ tableId: table.tableId, action: 'toTalk' });
								}),
						},
						t('question.read_start'),
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
			const editor =
				plenum && self.editingProposal
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
			body = rateBody(self, vnode.attrs, items, challengeId, plenum, uid, editor);
			action =
				isAsker && kind === 'tableTalk'
					? m(
							'button.btn.btn--primary',
							{
								type: 'button',
								'data-testid': 'table-next-turn',
								disabled: self.busy,
								onclick: () => act({ action: 'nextTurn' }),
							},
							t('turn.next_turn'),
						)
					: null;
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

		return [
			m(
				StudentFrame,
				{
					headerLine,
					askerMark: isAsker ? '?' : undefined,
					instruction: t(`turn.instr_${step}`),
					action,
					down: step === 'talk',
				},
				[
					m('.flow__bar', [
						m('p.flow__asker', { 'data-testid': isAsker ? 'asker-mark' : undefined }, askerLine),
						classButton,
					]),
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

/** The rate screen: live writers, the list, and in the plenum the pinned own proposal. */
function rateBody(
	self: FlowState,
	attrs: TableFlowAttrs,
	items: Statement[],
	challengeId: string | null,
	plenum: boolean,
	uid: string,
	editor: m.Children,
): m.Children {
	const mine = plenum
		? myProposal(
				self.feed.options.filter((o) => o.parentId === challengeId),
				uid,
			)
		: null;
	const list = m(RatedList, {
		items,
		feed: self.feed,
		challengeId,
		plenum,
		emptyText: t(attrs.kind === 'proposals' ? 'proposal.none_yet' : 'answer.none_yet'),
		onError: (message: string) => {
			self.error = message;
		},
	});
	if (!plenum) return [m(LiveWritersCard), list];

	return [
		m('p.flow__plenum', t('proposal.plenum_line')),
		editor,
		editor
			? m(
					'button.btn.btn--secondary.btn--small',
					{
						type: 'button',
						onclick: () => {
							self.editingProposal = false;
						},
					},
					t('proposal.edit_done'),
				)
			: null,
		mine && !editor
			? m(TextCard, {
					mine: true,
					eyebrow: t('proposal.mine'),
					text: mine.statement,
					footer: m(
						'button.btn.btn--secondary.btn--small',
						{
							type: 'button',
							onclick: () => {
								self.editingProposal = !self.editingProposal;
							},
						},
						t('proposal.edit'),
					),
				})
			: null,
		list,
	];
}
