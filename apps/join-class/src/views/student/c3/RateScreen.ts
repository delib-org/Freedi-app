import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { myProposal } from '@/lib/classroom/c3Logic';
import type { FlowFeed } from './FlowFeed';
import { RatedList } from './RatedList';
import { TextCard } from './TextCard';
import { ReplyEntry } from '../replies/ReplyEntry';

export interface RateScreenInput {
	feed: FlowFeed;
	items: Statement[];
	challengeId: string | null;
	uid: string;
	/** The plenum order and the own proposal on top. */
	plenum: boolean;
	/** The write box, shown in place of the own-text card while editing. */
	editor: m.Children;
	editing: boolean;
	onToggleEdit: () => void;
	onError: (message: string) => void;
}

function ownCard(input: RateScreenInput, mine: Statement): m.Children {
	return m(TextCard, {
		mine: true,
		eyebrow: t('proposal.mine'),
		text: mine.statement,
		replies: m(ReplyEntry, { proposal: mine, uid: input.uid }),
		footer: m(
			'button.btn.btn--secondary.btn--small',
			{ type: 'button', onclick: input.onToggleEdit },
			t('proposal.edit'),
		),
	});
}

/**
 * The rate screen of Proposals: at the plenum the line and the pinned own
 * proposal, then the class's proposals. (Table talk has no rate screen: nobody
 * writes or rates there.)
 */
export function rateBody(input: RateScreenInput): m.Children {
	const { feed, items, challengeId, plenum, uid } = input;
	const list = m(RatedList, {
		items,
		feed,
		challengeId,
		plenum,
		emptyText: t('proposal.none_yet'),
		onError: input.onError,
	});
	if (!plenum) return list;
	const mine = myProposal(
		feed.options.filter((o) => o.parentId === challengeId),
		uid,
	);
	const editDone = input.editing
		? m(
				'button.btn.btn--secondary.btn--small',
				{ type: 'button', onclick: input.onToggleEdit },
				t('proposal.edit_done'),
			)
		: null;

	return [
		m('p.flow__plenum', t('proposal.plenum_line')),
		input.editing ? [input.editor, editDone] : null,
		mine && !input.editing ? ownCard(input, mine) : null,
		list,
	];
}
