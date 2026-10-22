import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t, getLang } from '@/lib/i18n';
import { myProposal } from '@/lib/classroom/c3Logic';
import { joinNames } from '@/lib/classroom/listNames';
import { namesOf, type RateMoment, type SentCount } from '@/lib/classroom/turnMoment';
import type { Mate } from '@/lib/classroom/c3Logic';
import type { FlowFeed } from './FlowFeed';
import { HandOffCard } from './HandOffCard';
import { LiveWritersCard } from './LiveWritersCard';
import { RatedList } from './RatedList';
import { TextCard } from './TextCard';

export interface RateScreenInput {
	feed: FlowFeed;
	items: Statement[];
	challengeId: string | null;
	uid: string;
	mates: readonly Mate[];
	/** Proposals: the plenum order and the own proposal on top. */
	plenum: boolean;
	proposals: boolean;
	/** Table talk only: the turn's hand-off, the sent count and the own answer. */
	moment: RateMoment | null;
	sent: SentCount | null;
	mineAnswer: Statement | null;
	/** The write box, shown in place of the own-text card while editing. */
	editor: m.Children;
	editing: boolean;
	onToggleEdit: () => void;
	onError: (message: string) => void;
	someone: string;
}

function emptyKey(proposals: boolean): string {
	return proposals ? 'proposal.none_yet' : 'answer.none_yet';
}

/** Who asks next, for the phones that cannot claim (UX 16.C F). */
function nextLine(input: RateScreenInput): m.Children {
	const { moment, sent, mates, someone } = input;
	if (!moment || !sent) return null;
	const sentLine = t('turn.sent_count', { n: sent.n, m: sent.m });
	if (moment.allAsked) {
		return m(
			'p.flow__next',
			{ 'data-testid': 'rate-next' },
			`${t('turn.all_asked')} · ${sentLine}`,
		);
	}
	if (moment.card) return null;
	const names = namesOf(moment.nextUids, mates, someone);

	return [
		m(
			'p.flow__next',
			{ 'data-testid': 'rate-next' },
			names.length === 1
				? t('turn.next_is', { name: names[0] })
				: t('turn.next_one_of', { names: joinNames(names, getLang()) }),
		),
		m('p.flow__sent', sentLine),
	];
}

function ownCard(input: RateScreenInput, text: string, editable: boolean): m.Children {
	return m(TextCard, {
		mine: true,
		eyebrow: t(input.proposals ? 'proposal.mine' : 'answer.mine'),
		text,
		footer: editable
			? m(
					'button.btn.btn--secondary.btn--small',
					{ type: 'button', onclick: input.onToggleEdit },
					t('proposal.edit'),
				)
			: undefined,
	});
}

/**
 * The rate screen: at Table talk the hand-off card, who asks next, the sent
 * count and "my answer" (with edit); at Proposals the plenum line and the
 * pinned own proposal. Then the class's answers.
 */
export function rateBody(input: RateScreenInput): m.Children {
	const { feed, items, challengeId, plenum, proposals, moment, sent, mineAnswer, uid } = input;
	const list = m(RatedList, {
		items,
		feed,
		challengeId,
		plenum,
		emptyText: t(emptyKey(proposals)),
		onError: input.onError,
	});
	const editDone = input.editing
		? m(
				'button.btn.btn--secondary.btn--small',
				{ type: 'button', onclick: input.onToggleEdit },
				t('proposal.edit_done'),
			)
		: null;
	if (!proposals) {
		const mineText = mineAnswer
			? ownCard(input, mineAnswer.statement, mineAnswer.creatorId === uid)
			: null;

		return [
			moment?.card && sent ? m(HandOffCard, { mode: moment.card, sent }) : null,
			nextLine(input),
			input.editing ? [input.editor, editDone] : mineText,
			m(LiveWritersCard),
			list,
		];
	}
	if (!plenum) return [m(LiveWritersCard), list];
	const mine = myProposal(
		feed.options.filter((o) => o.parentId === challengeId),
		uid,
	);

	return [
		m('p.flow__plenum', t('proposal.plenum_line')),
		input.editing ? [input.editor, editDone] : null,
		mine && !input.editing ? ownCard(input, mine.statement, true) : null,
		list,
	];
}
