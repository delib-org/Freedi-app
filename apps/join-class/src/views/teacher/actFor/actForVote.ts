import m from 'mithril';
import type { ClassBallot, Statement } from '@freedi/shared-types';
import '@/styles/student-c3-vote.scss';
import { t } from '@/lib/i18n';
import { voteActionState, type ActForStudent } from '@/lib/classroom/actFor';
import { VoteList } from '@/views/student/c3/VoteList';
import type { StudentSlot } from './actForState';

/**
 * The vote part of the act-for sheet, for one student's slot: their current vote shows,
 * a card is the vote (changeable while the ballot is open), and the confirmation says
 * whose vote was counted. Paused, closed or held: read-only. The cards keep the ballot's
 * own order, so nothing moves under the teacher's finger, and carry no live counts:
 * results visibility is not this sheet's to change.
 */

export interface ActForVoteInput {
	student: ActForStudent;
	slot: StudentSlot;
	ballot: ClassBallot | undefined;
	proposals: readonly Statement[];
	held: boolean;
}

const STATE_KEY = {
	'not-open': 'console.act_for_vote_not_open',
	paused: 'voting.paused',
	closed: 'voting.closed',
	held: 'console.act_for_held',
} as const;

export function actForVote(input: ActForVoteInput): m.Children {
	const { student, slot, ballot, proposals, held } = input;
	const state = voteActionState(ballot, held);
	const ids = ballot?.candidateIds ?? [];
	const open = state === 'open';
	const candidates = ids
		.map((id) => proposals.find((proposal) => proposal.statementId === id))
		.filter((proposal): proposal is Statement => !!proposal);
	const { caster } = slot;
	const pending = open && caster.pending && !!caster.wanted && ids.includes(caster.wanted);
	const selected = open && (pending || caster.failed) ? caster.wanted : slot.votedId;
	const writing = pending && !caster.failed;
	const counted = open && !writing && !!selected && selected === slot.votedId;
	const label = t('console.vote_for', { name: student.name });

	return [
		m('h3.act-for__action-title', label),
		state === 'open'
			? null
			: m(
					'p.act-for__note',
					{ role: 'status', 'data-testid': 'act-for-readonly' },
					t(STATE_KEY[state]),
				),
		m(
			'p.act-for__status',
			{
				role: 'status',
				'data-testid': counted ? 'act-for-confirm' : undefined,
				class: counted ? 'act-for__status--done' : '',
			},
			writing
				? t('voting.saving')
				: counted
					? t('console.vote_counted_for', { name: student.name })
					: '',
		),
		ballot && candidates.length === 0 ? m('p.act-for__note', t('voting.empty')) : null,
		candidates.length > 0
			? m(VoteList, {
					candidates,
					selectedId: selected,
					locked: !open,
					results: null,
					animateReorder: false,
					winnerId: state === 'closed' ? (ballot?.decisionId ?? null) : null,
					onSelect: (id: string) => {
						if (open) caster.pick(id);
					},
				})
			: null,
		caster.failed && open
			? m('p.act-for__error', { role: 'alert', 'data-testid': 'act-for-error' }, [
					m('span', t('voting.failed')),
					m(
						'button.btn.btn--secondary.btn--small',
						{ type: 'button', 'data-testid': 'act-for-retry', onclick: () => caster.retry() },
						t('console.retry'),
					),
				])
			: null,
	];
}
