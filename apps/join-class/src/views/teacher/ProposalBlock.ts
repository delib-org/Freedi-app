import m from 'mithril';
import '@/styles/teacher-threads.scss';
import { t } from '@/lib/i18n';
import type { WrittenText } from '@/lib/classroom/textsHelpers';
import { HideControl } from './HideControl';
import { TeacherReplies, visibleReplyCount } from './TeacherReplies';

/**
 * One proposal in "מה כתבו" (IA 24.1): a block with two levels, never a flat
 * list. The parent is the proposal itself: its eyebrow, the text, who wrote it
 * (real name), how many rated it and how many replied, its state and its hide
 * control. Its replies, children of the block, sit under it (TeacherReplies).
 * A hidden proposal stays greyed, its replies still visible to the teacher.
 */

export interface ProposalBlockAttrs {
	text: WrittenText;
	mainId: string;
}

function repliesMeta(n: number): string {
	return n === 1 ? t('console.replies_one') : t('console.replies_n', { n });
}

export const ProposalBlock: m.Component<ProposalBlockAttrs> = {
	view({ attrs }) {
		const { text, mainId } = attrs;

		return m(
			'li.proposal-block',
			{
				key: text.id,
				class: text.hidden ? 'proposal-block--hidden' : '',
				'data-testid': 'proposal-block',
			},
			[
				m('div.proposal-block__parent', [
					m('p.proposal-block__eyebrow', t('console.proposal_label')),
					m('p.proposal-block__text', { dir: 'auto' }, text.text),
					m('p.written-card__meta', [
						text.author ? m('span', text.author) : null,
						m('span', t('console.ratings_n', { count: text.ratings })),
						m('span', repliesMeta(visibleReplyCount(text.id))),
						text.hidden ? m('span.written-card__flag.chip-hidden', t('console.hidden_flag')) : null,
					]),
					m(HideControl, { statementId: text.id, hidden: text.hidden, testId: 'proposal-hide' }),
				]),
				m('div.proposal-block__children', m(TeacherReplies, { mainId, proposalId: text.id })),
			],
		);
	},
};
