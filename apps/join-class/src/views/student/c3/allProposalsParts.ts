import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import type { Board } from '@/lib/classroom/allProposalsBoard';
import { boardCards } from '@/lib/classroom/allProposalsBoard';
import { RateFaces } from './RateFaces';
import { TextCard } from './TextCard';
import { ReplyEntry } from '../replies/ReplyEntry';

/**
 * The pieces of the "כל ההצעות" phone screen (IA 19.4): the board of served
 * batches (each later batch under an "n new proposals" divider), the cards with
 * the five faces, and the pinned own proposal. Props in, vnodes out.
 */

export interface BoardInput {
	board: Board;
	pool: readonly Statement[];
	ratingOf: (statementId: string) => number | undefined;
	onRate: (item: Statement, score: number) => void;
}

function reducedMotion(): boolean {
	return typeof window.matchMedia === 'function'
		? window.matchMedia('(prefers-reduced-motion: reduce)').matches
		: false;
}

/** "6 הצעות חדשות" / "הצעה חדשה". */
export function arrivalText(n: number): string {
	return n === 1 ? t('allProposals.new_one') : t('allProposals.new_n', { n });
}

function divider(count: number, live: boolean, index: number): m.Vnode {
	return m(
		'p.all-proposals__divider',
		{
			key: `divider-${index}`,
			'data-testid': 'all-proposals-divider',
			// A live arrival brings the new cards into view (no glide under reduced motion).
			oncreate: live
				? (vnode: m.VnodeDOM) =>
						(vnode.dom as HTMLElement).scrollIntoView({
							behavior: reducedMotion() ? 'auto' : 'smooth',
							block: 'start',
						})
				: undefined,
		},
		m('span.all-proposals__divider-text', arrivalText(count)),
	);
}

function card(item: Statement, input: BoardInput, arriving: boolean, order: number): m.Vnode {
	const value = input.ratingOf(item.statementId);
	const eyebrow =
		value === undefined ? t('proposal.title') : `${t('proposal.title')} · ${t('rate.rated')}`;

	return m(
		'.all-proposals__card',
		{
			key: item.statementId,
			'data-testid': 'all-proposals-card',
			class: arriving ? 'all-proposals__card--arriving' : '',
			style: arriving ? { '--arrive-order': String(order) } : undefined,
		},
		m(TextCard, {
			eyebrow,
			text: item.statement,
			footer: m(RateFaces, {
				value,
				testPrefix: 'all-proposals-face',
				onRate: (score: number) => input.onRate(item, score),
			}),
			replies: m(ReplyEntry, { proposal: item }),
		}),
	);
}

/** The board: batch after batch, rated cards kept in place, a divider before each later batch. */
export function boardView(input: BoardInput): m.Children {
	const batches = boardCards(input.board, input.pool);
	const children: m.Vnode[] = [];
	batches.forEach((cards, index) => {
		if (cards.length === 0) return;
		const live = input.board.batches[index].live;
		if (index > 0) children.push(divider(cards.length, live, index));
		cards.forEach((item, order) => children.push(card(item, input, live, order)));
	});

	return m('.all-proposals__board', children);
}

export interface OwnCardInput {
	mine: Statement | null;
	/** The write box, shown in place of the own card while editing. */
	editor: m.Children;
	editing: boolean;
	/** The student may send or edit (a table to write from, and the ballot not frozen yet). */
	canWrite: boolean;
	onToggleEdit: () => void;
}

/** "ההצעה שלי" pinned above the board, with "עריכה" until the Vote opens (IA 19.2). */
export function ownCardView(input: OwnCardInput): m.Children {
	if (input.editing && input.canWrite) {
		return m('.all-proposals__own', [
			input.editor,
			m(
				'button.btn.btn--secondary.btn--small',
				{ type: 'button', onclick: input.onToggleEdit },
				t('proposal.edit_done'),
			),
		]);
	}
	if (!input.mine) {
		return input.canWrite
			? m(
					'button.btn.btn--tertiary.btn--small.all-proposals__write',
					{ type: 'button', 'data-testid': 'all-proposals-write', onclick: input.onToggleEdit },
					t('allProposals.write_mine'),
				)
			: null;
	}

	return m(TextCard, {
		mine: true,
		eyebrow: t('proposal.mine'),
		text: input.mine.statement,
		replies: m(ReplyEntry, { proposal: input.mine, uid: input.mine.creatorId }),
		footer: input.canWrite
			? m(
					'button.btn.btn--secondary.btn--small',
					{ type: 'button', onclick: input.onToggleEdit },
					t('proposal.edit'),
				)
			: undefined,
	});
}
