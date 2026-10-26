import m from 'mithril';
import type { ClassTable, ClassTableAction, Statement, WritingMode } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import {
	getLiveDrafts,
	isBroadcasting,
	startBroadcast,
	stopBroadcast,
	updateBroadcastText,
} from '@/lib/liveDrafts';
import { createClassOption, updateClassOption } from '@/lib/classroom/c3Data';
import { clearDraft, readDraft, writeDraft, type DraftKind } from '@/lib/classroom/c3Draft';
import { myProposal, type FlowKind, type Mate } from '@/lib/classroom/c3Logic';
import type { FlowFeed } from './FlowFeed';
import { ErrorLine } from './ErrorLine';
import { ModeSwitch, WriteBox, type WriteState } from './WriteBox';
import { ReplyEntry } from '../replies/ReplyEntry';
import { PushAsk } from '../replies/PushAsk';

export interface WritePanelAttrs {
	main: Statement;
	kind: FlowKind;
	table: ClassTable;
	feed: FlowFeed;
	uid: string;
	mates: Mate[];
	/** The table's picked question (answers go under it); null when none yet. */
	question: Statement | null;
	/** The challenge question (proposals go under it); null when the lesson has none. */
	challenge: Statement | null;
	/** The ballot is frozen: proposals can no longer change. */
	locked: boolean;
	busy: boolean;
	onAction: (action: ClassTableAction) => void;
}

type Edits = Record<DraftKind, string | undefined>;
type States = Record<DraftKind, WriteState>;

class PanelState {
	scope = '';
	edits: Edits = { answer: undefined, proposal: undefined };
	states: States = { answer: 'idle', proposal: 'idle' };
	broadcast = true;
	lastTyped: DraftKind = 'answer';
	sending = false;
	error: string | null = null;
}

function answerScope(table: ClassTable): string {
	return `${table.tableId}_${table.turn}`;
}

/** The proposal is one per student for the whole lesson: its draft is keyed by the workspace. */
function proposalScope(main: Statement): string {
	return main.statementId;
}

function sentAnswerOf(a: WritePanelAttrs): Statement | undefined {
	const { feed, table, uid } = a;
	if (!table.questionId) return undefined;

	return feed.options.find(
		(o) =>
			o.parentId === table.questionId &&
			(o.creatorId === uid ||
				(table.writingMode === 'table' && o.classTable?.tableId === table.tableId)),
	);
}

function sentProposalOf(a: WritePanelAttrs): Statement | null {
	if (!a.challenge) return null;
	const id = a.challenge.statementId;

	return myProposal(
		a.feed.options.filter((o) => o.parentId === id),
		a.uid,
	);
}

/**
 * The write screen (UX §2.6.3 + §11): an answer box, a "proposal for a
 * solution (optional)" box at Table talk (proposal box alone at Proposals), the
 * writing-mode switch for the asker, the broadcast checkbox and "Send". A send
 * that fails keeps the draft (localStorage) and shows an inline retry.
 *
 * TODO(UX 16, table turn v2): Proposals is the only caller now (nobody writes at
 * Table talk), so every `kind === 'tableTalk'` branch below, the answer box and
 * the writing-mode switch are dead. Remove them with their `answer.*` keys and
 * the `question` prop in a focused follow-up.
 */
