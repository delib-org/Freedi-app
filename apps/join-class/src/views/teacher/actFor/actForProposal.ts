import m from 'mithril';
import { CLASS_PROPOSAL_MAX_LENGTH } from '@freedi/shared-types';
import type { ClassProposalLimit, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { proposalActionState, type ActForStudent } from '@/lib/classroom/actFor';
import { clearDraft, writeDraft } from '@/lib/classroom/c3Draft';
import { myProposals } from '@/lib/classroom/c3Logic';
import {
	otherOwnProposals,
	showsOwnProposalList,
	writeTargetOf,
	type WriteTarget,
} from '@/lib/classroom/proposalLimit';
import {
	changeProposal,
	newProposalId,
	sendProposal,
	type ProposalResult,
} from '@/lib/classroom/proposals';
import { refusalReason } from '@/lib/classroom/turnMoment';
import { draftScopeOf, type StudentSlot } from './actForState';

/**
 * The proposal part of the act-for sheet, for one student's slot. The same box rules
 * as a phone (writeTargetOf): the teacher's text goes in that student's draft, and the
 * action and the confirmation both say whose it is. The language check is off for the
 * teacher, so a refusal here can only be the limit or a failure; a failure keeps the
 * draft and offers a retry.
 */

export interface ActForProposalInput {
	mainId: string;
	student: ActForStudent;
	slot: StudentSlot;
	proposals: readonly Statement[];
	ballot: unknown;
	held: boolean;
	limit: ClassProposalLimit;
}

function targetOf(input: ActForProposalInput, mine: readonly Statement[]): WriteTarget {
	return writeTargetOf({
		limit: input.limit,
		mine,
		editId: input.slot.editId,
		hasNewDraft: input.slot.newText.trim() !== '',
	});
}

function textOf(slot: StudentSlot, target: WriteTarget): string {
	if (target.kind !== 'edit') return slot.newText;

	return slot.editText?.id === target.proposal.statementId
		? slot.editText.text
		: target.proposal.statement;
}

/** The teacher's words are not language-checked, so a refusal here is unexpected: never treat it as sent. */
function assertSent(result: ProposalResult): void {
	if (!result.ok) throw new Error(`The proposal was refused: ${result.reason}`);
}

async function send(input: ActForProposalInput, target: WriteTarget, text: string): Promise<void> {
	const { mainId, slot, student } = input;
	if (slot.sending || target.kind === 'blocked') return;
	slot.sending = true;
	slot.sendFailed = false;
	slot.notice = null;
	m.redraw();
	try {
		if (target.kind === 'edit') {
			assertSent(await changeProposal(mainId, target.proposal.statementId, text));
			slot.editText = null;
			slot.editId = null;
			slot.notice = 'saved';
		} else {
			slot.proposalId ??= newProposalId();
			assertSent(await sendProposal(mainId, slot.proposalId, text, student.id));
			slot.proposalId = null;
			slot.newText = '';
			clearDraft(draftScopeOf(mainId, student.id), 'proposal');
			slot.notice = 'sent';
		}
	} catch (error) {
		if (refusalReason(error) === 'already-proposed') slot.limitRefused = true;
		else slot.sendFailed = true;
		// Never the text: it is a child's words.
		console.error(
			'[ActFor] proposal failed',
			{
				operation: 'actFor.sendProposal',
				statementId: mainId,
				metadata: { studentId: student.id },
			},
			error,
		);
	} finally {
		slot.sending = false;
		m.redraw();
	}
}

function ownCards(
	input: ActForProposalInput,
	others: readonly Statement[],
	canEdit: boolean,
): m.Children {
	if (others.length === 0) return null;

	return m(
		'ul.act-for__own',
		others.map((proposal) =>
			m('li.act-for__own-item', { key: proposal.statementId, 'data-testid': 'act-for-own' }, [
				m('p.act-for__own-text', { dir: 'auto' }, proposal.statement),
				canEdit
					? m(
							'button.btn.btn--tertiary.btn--small',
							{
								type: 'button',
								onclick: () => {
									input.slot.editId = proposal.statementId;
									input.slot.notice = null;
								},
							},
							t('proposal.edit'),
						)
					: null,
			]),
		),
	);
}

function closedLine(state: 'frozen' | 'held'): m.Vnode {
	return m(
		'p.act-for__note',
		{ role: 'status', 'data-testid': 'act-for-readonly' },
		t(state === 'frozen' ? 'console.act_for_closed' : 'console.act_for_held'),
	);
}

function noticeLine(input: ActForProposalInput): m.Children {
	const { slot, student } = input;
	if (!slot.notice) return m('p.act-for__status', { role: 'status' });

	return m(
		'p.act-for__status.act-for__status--done',
		{ role: 'status', 'data-testid': 'act-for-confirm' },
		t(slot.notice === 'sent' ? 'console.proposal_sent_for' : 'console.proposal_saved_for', {
			name: student.name,
		}),
	);
}

export function actForProposal(input: ActForProposalInput): m.Children {
	const { slot, student, limit, mainId } = input;
	const mine = myProposals(input.proposals, student.id);
	// A send whose answer was lost, seen arriving by the listener: it is sent, not a draft any more.
	if (slot.proposalId) {
		const landed = mine.find((proposal) => proposal.statementId === slot.proposalId);
		if (landed) {
			slot.proposalId = null;
			slot.sendFailed = false;
			if (slot.newText.trim() === landed.statement) {
				slot.newText = '';
				clearDraft(draftScopeOf(mainId, student.id), 'proposal');
			}
		}
	}
	const target = targetOf(input, mine);
	const state = proposalActionState(input.ballot, input.held);
	const others = otherOwnProposals(mine, target);
	if (state !== 'open') {
		return [closedLine(state), ownCards(input, mine, false)];
	}
	const text = textOf(slot, target);
	const trimmed = text.trim();
	const limitReached =
		limit === 'one' && (target.kind === 'blocked' || (slot.limitRefused && target.kind === 'new'));
	const unchanged = target.kind === 'edit' && trimmed === target.proposal.statement;
	const canSend = !slot.sending && trimmed !== '' && !unchanged && !limitReached;
	const areaId = `act-for-text-${student.id}`;
	const run = (): void => void send(input, target, trimmed);

	return [
		m(
			'form.act-for__write',
			{
				onsubmit: (e: Event) => {
					e.preventDefault();
					if (canSend) run();
				},
			},
			[
				m('label.act-for__label', { for: areaId }, t('console.act_for_text')),
				m('textarea.act-for__area', {
					id: areaId,
					dir: 'auto',
					rows: 3,
					maxlength: CLASS_PROPOSAL_MAX_LENGTH,
					value: text,
					placeholder: t('proposal.placeholder'),
					'data-testid': 'act-for-text',
					oninput: (e: Event) => {
						const value = (e.target as HTMLTextAreaElement).value;
						slot.notice = null;
						slot.sendFailed = false;
						if (target.kind === 'edit') {
							slot.editText = { id: target.proposal.statementId, text: value };

							return;
						}
						slot.newText = value;
						writeDraft(draftScopeOf(mainId, student.id), 'proposal', value);
					},
				}),
				limitReached
					? m(
							'p.act-for__note',
							{ role: 'status', 'data-testid': 'act-for-limit' },
							t('console.act_for_limit', { name: student.name }),
						)
					: null,
				m(
					'button.btn.btn--primary.act-for__action',
					{
						type: 'submit',
						'data-testid': 'act-for-propose',
						disabled: !canSend,
						'aria-busy': slot.sending ? 'true' : undefined,
					},
					t(target.kind === 'edit' ? 'console.save_for' : 'console.propose_for', {
						name: student.name,
					}),
				),
				slot.editId && (limit === 'unlimited' || mine.length > 1)
					? m(
							'button.btn.btn--secondary.btn--small',
							{
								type: 'button',
								onclick: () => {
									slot.editId = null;
									slot.editText = null;
								},
							},
							t('proposal.edit_done'),
						)
					: null,
			],
		),
		slot.sendFailed
			? m('p.act-for__error', { role: 'alert', 'data-testid': 'act-for-error' }, [
					m(
						'span',
						t('console.failed', { label: t('console.propose_for', { name: student.name }) }),
					),
					m(
						'button.btn.btn--secondary.btn--small',
						{ type: 'button', 'data-testid': 'act-for-retry', onclick: run },
						t('console.retry'),
					),
				])
			: null,
		noticeLine(input),
		showsOwnProposalList(limit, mine, target) ? ownCards(input, others, true) : null,
	];
}
