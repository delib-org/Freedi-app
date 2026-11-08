import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { TextCard } from './TextCard';
import { ReplyEntry } from '../replies/ReplyEntry';

/**
 * The student's own proposals as pinned cards, for a student who may hold several
 * (the limit is unlimited, or was lowered after they sent more than one). Each
 * stays editable until the Vote opens and keeps its own replies. Props in, vnodes out.
 */

export interface OwnProposalCardsInput {
	proposals: readonly Statement[];
	uid: string;
	canEdit: boolean;
	onEdit: (proposalId: string) => void;
}

export function ownProposalCards(input: OwnProposalCardsInput): m.Children {
	if (input.proposals.length === 0) return null;

	return m(
		'.own-proposals',
		{ 'data-testid': 'own-proposals' },
		input.proposals.map((proposal) =>
			m('.own-proposals__item', { key: proposal.statementId, 'data-testid': 'own-proposal' }, [
				m(TextCard, {
					mine: true,
					eyebrow: t('proposal.mine'),
					text: proposal.statement,
					replies: m(ReplyEntry, { proposal, uid: input.uid }),
					footer: input.canEdit
						? m(
								'button.btn.btn--secondary.btn--small',
								{ type: 'button', onclick: () => input.onEdit(proposal.statementId) },
								t('proposal.edit'),
							)
						: undefined,
				}),
				proposal.hide ? m('p.write-panel__note', t('proposal.hidden_mine')) : null,
			]),
		),
	);
}