export const WritePanel: m.ClassComponent<WritePanelAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: PanelState }).self = new PanelState();
	},

	onremove() {
		if (isBroadcasting()) void stopBroadcast();
	},

	view(vnode) {
		const self = (vnode.state as { self?: PanelState }).self as PanelState;
		const a = vnode.attrs;
		const { table, uid } = a;
		const scope = `${answerScope(table)}|${proposalScope(a.main)}`;
		if (scope !== self.scope) {
			self.scope = scope;
			const answerDraft = readDraft(answerScope(table), 'answer');
			const proposalDraft = readDraft(proposalScope(a.main), 'proposal');
			self.edits = { answer: answerDraft || undefined, proposal: proposalDraft || undefined };
			self.states = { answer: 'idle', proposal: 'idle' };
		}
		const isAsker = table.askerUid === uid;
		const tableMode = table.writingMode === 'table';
		const showAnswer = a.kind === 'tableTalk' && !!table.questionId;
		const answerEditable = showAnswer && (!tableMode || isAsker);
		const showProposal = !!a.challenge;
		const sentAnswer = sentAnswerOf(a);
		const sentProposal = sentProposalOf(a);

		const valueOf = (kind: DraftKind): string => {
			const edited = self.edits[kind];
			if (edited !== undefined) return edited;
			if (kind === 'answer') {
				if (!answerEditable) {
					const mirror = getLiveDrafts({ excludeSelf: true }).find(
						(d) => d.userId === table.askerUid,
					);

					return sentAnswer?.statement ?? mirror?.text ?? '';
				}

				return sentAnswer?.statement ?? '';
			}

			return sentProposal?.statement ?? '';
		};
		const stateOf = (kind: DraftKind): WriteState => {
			if (self.states[kind] === 'sending' || self.states[kind] === 'failed')
				return self.states[kind];
			const sent = kind === 'answer' ? sentAnswer : sentProposal;
			const edited = self.edits[kind];

			return sent && (edited === undefined || edited.trim() === sent.statement) ? 'sent' : 'idle';
		};

		const forceBroadcast = tableMode && isAsker && showAnswer;
		const wantBroadcast = self.broadcast || forceBroadcast;
		const onInput = (kind: DraftKind, text: string): void => {
			self.edits[kind] = text;
			self.states[kind] = 'idle';
			self.lastTyped = kind;
			const scopeId = kind === 'answer' ? answerScope(table) : proposalScope(a.main);
			writeDraft(scopeId, kind, text);
			if (!wantBroadcast) return;
			if (isBroadcasting()) updateBroadcastText(text);
			else void startBroadcast(text);
		};

		const dirty = (kind: DraftKind): boolean => {
			const text = (self.edits[kind] ?? '').trim();

			return text.length > 0 && stateOf(kind) !== 'sent';
		};
		const canSend =
			!self.sending &&
			((answerEditable && dirty('answer')) || (showProposal && !a.locked && dirty('proposal')));

		const sendOne = async (kind: DraftKind): Promise<void> => {
			const text = (self.edits[kind] ?? '').trim();
			self.states[kind] = 'sending';
			m.redraw();
			try {
				if (kind === 'answer') {
					const coAuthors = tableMode
						? (a.mates.length > 0 ? a.mates.map((x) => x.uid) : table.memberUids).filter(
								(x) => x !== uid,
							)
						: [];
					if (sentAnswer && sentAnswer.creatorId === uid)
						await updateClassOption(sentAnswer.statementId, text);
					else if (table.questionId) {
						await createClassOption({
							main: a.main,
							parentId: table.questionId,
							text,
							marker: { tableId: table.tableId, shared: tableMode, coAuthors },
						});
					}
					clearDraft(answerScope(table), 'answer');
				} else if (a.challenge) {
					if (sentProposal) await updateClassOption(sentProposal.statementId, text);
					else {
						await createClassOption({
							main: a.main,
							parentId: a.challenge.statementId,
							text,
							marker: { tableId: table.tableId, shared: false, coAuthors: [] },
						});
					}
					clearDraft(proposalScope(a.main), 'proposal');
				}
				self.edits[kind] = undefined;
				self.states[kind] = 'sent';
			} catch (error) {
				self.states[kind] = 'failed';
				throw error;
			}
		};
		const send = (): void => {
			self.sending = true;
			self.error = null;
			const kinds: DraftKind[] = [];
			if (answerEditable && dirty('answer')) kinds.push('answer');
			if (showProposal && !a.locked && dirty('proposal')) kinds.push('proposal');
			(async () => {
				for (const kind of kinds) await sendOne(kind);
				if (isBroadcasting()) await stopBroadcast();
			})()
				.catch(() => {
					self.error = t('answer.send_failed');
				})
				.finally(() => {
					self.sending = false;
					m.redraw();
				});
		};

		const asker = a.mates.find((x) => x.uid === table.askerUid);
		const answerLabel = answerEditable
			? t(tableMode ? 'answer.our' : 'answer.mine')
			: t('answer.writing_for_table', { name: asker?.name ?? t('turn.someone') });
		const proposalLabel = t(a.kind === 'tableTalk' ? 'proposal.optional' : 'proposal.mine');
		const busySend =
			self.sending || stateOf('answer') === 'sending' || stateOf('proposal') === 'sending';

		return m('.write-panel', [
			a.kind === 'tableTalk' && table.questionId && a.question
				? m('p.write-panel__question', { dir: 'auto' }, a.question.statement)
				: null,
			showAnswer && isAsker
				? m(ModeSwitch, {
						mode: table.writingMode,
						disabled: table.writingLocked || a.busy,
						onChange: (mode: WritingMode) => a.onAction({ action: 'setWritingMode', mode }),
					})
				: null,
			a.kind === 'tableTalk' && !table.questionId
				? m('p.write-panel__note', t('answer.no_question'))
				: null,
			showAnswer
				? m(WriteBox, {
						label: answerLabel,
						value: valueOf('answer'),
						onInput: (text: string) => onInput('answer', text),
						readOnly: !answerEditable,
						state: stateOf('answer'),
						placeholder: t('answer.placeholder'),
						testId: 'answer-box',
					})
				: null,
			showProposal
				? m(WriteBox, {
						label: proposalLabel,
						value: valueOf('proposal'),
						onInput: (text: string) => onInput('proposal', text),
						readOnly: a.locked,
						state: stateOf('proposal'),
						placeholder: t('proposal.placeholder'),
						testId: 'proposal-box',
					})
				: m('p.write-panel__note', t('proposal.none')),
			sentProposal?.hide ? m('p.write-panel__note', t('proposal.hidden_mine')) : null,
			sentProposal && a.kind === 'proposals' && !sentProposal.hide
				? [
						m(ReplyEntry, { proposal: sentProposal, own: true, uid: a.uid }),
						m(PushAsk, { mainId: a.main.statementId }),
					]
				: null,
			m('label.write-panel__broadcast', [
				m('input', {
					type: 'checkbox',
					checked: wantBroadcast,
					disabled: forceBroadcast ? true : undefined,
					onchange: (event: Event) => {
						self.broadcast = (event.target as HTMLInputElement).checked;
						if (self.broadcast) void startBroadcast(valueOf(self.lastTyped));
						else void stopBroadcast();
					},
				}),
				m('span', t('answer.broadcast')),
			]),
			wantBroadcast ? m('p.write-panel__live', t('answer.broadcast_on')) : null,
			m(ErrorLine, { message: self.error, onRetry: canSend ? send : undefined }),
			answerEditable || (showProposal && !a.locked)
				? m(
						'button.btn.btn--primary.write-panel__send',
						{
							type: 'button',
							'data-testid': showAnswer ? 'answer-send' : 'proposal-send',
							disabled: !canSend || undefined,
							onclick: send,
						},
						busySend
							? t('answer.sending')
							: t(a.kind === 'tableTalk' ? 'answer.send' : 'proposal.send'),
					)
				: null,
		]);
	},
};
